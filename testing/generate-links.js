import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function csvEscape(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(headers, rows) {
  return [headers, ...rows.map((row) => row.map(csvEscape))].map((row) => row.join(",")).join("\n") + "\n";
}

const baseUrl = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const count = Number(process.env.COUNT ?? 1000);
const outputFile = resolve(process.env.OUTPUT_FILE ?? "testing/links.csv");
const failuresFile = /\.csv$/i.test(outputFile)
  ? outputFile.replace(/\.csv$/i, ".failures.csv")
  : `${outputFile}.failures.csv`;

if (!Number.isSafeInteger(count) || count < 1) {
  throw new Error("COUNT must be a positive integer");
}

const successes = [];
const failures = [];

for (let index = 0; index < count; index += 1) {
  const destination = `https://example.com/load-test/${Date.now()}-${index}`;
  try {
    const response = await fetch(`${baseUrl}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destination }),
    });
    const body = await response.json();
    if (!response.ok || !body.shortCode || !body.shortUrl) {
      failures.push([index, response.status, body.error ?? "Invalid creation response"]);
      continue;
    }
    successes.push([body.shortCode, destination, body.shortUrl]);
  } catch (error) {
    failures.push([index, "transport", error.message]);
  }
}

await Promise.all([
  writeFile(
    outputFile,
    toCsv(["shortCode", "destination", "shortUrl"], successes),
    "utf8",
  ),
  writeFile(
    failuresFile,
    toCsv(["index", "status", "error"], failures),
    "utf8",
  ),
]);

console.log(`Created ${successes.length} of ${count} links in ${outputFile}`);
if (failures.length > 0) {
  console.error(`${failures.length} link creations failed; details: ${failuresFile}`);
  process.exitCode = 1;
}
