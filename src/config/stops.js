/**
 * Stop configuration. Uses GTFS stop_id from KORDIS (U prefix convention).
 */

import { GTFS_URL, VEHICLE_POSITIONS_BASE } from "./constants.js";

export { GTFS_URL, VEHICLE_POSITIONS_BASE };
export { VEHICLE_POSITIONS_BASE as VEHICLE_POSITIONS_URL };

export const STOPS = [
  { stopId: "U1398Z2", name: "Mostecká",    direction: "", minMinutes: 3 },
  { stopId: "U1782Z2", name: "Zdráhalova",  direction: "", minMinutes: 2 },
  { stopId: "U1782Z1", name: "Zdráhalova",  direction: "", minMinutes: 2, lines: ["5"], logo: "Albert_logo.svg.png" },
  { stopId: "U1667Z2", name: "Tomanova",    direction: "", minMinutes: 3 },
  { stopId: "U1667Z1", name: "Tomanova",    direction: "", minMinutes: 3, lines: ["9", "7"], logo: "Lidl-Logo.svg.png" },
  { stopId: "U1211Z8", name: "Jugoslávská", direction: "", minMinutes: 5, lines: ["3"] },
];
