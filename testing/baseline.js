import http from "k6/http";
import { check } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";
import { Counter, Rate, Trend } from "k6/metrics";

function parseCsvRow(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

const baseUrl = (__ENV.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const links = new SharedArray("short links", () => {
  const lines = open(__ENV.LINKS_CSV ?? "links.csv").trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("The link CSV must contain at least one short link");
  return lines.slice(1).map((line) => {
    const [shortCode, destination] = parseCsvRow(line);
    if (!shortCode || !destination) throw new Error("The link CSV contains an invalid row");
    return { shortCode, destination };
  });
});

const redirectLatency = new Trend("redirect_latency", true);
const creationLatency = new Trend("creation_latency", true);
const requestErrors = new Rate("request_errors");
const redirectErrors = new Rate("redirect_errors");
const creationErrors = new Rate("creation_errors");
const successfulRedirects = new Counter("successful_redirects");
const successfulCreations = new Counter("successful_link_creations");

export const options = {
  scenarios: {
    baseline: {
      executor: "constant-arrival-rate",
      rate: 1,
      timeUnit: "1s",
      duration: __ENV.DURATION ?? "5m",
      preAllocatedVUs: 2,
      maxVUs: 10,
    },
  },
  thresholds: {
    redirect_latency: ["p(90)<100"],
    creation_latency: ["p(90)<500"],
    request_errors: ["rate<0.01"],
    redirect_errors: ["rate<0.01"],
    creation_errors: ["rate<0.01"],
  },
};

export default function () {
  if (exec.scenario.iterationInTest % 20 === 19) {
    const destination = `https://example.com/performance/${__VU}-${__ITER}-${Date.now()}`;
    const response = http.post(
      `${baseUrl}/link`,
      JSON.stringify({ destination }),
      { headers: { "Content-Type": "application/json" }, tags: { endpoint: "create" } },
    );
    creationLatency.add(response.timings.duration);
    const success = check(response, {
      "creation returns 201": (result) => result.status === 201,
      "creation returns a short code and URL": (result) => {
        if (result.status !== 201) return false;
        const body = result.json();
        return /^[0-9A-Za-z_-]{6}$/.test(body.shortCode) && Boolean(body.shortUrl);
      },
    });
    creationErrors.add(!success);
    requestErrors.add(!success);
    if (success) successfulCreations.add(1);
    return;
  }

  const link = links[Math.floor(Math.random() * links.length)];
  const response = http.get(`${baseUrl}/link/${link.shortCode}`, {
    redirects: 0,
    tags: { endpoint: "redirect" },
  });
  redirectLatency.add(response.timings.duration);
  const success = check(response, {
    "redirect returns 302": (result) => result.status === 302,
    "redirect location matches the stored destination": (result) =>
      result.headers.Location === link.destination,
  });
  redirectErrors.add(!success);
  requestErrors.add(!success);
  if (success) successfulRedirects.add(1);
}
