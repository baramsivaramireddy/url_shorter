import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createDatabase } from "./database.js";
import { createApp } from "./server.js";

let database;
let server;
let origin;

beforeEach(async () => {
  database = createDatabase(":memory:");
  const app = createApp({
    database,
    codeGenerator: () => "abc123",
    publicBaseUrl: "https://short.test",
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  database.close();
});

test("creates a link, records its event, and redirects with a click event", async () => {
  const createResponse = await fetch(`${origin}/link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ destination: "https://example.com/a/path" }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.shortCode, "abc123");
  assert.equal(created.shortUrl, "https://short.test/link/abc123");
  assert.equal(created.destination, "https://example.com/a/path");

  const redirectResponse = await fetch(`${origin}/link/abc123`, {
    redirect: "manual",
  });
  assert.equal(redirectResponse.status, 302);
  assert.equal(redirectResponse.headers.get("location"), "https://example.com/a/path");

  const eventCounts = database
    .prepare("SELECT type, COUNT(*) AS count FROM analytics_events GROUP BY type ORDER BY type")
    .all();
  assert.deepEqual(
    eventCounts.map(({ type, count }) => [type, Number(count)]),
    [
      ["click", 1],
      ["create", 1],
    ],
  );
});

test("rejects malformed or unsafe destinations without recording a link", async () => {
  for (const destination of ["not a url", "javascript:alert(1)", "ftp://example.com"]) {
    const response = await fetch(`${origin}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destination }),
    });
    assert.equal(response.status, 400);
  }
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM links").get().count, 0);
});

test("returns 404 for unknown short codes", async () => {
  const response = await fetch(`${origin}/link/missing`);
  assert.equal(response.status, 404);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM analytics_events").get().count, 0);
});

test("aggregates create and click events into time buckets and filters by short code", async () => {
  const firstLink = database
    .prepare("INSERT INTO links (short_code, destination, created_at) VALUES (?, ?, ?)")
    .run("abc123", "https://first.example", Date.now());
  const secondLink = database
    .prepare("INSERT INTO links (short_code, destination, created_at) VALUES (?, ?, ?)")
    .run("def456", "https://second.example", Date.now());
  const firstLinkId = Number(firstLink.lastInsertRowid);
  const secondLinkId = Number(secondLink.lastInsertRowid);
  const start = Date.parse("2026-10-31T12:00:00.000Z");
  const addEvent = database.prepare(
    "INSERT INTO analytics_events (link_id, type, timestamp) VALUES (?, ?, ?)",
  );
  addEvent.run(firstLinkId, "create", start + 60_000);
  addEvent.run(firstLinkId, "click", start + 2 * 60_000);
  addEvent.run(firstLinkId, "click", start + 6 * 60_000);
  addEvent.run(secondLinkId, "click", start + 3 * 60_000);

  const params = new URLSearchParams({
    fromdate: new Date(start).toISOString(),
    todate: new Date(start + 10 * 60_000).toISOString(),
    span: "5m",
    shortcode: "abc123",
  });
  const response = await fetch(`${origin}/graph?${params}`);
  assert.equal(response.status, 200);
  const graph = await response.json();
  assert.equal(graph.series.length, 2);
  assert.deepEqual(
    graph.series.map(({ type, points }) => [
      type,
      points.map(({ timestamp, count }) => [timestamp, count]),
    ]),
    [
      [
        "create",
        [
          ["2026-10-31T12:00:00.000Z", 1],
          ["2026-10-31T12:05:00.000Z", 0],
        ],
      ],
      [
        "click",
        [
          ["2026-10-31T12:00:00.000Z", 1],
          ["2026-10-31T12:05:00.000Z", 1],
        ],
      ],
    ],
  );
});

test("rejects malformed analytics ranges", async () => {
  const response = await fetch(
    `${origin}/graph?fromdate=2026-10-31&todate=2026-11-01&span=5m`,
  );
  assert.equal(response.status, 400);
});

test("persists links and events after the database is reopened", () => {
  const directory = mkdtempSync(join(tmpdir(), "shortener-test-"));
  const databasePath = join(directory, "links.sqlite");
  try {
    const firstDatabase = createDatabase(databasePath);
    firstDatabase
      .prepare("INSERT INTO links (short_code, destination, created_at) VALUES (?, ?, ?)")
      .run("saved1", "https://persisted.example", Date.now());
    const linkId = firstDatabase.prepare("SELECT id FROM links WHERE short_code = ?").get("saved1").id;
    firstDatabase
      .prepare("INSERT INTO analytics_events (link_id, type, timestamp) VALUES (?, ?, ?)")
      .run(linkId, "create", Date.now());
    firstDatabase.close();

    const reopenedDatabase = createDatabase(databasePath);
    assert.equal(
      reopenedDatabase.prepare("SELECT destination FROM links WHERE short_code = ?").get("saved1")
        .destination,
      "https://persisted.example",
    );
    assert.equal(
      reopenedDatabase.prepare("SELECT COUNT(*) AS count FROM analytics_events").get().count,
      1,
    );
    reopenedDatabase.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("retries unique-code conflicts up to three attempts", async () => {
  database.prepare(
    "INSERT INTO links (short_code, destination, created_at) VALUES (?, ?, ?)",
  ).run("abc123", "https://existing.example", Date.now());
  let attempts = 0;
  const app = createApp({
    database,
    codeGenerator: () => {
      attempts += 1;
      return "abc123";
    },
  });
  const conflictServer = app.listen(0);
  await new Promise((resolve) => conflictServer.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${conflictServer.address().port}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destination: "https://example.com" }),
    });
    assert.equal(response.status, 500);
    assert.equal(attempts, 3);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM links").get().count, 1);
  } finally {
    await new Promise((resolve, reject) =>
      conflictServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
