import { setTimeout as delay } from "node:timers/promises";

const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const timeoutMs = Number(process.env.FRESHNESS_TIMEOUT_MS ?? 30_000);
const requestedAt = Date.now();

if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000) {
  throw new Error("FRESHNESS_TIMEOUT_MS must be an integer of at least 1000");
}

const createResponse = await fetch(`${baseUrl}/link`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    destination: `https://example.com/freshness/${Date.now()}`,
  }),
});
const created = await createResponse.json();
if (!createResponse.ok || !created.shortCode) {
  throw new Error(`Could not create a freshness-check link: ${created.error ?? createResponse.status}`);
}

const redirectResponse = await fetch(`${baseUrl}/link/${created.shortCode}`, {
  redirect: "manual",
});
if (redirectResponse.status !== 302) {
  throw new Error(`Expected a 302 redirect for freshness check, received ${redirectResponse.status}`);
}

const deadline = Date.now() + timeoutMs;
while (Date.now() <= deadline) {
  const params = new URLSearchParams({
    fromdate: new Date(requestedAt - 1_000).toISOString(),
    todate: new Date(Date.now() + 1_000).toISOString(),
    span: "1s",
    shortcode: created.shortCode,
  });
  const graphResponse = await fetch(`${baseUrl}/graph?${params}`, {
    signal: AbortSignal.timeout(5_000),
  });
  const graph = await graphResponse.json();
  if (!graphResponse.ok) {
    throw new Error(`Analytics query failed: ${graph.error ?? graphResponse.status}`);
  }

  const hasEvent = (type) =>
    graph.series.find((series) => series.type === type).points.some((point) => point.count > 0);
  if (hasEvent("create") && hasEvent("click")) {
    console.log(`Create and click events became visible within ${Date.now() - requestedAt}ms`);
    process.exit(0);
  }
  await delay(1_000);
}

throw new Error(`Creation and click events did not appear in analytics within ${timeoutMs}ms`);
