/**
 * HTTP server — HTML departure board + JSON API.
 *
 * GET /                  → HTML board (human-readable)
 * GET /api/departures    → JSON (for widgets, apps)
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

async function getDepartures(stops, windowMinutes) {
    return Promise.all(
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
}

function renderHtml(stopResults, windowMinutes) {
    const rows = stopResults.flatMap(({ stop, departures, error }) => {
        const header = `<tr><th colspan="4">${htmlEscape(stop.name)} (${htmlEscape(stop.stopId)})</th></tr>`;
        if (error) {
            return [header, `<tr><td colspan="4" class="error">${htmlEscape(error)}</td></tr>`];
        }
        if (departures.length === 0) {
            return [header, `<tr><td colspan="4" class="dim">no departures in the next ${windowMinutes} minutes</td></tr>`];
        }
        return [
            header,
            ...departures.slice(0, 15).map(
                (d) => `<tr>
          <td><strong>${htmlEscape(d.routeShortName)}</strong></td>
          <td>${htmlEscape(d.headsign)}</td>
          <td>${formatTime(d.time)}</td>
          <td>${d.isRealtime ? `+${Math.round(d.delaySeconds / 60)} min` : "scheduled"}</td>
        </tr>`
            ),
        ];
    });

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="30">
  <title>Brno Tram Display</title>
  <style>
    body { font-family: system-ui; max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #1a5f7a; color: #fff; }
    .error { color: #c00; }
    .dim { color: #999; }
  </style>
</head>
<body>
  <h1>Brno Tram Display</h1>
  <p style="color:#999;font-size:0.85rem">updated ${new Date().toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" })} · auto-refreshes every 30s</p>
  <table><tbody>${rows.join("")}</tbody></table>
</body>
</html>`;
}

function renderJson(stopResults) {
    const updatedAt = new Date().toISOString();
    return JSON.stringify({
        updatedAt,
        stops: stopResults.map(({ stop, departures, error }) => ({
            stopId: stop.stopId,
            name: stop.name,
            error: error ?? null,
            departures: departures.slice(0, 15).map((d) => ({
                line: d.routeShortName,
                headsign: d.headsign,
                // ISO timestamp — easiest to parse in any language/widget
                time: d.time.toISOString(),
                // convenience: minutes from now (negative = already departed)
                minutesFromNow: Math.round((d.time - new Date()) / 60000),
                isRealtime: d.isRealtime,
                delayMinutes: Math.round(d.delaySeconds / 60),
            })),
        })),
    });
}

async function handleRequest(stops, windowMinutes, url) {
    if (url === "/api/departures") {
        const stopResults = await getDepartures(stops, windowMinutes);
        return {
            status: 200,
            contentType: "application/json; charset=utf-8",
            body: renderJson(stopResults),
        };
    }

    if (url === "/" || url === "/index.html") {
        const stopResults = await getDepartures(stops, windowMinutes);
        return {
            status: 200,
            contentType: "text/html; charset=utf-8",
            body: renderHtml(stopResults, windowMinutes),
        };
    }

    return { status: 404, contentType: "text/plain", body: "Not found" };
}

export function startWebServer(stops, port, windowMinutes = 90) {
    const server = http.createServer(async (req, res) => {
        // strip query string for routing
        const url = (req.url ?? "/").split("?")[0];
        try {
            const { status, contentType, body } = await handleRequest(stops, windowMinutes, url);
            res.writeHead(status, { "Content-Type": contentType });
            res.end(body);
        } catch (err) {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("internal error");
        }
    });

    server.listen(port, () => {
        console.log(`web server running:`);
        console.log(`  http://localhost:${port}          HTML board`);
        console.log(`  http://localhost:${port}/api/departures  JSON API`);
    });

    return server;
}