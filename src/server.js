import { randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { createDatabase } from "./database.js";

const CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-";
const SHORT_CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 3;
const SHORT_CODE_PATTERN = /^[0-9A-Za-z_-]{6}$/;
const FRONTEND_DIRECTORY = fileURLToPath(new URL("../dist", import.meta.url));

export function generateShortCode() {
  return Array.from({ length: SHORT_CODE_LENGTH }, () =>
    CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join("");
}

function isValidDestination(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const destination = new URL(value);
    return (
      ["http:", "https:"].includes(destination.protocol) &&
      destination.hostname.length > 0 &&
      !destination.username &&
      !destination.password
    );
  } catch {
    return false;
  }
}

function parseIsoDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
  ) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseSpan(value) {
  const match = typeof value === "string" && /^([1-9]\d*)(s|m|h|d)$/.exec(value);
  if (!match) return null;
  const multiplier = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  const milliseconds = Number(match[1]) * multiplier;
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
}

function isUniqueCodeConflict(error) {
  return (
    error?.code === "SQLITE_CONSTRAINT_UNIQUE" &&
    String(error.message).includes("links.short_code")
  );
}

export function createApp({
  database = createDatabase(),
  codeGenerator = generateShortCode,
  publicBaseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
} = {}) {
  const app = express();
  const baseUrl = publicBaseUrl.replace(/\/+$/, "");

  const insertLink = database.prepare(
    "INSERT INTO links (short_code, destination, created_at) VALUES (?, ?, ?)",
  );
  const insertEvent = database.prepare(
    "INSERT INTO analytics_events (link_id, type, timestamp) VALUES (?, ?, ?)",
  );
  const findLink = database.prepare(
    "SELECT id, short_code, destination FROM links WHERE short_code = ?",
  );
  const findLinkId = database.prepare("SELECT id FROM links WHERE short_code = ?");

  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  app.post("/link", (request, response, next) => {
    const { destination } = request.body ?? {};
    if (!isValidDestination(destination)) {
      response.status(400).json({
        error: "destination must be a valid absolute HTTP or HTTPS URL",
      });
      return;
    }

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const shortCode = codeGenerator();
      if (!SHORT_CODE_PATTERN.test(shortCode)) {
        next(new Error("Short-code generator returned an invalid code"));
        return;
      }

      try {
        const createLinkAndEvent = database.transaction(() => {
          const result = insertLink.run(shortCode, destination, Date.now());
          insertEvent.run(Number(result.lastInsertRowid), "create", Date.now());
          return Number(result.lastInsertRowid);
        });
        const id = createLinkAndEvent.immediate();
        response.status(201).json({
          id: String(id),
          shortCode,
          shortUrl: `${baseUrl}/link/${shortCode}`,
          destination,
        });
        return;
      } catch (error) {
        if (isUniqueCodeConflict(error)) continue;
        next(error);
        return;
      }
    }

    next(new Error("Unable to generate a unique short code after three attempts"));
  });

  app.get("/link/:shortCode", (request, response, next) => {
    const link = findLink.get(request.params.shortCode);
    if (!link) {
      response.status(404).json({ error: "Short link not found" });
      return;
    }

    try {
      insertEvent.run(Number(link.id), "click", Date.now());
    } catch (error) {
      next(error);
      return;
    }
    response.redirect(302, link.destination);
  });

  app.get("/graph", (request, response, next) => {
    const fromDate = parseIsoDate(request.query.fromdate);
    const toDate = parseIsoDate(request.query.todate);
    const spanMs = parseSpan(request.query.span);
    const shortCode = request.query.shortcode;
    if (
      fromDate === null ||
      toDate === null ||
      toDate <= fromDate ||
      spanMs === null ||
      (shortCode !== undefined &&
        (typeof shortCode !== "string" || !SHORT_CODE_PATTERN.test(shortCode)))
    ) {
      response.status(400).json({
        error: "fromdate, todate, and span must be valid; todate must follow fromdate",
      });
      return;
    }

    const firstBucket = Math.floor(fromDate / spanMs) * spanMs;
    const bucketCount = Math.ceil(toDate / spanMs) - Math.floor(fromDate / spanMs);
    if (bucketCount > 2000) {
      response.status(400).json({ error: "The requested range contains too many buckets" });
      return;
    }

    try {
      const linkId =
        shortCode === undefined ? undefined : findLinkId.get(shortCode)?.id ?? null;
      const events =
        linkId === null
          ? []
          : database
              .prepare(
                `SELECT type, CAST(timestamp / ? AS INTEGER) * ? AS bucket, COUNT(*) AS count
                 FROM analytics_events
                 WHERE timestamp >= ? AND timestamp < ?
                   ${shortCode === undefined ? "" : "AND link_id = ?"}
                 GROUP BY type, bucket`,
              )
              .all(
                spanMs,
                spanMs,
                fromDate,
                toDate,
                ...(shortCode === undefined ? [] : [linkId]),
              );

      const counts = new Map(
        events.map((event) => [`${event.type}:${event.bucket}`, Number(event.count)]),
      );
      const series = ["create", "click"].map((type) => ({
        type,
        points: Array.from({ length: bucketCount }, (_, index) => {
          const timestamp = firstBucket + index * spanMs;
          return {
            timestamp: new Date(timestamp).toISOString(),
            count: counts.get(`${type}:${timestamp}`) ?? 0,
          };
        }),
      }));

      response.json({
        fromDate: new Date(fromDate).toISOString(),
        toDate: new Date(toDate).toISOString(),
        span: request.query.span,
        series,
      });
    } catch (error) {
      next(error);
    }
  });

  if (existsSync(FRONTEND_DIRECTORY)) {
    app.use(express.static(FRONTEND_DIRECTORY));
    app.get("/", (_request, response) => {
      response.sendFile(`${FRONTEND_DIRECTORY}/index.html`);
    });
  }

  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });

  app.use((error, _request, response, _next) => {
    if (response.headersSent) return;
    if (error?.type === "entity.parse.failed") {
      response.status(400).json({ error: "Malformed JSON request" });
      return;
    }
    console.error("Request failed:", error);
    response.status(500).json({ error: "Internal server error" });
  });

  return app;
}

export function startServer() {
  const port = Number(process.env.PORT ?? 3000);
  const app = createApp();
  const server = createServer(app);
  server.listen(port, "0.0.0.0", () => {
    console.log(`URL shortener listening on port ${port}`);
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer();
}
