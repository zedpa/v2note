#!/usr/bin/env node

/**
 * v2note CLI — ingest text or URL into v2note.
 *
 * Usage:
 *   node bin/v2note-cli.mjs "text to record"
 *   node bin/v2note-cli.mjs --url https://example.com "optional note"
 *   echo "text" | node bin/v2note-cli.mjs
 */

const args = process.argv.slice(2);

let text = "";
let url = "";
let gateway = "http://localhost:3001";
let token = "";

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--url" && i + 1 < args.length) {
    url = args[++i];
  } else if (arg === "--gateway" && i + 1 < args.length) {
    gateway = args[++i];
  } else if (arg === "--token" && i + 1 < args.length) {
    token = args[++i];
  } else if (arg === "--help" || arg === "-h") {
    console.log(`Usage: v2note-cli [options] [text]

Options:
  --url <url>         URL to import
  --gateway <url>     Gateway base URL (default: http://localhost:3001)
  --token <token>     Auth token (placeholder, not yet used)
  -h, --help          Show this help`);
    process.exit(0);
  } else if (!arg.startsWith("--")) {
    text = arg;
  }
}

// Read stdin if no positional text
if (!text && !process.stdin.isTTY) {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  text = Buffer.concat(chunks).toString("utf-8").trim();
}

if (!text && !url) {
  console.error("Error: provide text as argument, via stdin, or --url");
  process.exit(1);
}

// Build request body
const body = { type: url ? "url" : "text" };
if (url) {
  body.content = url;
  body.source_type = "material";
  if (text) {
    // Append note as metadata
    body.metadata = text;
  }
} else {
  body.content = text;
  body.source_type = "think";
}

const headers = { "Content-Type": "application/json", "x-device-id": "cli" };
if (token) {
  headers["Authorization"] = `Bearer ${token}`;
}

try {
  const res = await fetch(`${gateway}/api/v1/ingest`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(`Error (${res.status}):`, JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
} catch (err) {
  console.error("Request failed:", err.message);
  process.exit(1);
}
