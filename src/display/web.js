/**
 * HTTP server. Routing only — data and rendering live in their own modules.
 *
 * GET /                  → HTML board
 * GET /api/departures    → JSON
 */

import http from "http";
import { getAllDepartures, getWeather } from "./web-data.js";
import { renderHtml, renderJson } from "./web-renderer.js";

async function handleRequest(stops, windowMinutes, url) {
  if (url === "/api/departures") {
    const deps = await getAllDepartures(stops, windowMinutes);
    return { status: 200, contentType: "application/json; charset=utf-8", body: renderJson(deps) };
  }

  if (url === "/" || url === "/index.html") {
    // fetch data in parallel — weather failure must not block departures
    const [deps, temp] = await Promise.all([
      getAllDepartures(stops, windowMinutes),
      getWeather(),
    ]);
    return { status: 200, contentType: "text/html; charset=utf-8", body: renderHtml(deps, temp) };
  }

  return { status: 404, contentType: "text/plain", body: "Not found" };
}

export function startWebServer(stops, port, windowMinutes = 90) {
  const server = http.createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    const t0 = Date.now();
    try {
      const { status, contentType, body } = await handleRequest(stops, windowMinutes, url);
      res.writeHead(status, { "Content-Type": contentType });
      res.end(body);
      console.log(`[web] ${req.method} ${url} ${status} ${Date.now() - t0}ms`);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("internal error");
      console.error(`[web] ${req.method} ${url} 500 ${Date.now() - t0}ms —`, err.message);
    }
  });

  server.listen(port, () => {
    console.log(`web server running:`);
    console.log(`  http://localhost:${port}                 HTML board`);
    console.log(`  http://localhost:${port}/api/departures  JSON API`);
  });

  return server;
}
