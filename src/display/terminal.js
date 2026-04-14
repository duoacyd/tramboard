/**
 * Terminal display rendering.
 */

import { normalizeForSearch } from "../utils/string.js";
import { TIMEZONE } from "../config/constants.js";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";

export function formatTime(date) {
  return date.toLocaleTimeString("cs-CZ", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDelay(delaySeconds, isRealtime) {
  if (!isRealtime) return `${DIM}[scheduled]${RESET}`;
  const mins = Math.round(delaySeconds / 60);
  if (mins === 0) return `${GREEN}on time${RESET}`;
  if (mins > 0) return `${YELLOW}+${mins} min${RESET}`;
  return `${GREEN}${Math.abs(mins)} min early${RESET}`;
}

export function applyFilters(departures, { direction, lines, excludeLines }) {
  let result = departures;
  if (direction) {
    const needle = normalizeForSearch(direction);
    result = result.filter((dep) => normalizeForSearch(dep.headsign).includes(needle));
  }
  if (lines?.length > 0) {
    const allowed = new Set(lines.map(String));
    result = result.filter((dep) => allowed.has(String(dep.routeShortName)));
  }
  if (excludeLines?.length > 0) {
    const blocked = new Set(excludeLines.map(String));
    result = result.filter((dep) => !blocked.has(String(dep.routeShortName)));
  }
  return result;
}

export function filterLabel(stop) {
  const parts = [];
  if (stop.direction) parts.push(`→ ${stop.direction}`);
  if (stop.lines?.length > 0) parts.push(`line ${stop.lines.join("/")}`);
  return parts.length > 0 ? `  ${parts.join("  ")}` : "";
}

export function renderTerminal(stopResults, { departuresPerStop, windowMinutes }) {
  process.stdout.write("\x1b[2J\x1b[H");
  const now = new Date();
  console.log(`${BOLD}${CYAN}Brno Tram Display${RESET}  ${DIM}updated ${formatTime(now)}${RESET}\n`);

  for (const { stop, departures, error } of stopResults) {
    console.log(`${BOLD}${stop.name}${RESET}${CYAN}${filterLabel(stop)}${RESET}  ${DIM}(${stop.stopId})${RESET}`);
    console.log("─".repeat(60));
    if (error) {
      console.log(`  ${RED}error: ${error}${RESET}`);
    } else if (departures.length === 0) {
      console.log(`  ${DIM}no departures in the next ${windowMinutes} minutes${RESET}`);
    } else {
      for (const dep of departures.slice(0, departuresPerStop)) {
        const line = `${BOLD}${dep.routeShortName.padEnd(4)}${RESET}`;
        const dest = dep.headsign.padEnd(30);
        const time = formatTime(dep.time);
        const delay = formatDelay(dep.delaySeconds, dep.isRealtime);
        console.log(`  ${line} ${dest} ${CYAN}${time}${RESET}  ${delay}`);
      }
    }
    console.log();
  }
}
