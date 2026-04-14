/**
 * Stop configuration. Uses GTFS stop_id from KORDIS (U prefix convention).
 */

import { GTFS_URL, VEHICLE_POSITIONS_BASE } from "./constants.js";

export { GTFS_URL, VEHICLE_POSITIONS_BASE };
export { VEHICLE_POSITIONS_BASE as VEHICLE_POSITIONS_URL };

export const STOPS = [
  { stopId: "U1398Z2", name: "Mostecká",    direction: "" },
  { stopId: "U1782Z2", name: "Zdráhalova",  direction: "", excludeLines: ["5"] },
  { stopId: "U1782Z1", name: "Zdráhalova",  direction: "", lines: ["5"], logo: "Albert_logo.svg.png" },
  { stopId: "U1667Z2", name: "Tomanova",    direction: "", excludeLines: ["9"] },
  { stopId: "U1667Z1", name: "Tomanova",    direction: "", lines: ["9"], logo: "Lidl-Logo.svg.png" },
  { stopId: "U1211Z8", name: "Jugoslávská", direction: "", lines: ["3"] },
];
