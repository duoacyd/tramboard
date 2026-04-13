/**
 * HTTP server — minimal dark departure board + JSON API.
 *
 * GET /                  → HTML board
 * GET /api/departures    → JSON
 */

import http from "http";
import { fetchDepartures } from "../adapters/kordis.js";
import { applyFilters } from "./terminal.js";

const TIMEZONE = "Europe/Prague";
const MAX_ROWS = 5;

function htmlEscape(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatTime(date) {
    return date.toLocaleTimeString("cs-CZ", {
        timeZone: TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

async function getAllDepartures(stops, windowMinutes) {
    const results = await Promise.all(
        stops.map(async (stop) => {
            try {
                let deps = await fetchDepartures(stop.stopId, null, { windowMinutes });
                deps = applyFilters(deps, stop);
                return deps.map((d) => ({ ...d, stopName: stop.name }));
            } catch {
                return [];
            }
        })
    );

    return results
        .flat()
        .sort((a, b) => a.time - b.time)
        .slice(0, MAX_ROWS);
}

function renderHtml(departures) {
    const rows = departures.map((d) => {
        const iso = d.time.toISOString();
        return `<tr>
  <td>${htmlEscape(d.stopName)}</td>
  <td>${htmlEscape(d.routeShortName)}</td>
  <td>${htmlEscape(d.headsign)}</td>
  <td>${formatTime(d.time)}</td>
  <td class="mins" data-time="${iso}">—</td>
</tr>`;
    }).join("");

    return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<meta http-equiv="refresh" content="30">
<title>Trams</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{
  background:#0d0d0d;
  color:#c8c8c8;
  font-family:monospace;
  font-size:22px;
  padding:24px;
}
table{
  width:100%;
  border-collapse:collapse;
}
th{
  text-align:left;
  font-size:13px;
  color:#555;
  letter-spacing:.1em;
  text-transform:uppercase;
  padding:0 0 12px;
  border-bottom:1px solid #222;
}
td{
  padding:14px 0;
  border-bottom:1px solid #1a1a1a;
  vertical-align:middle;
}
td:nth-child(1){color:#888;font-size:16px;padding-right:20px;white-space:nowrap}
td:nth-child(2){font-weight:700;color:#fff;padding-right:16px;width:52px}
td:nth-child(3){color:#c8c8c8;padding-right:20px}
td:nth-child(4){color:#fff;white-space:nowrap;width:60px}
td:nth-child(5){color:#555;font-size:16px;text-align:right;white-space:nowrap;width:70px}
</style>
</head>
<body>
<table>
<thead><tr>
  <th>stop</th>
  <th>line</th>
  <th>to</th>
  <th>time</th>
  <th></th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
<script>
(function(){
  function tick(){
    document.querySelectorAll('.mins[data-time]').forEach(function(el){
      var diff=Math.round((new Date(el.dataset.time)-new Date())/60000);
      el.textContent=diff<=0?'now':'in '+diff+'m';
    });
  }
  tick();
  setInterval(tick,15000);
})();
</script>
</body>
</html>`;
}

function renderJson(departures) {
    return JSON.stringify({
        updatedAt: new Date().toISOString(),
        departures: departures.map((d) => ({
            stop: d.stopName,
            line: d.routeShortName,
            headsign: d.headsign,
            time: d.time.toISOString(),
            minutesFromNow: Math.round((d.time - new Date()) / 60000),
            isRealtime: d.isRealtime,
            delayMinutes: Math.round(d.delaySeconds / 60),
        })),
    });
}

async function handleRequest(stops, windowMinutes, url) {
    if (url === "/api/departures") {
        const deps = await getAllDepartures(stops, windowMinutes);
        return { status: 200, contentType: "application/json; charset=utf-8", body: renderJson(deps) };
    }

    if (url === "/" || url === "/index.html") {
        const deps = await getAllDepartures(stops, windowMinutes);
        return { status: 200, contentType: "text/html; charset=utf-8", body: renderHtml(deps) };
    }

    return { status: 404, contentType: "text/plain", body: "Not found" };
}

export function startWebServer(stops, port, windowMinutes = 90) {
    const server = http.createServer(async (req, res) => {
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