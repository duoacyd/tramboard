/**
 * HTTP server. Routing only — data and rendering live in their own modules.
 *
 * GET /                  → HTML board
 * GET /api/departures    → JSON
 * GET /api/rows          → HTML <tr> fragment (HTMX, fingerprinted via X-Rows-Fingerprint)
 * GET /api/weather       → JSON  { tempCelsius, sunrise, sunset }
 */

import http from "http";
import { getAllDepartures, getWeather } from "./web-data.js";
import { renderHtml, renderJson, renderRows } from "./web-renderer.js";

// explicit allowlist — never resolve arbitrary filenames from user input
const STATIC_FILES = new Set(["Albert_logo.svg.png", "Lidl-Logo.svg.png", "City-icon.png"]);

async function serveStatic(filename) {
  if (!STATIC_FILES.has(filename)) {
    return { status: 404, contentType: "text/plain", body: "Not found" };
  }
  const { readFile } = await import("fs/promises");
  const { join, resolve, dirname } = await import("path");
  const { fileURLToPath } = await import("url");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const filePath = resolve(join(__dirname, "../../res", filename));
  try {
    const data = await readFile(filePath);
    return { status: 200, contentType: "image/png", body: data, extraHeaders: { "Cache-Control": "public, max-age=604800, immutable" } };
  } catch {
    return { status: 404, contentType: "text/plain", body: "Not found" };
  }
}

function rowsFingerprint(deps) {
  return deps.map(d => d.tripId ?? `${d.routeShortName}|${d.stopName}|${d.time.toISOString()}`).join(",");
}

async function handleRequest(stops, windowMinutes, url, headers) {
  if (url.startsWith("/res/")) {
    return serveStatic(url.slice(5));
  }

  if (url === "/api/rows") {
    const deps = await getAllDepartures(stops, windowMinutes);
    const fp = rowsFingerprint(deps);
    if ((headers["x-rows-fingerprint"] ?? "") === fp) {
      return { status: 204, contentType: "text/plain", body: "" };
    }
    return { status: 200, contentType: "text/html; charset=utf-8", body: renderRows(deps), extraHeaders: { "X-Rows-Fingerprint": fp } };
  }

  if (url === "/api/departures") {
    const deps = await getAllDepartures(stops, windowMinutes);
    return { status: 200, contentType: "application/json; charset=utf-8", body: renderJson(deps) };
  }

  if (url === "/api/weather") {
    const w = await getWeather();
    return { status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify({
      tempCelsius: w?.temp ?? null,
      sunrise: w?.sunrise ?? null,
      sunset:  w?.sunset  ?? null,
    }) };
  }

  if (url === "/" || url === "/index.html") {
    const [deps, weather] = await Promise.all([
      getAllDepartures(stops, windowMinutes),
      getWeather(),
    ]);
    return { status: 200, contentType: "text/html; charset=utf-8", body: renderHtml(deps, weather) };
  }

  return { status: 404, contentType: "text/plain", body: "Not found" };
}

export function startWebServer(stops, port, windowMinutes = 90) {
  const server = http.createServer(async (req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    const t0 = Date.now();
    try {
      const { status, contentType, body, extraHeaders } = await handleRequest(stops, windowMinutes, url, req.headers);
      res.writeHead(status, { "Content-Type": contentType, ...extraHeaders });
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
