/**
 * Brno tram display — entry point.
 * Runs terminal display on a polling loop + HTTP web server in parallel.
 * Uses KORDIS GTFS + Brno ArcGIS vehicle positions — no API key required.
 *
 * Configure stops via the STOPS environment variable (JSON array) or src/config/stops.js.
 * Each stop supports:
 *   stopId    — GTFS stop_id (required)
 *   name      — display label (required)
 *   direction — headsign substring filter, accent/case-insensitive (optional)
 *   lines     — array of routeShortName strings to include, e.g. ["3","7"] (optional)
 */

import { fetchDepartures, configure } from "./src/adapters/kordis.js";
import { STOPS as STOPS_FROM_CONFIG } from "./src/config/stops.js";
import { startWebServer } from "./src/display/web.js";

const POLL_INTERVAL_MS          = parseInt(process.env.POLL_INTERVAL_MS          || "30000",   10);
const DEPARTURES_PER_STOP       = parseInt(process.env.DEPARTURES_PER_STOP       || "10",      10);
const DEPARTURES_WINDOW_MINUTES = parseInt(process.env.DEPARTURES_WINDOW_MINUTES || "90",      10);
const GTFS_REFRESH_INTERVAL_MS  = parseInt(process.env.GTFS_REFRESH_INTERVAL_MS  || "86400000",10);
const PORT                      = parseInt(process.env.PORT                      || "3000",    10);
const DISPLAY_MODE              = process.env.DISPLAY_MODE || "default"; // "default" | "web" | "both"

/**
 * Resolve stop list: STOPS env var (JSON) takes priority over config file.
 */
function resolveStops() {
    if (process.env.STOPS) {
        try {
            const parsed = JSON.parse(process.env.STOPS);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            throw new Error("STOPS must be a non-empty JSON array");
        } catch (err) {
            throw new Error(`invalid STOPS env var: ${err.message}`);
        }
    }
    return STOPS_FROM_CONFIG;
}

const STOPS = resolveStops();

// ansi colours
const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const RED    = "\x1b[31m";

configure({
    gtfsRefreshIntervalMs: GTFS_REFRESH_INTERVAL_MS,
    windowMinutes: DEPARTURES_WINDOW_MINUTES,
});

function formatTime(date) {
    return date.toLocaleTimeString("cs-CZ", {
        timeZone: "Europe/Prague",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function formatDelay(delaySeconds, isRealtime) {
    if (!isRealtime) return `${DIM}[scheduled]${RESET}`;
    const mins = Math.round(delaySeconds / 60);
    if (mins === 0) return `${GREEN}on time${RESET}`;
    if (mins > 0)   return `${YELLOW}+${mins} min${RESET}`;
    return `${GREEN}${Math.abs(mins)} min early${RESET}`;
}

function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Apply direction and lines filters to a departure list.
 */
function applyFilters(departures, { direction, lines }) {
    let result = departures;
    if (direction) {
        const needle = norm(direction);
        result = result.filter((dep) => norm(dep.headsign).includes(needle));
    }
    if (lines && lines.length > 0) {
        const allowed = new Set(lines.map(String));
        result = result.filter((dep) => allowed.has(String(dep.routeShortName)));
    }
    return result;
}

function filterLabel(stop) {
    const parts = [];
    if (stop.direction) parts.push(`→ ${stop.direction}`);
    if (stop.lines && stop.lines.length > 0) parts.push(`line ${stop.lines.join("/")}`);
    return parts.length > 0 ? `  ${parts.join("  ")}` : "";
}

function renderTerminal(stopResults) {
    process.stdout.write("\x1b[2J\x1b[H");
    const now = new Date();
    console.log(`${BOLD}${CYAN}Brno Tram Display${RESET}  ${DIM}updated ${formatTime(now)}${RESET}\n`);

    for (const { stop, departures, error } of stopResults) {
        console.log(`${BOLD}${stop.name}${RESET}${CYAN}${filterLabel(stop)}${RESET}  ${DIM}(${stop.stopId})${RESET}`);
        console.log("─".repeat(60));
        if (error) {
            console.log(`  ${RED}error: ${error}${RESET}`);
        } else if (departures.length === 0) {
            console.log(`  ${DIM}no departures in the next ${DEPARTURES_WINDOW_MINUTES} minutes${RESET}`);
        } else {
            for (const dep of departures.slice(0, DEPARTURES_PER_STOP)) {
                const line  = `${BOLD}${dep.routeShortName.padEnd(4)}${RESET}`;
                const dest  = dep.headsign.padEnd(30);
                const time  = formatTime(dep.time);
                const delay = formatDelay(dep.delaySeconds, dep.isRealtime);
                console.log(`  ${line} ${dest} ${CYAN}${time}${RESET}  ${delay}`);
            }
        }
        console.log();
    }
}

async function fetchAllStops() {
    return Promise.all(
        STOPS.map(async (stop) => {
            try {
                let departures = await fetchDepartures(stop.stopId, null, {
                    windowMinutes: DEPARTURES_WINDOW_MINUTES,
                });
                departures = applyFilters(departures, stop);
                departures.sort((a, b) => a.time - b.time);
                return { stop, departures, error: null };
            } catch (err) {
                console.error(`error fetching stop ${stop.stopId}:`, err.message);
                return { stop, departures: [], error: err.message };
            }
        })
    );
}

async function tick() {
    const results = await fetchAllStops();
    // terminal output unless web-only mode
    if (DISPLAY_MODE !== "web") {
        renderTerminal(results);
    }
}

async function main() {
    const stopSummary = STOPS.map((s) => `${s.name}${filterLabel(s)}`).join(", ");
    console.log(`brno-tram-display starting — ${STOPS.length} stop(s): ${stopSummary}`);
    console.log(`polling every ${POLL_INTERVAL_MS / 1000}s\n`);
    console.log("downloading GTFS data (first run may take a few seconds)…\n");

    // start web server unless terminal-only mode
    if (DISPLAY_MODE !== "default") {
        startWebServer(STOPS, PORT);
    }

    await tick();
    setInterval(tick, POLL_INTERVAL_MS);
}

main().catch((err) => {
    console.error("fatal:", err);
    process.exit(1);
});