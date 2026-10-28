import fetch from "node-fetch";
import { NAMEDAY_URL, TIMEZONE } from "../config/constants.js";

let cached = null;
let cachedDate = null;

function getPragueDateStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

// The API mixes holidays into the name lists ("Mahulena, Den boje za svobodu a demokracii",
// "Den vzniku samostatného československého státu"); real names are capitalised words,
// optionally joined by "a"/"i" ("Adam a Eva").
function isPersonalName(entry) {
  return entry.split(/\s+/).every(w => w === "a" || w === "i" || /^\p{Lu}\p{Ll}+$/u.test(w));
}

function splitEntries(raw) {
  if (!raw || raw === "n/a") return { names: null, holiday: null };
  const entries = String(raw).split(/[/,]+/).map(s => s.trim()).filter(Boolean);
  const names = entries.filter(isPersonalName);
  const holidays = entries.filter(e => !isPersonalName(e));
  return {
    names: names.length ? names.join(" / ") : null,
    holiday: holidays.length ? holidays.join(", ") : null,
  };
}

export async function getNameday() {
  const today = getPragueDateStr();
  if (cached !== null && cachedDate === today) return cached;

  try {
    const res = await fetch(NAMEDAY_URL);
    if (!res.ok) throw new Error(`nameday ${res.status}`);
    const json = await res.json();
    if (!json?.data?.sk && !json?.data?.cz) throw new Error("unexpected nameday response shape");
    const sk = splitEntries(json.data.sk);
    const cz = splitEntries(json.data.cz);
    // the board is in Brno, so only Czech holidays (which also switch tram timetables) are shown
    cached = { sk: sk.names, cz: cz.names, holiday: cz.holiday };
    cachedDate = today;
    console.log(`[nameday] ${today}: sk=${sk.names ?? "-"} cz=${cz.names ?? "-"} holiday=${cz.holiday ?? "-"}`);
    return cached;
  } catch (err) {
    console.warn("[nameday] fetch failed:", err.message);
    return cached;
  }
}
