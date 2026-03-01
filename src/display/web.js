/**
 * HTTP web server for departure display.
 */

import http from "http";
import { fetchDepartures } from "../adapters/kordis.js";
import { applyFilters } from "./terminal.js";

function htmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(date) {
  return date.toLocaleTimeString("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

async function handleRequest(stops, windowMinutes, url) {
  if (url === "/" || url === "/index.html") {
    const stopResults = await Promise.all(
      stops.map(async (stop) => {
        try {
          let deps = await fetchDepartures(stop.stopId, null, { windowMinutes });
          deps = applyFilters(deps, stop);
          deps.sort((a, b) => a.time - b.time);
          return { stop, departures: deps, error: null };
        } catch (err) {
          return { stop, departures: [], error: err.message };
        }
      })
    );

    const rows = stopResults.flatMap(({ stop, departures, error }) => {
      const header = `<tr><th colspan="4">${htmlEscape(stop.name)} (${htmlEscape(stop.stopId)})</th></tr>`;
      if (error) {
        return [header, `<tr><td colspan="4" class="error">${htmlEscape(error)}</td></tr>`];
      }
      const body = departures.slice(0, 15).map(
        (d) =>
          `<tr><td>${htmlEscape(d.routeShortName)}</td><td>${htmlEscape(d.headsign)}</td><td>${formatTime(d.time)}</td><td>${d.isRealtime ? `+${Math.round(d.delaySeconds / 60)} min` : "scheduled"}</td></tr>`
      );
      return [header, ...body];
    });

    return {
      status: 200,
      body: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Brno Tram Display</title>
<style>
body{font-family:system-ui;max-width:600px;margin:2rem auto;padding:0 1rem}
table{width:100%;border-collapse:collapse}
th,td{padding:0.5rem;text-align:left;border-bottom:1px solid #eee}
th{background:#1a5f7a;color:#fff}
.error{color:#c00}
</style>
</head>
<body>
<h1>Brno Tram Display</h1>
<table><tbody>${rows.join("")}</tbody></table>
</body>
</html>`,
    };
  }
  return { status: 404, body: "Not found" };
}

export function startWebServer(stops, port, windowMinutes = 90) {
  const server = http.createServer(async (req, res) => {
    try {
      const { status, body } = await handleRequest(stops, windowMinutes, req.url ?? "/");
      res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
      res.end(body);
    } catch (err) {
      res.writeHead(500);
      res.end("Internal error");
    }
  });
  server.listen(port, () => {
    console.log(`web server http://localhost:${port}`);
  });
  return server;
}
