/**
 * HTML and JSON renderers for the departure board.
 * Pure functions — no I/O, no side effects.
 */

import { TIMEZONE } from "../config/constants.js";

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

// CSS extracted as a named constant so it can be read/edited independently
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{
  background:#0d0d0d;
  color:#c8c8c8;
  font-family:monospace;
  font-size:58px;
  padding:32px;
}
#topbar{
  display:flex;
  justify-content:space-between;
  align-items:baseline;
  margin-bottom:24px;
}
#clock{font-size:56px;font-weight:700;color:#fff;letter-spacing:0.04em}
#temp{font-size:48px;color:#7ecfff}
table{width:100%;border-collapse:collapse}
td{padding:26px 0;border-bottom:1px solid #1a1a1a;vertical-align:middle}
td.line{font-weight:700;color:#fff;padding-right:28px;white-space:nowrap;width:80px}
td.stop{color:#aaa;font-size:50px;padding-right:28px;white-space:nowrap}
td.mins{color:#e87c2a;font-size:38px;white-space:nowrap;width:160px}
td.mins .n{font-size:54px;font-weight:700;color:#f5c87a}
td.time{color:#fff;text-align:right;white-space:nowrap;width:160px}
.delay{color:#e87c2a;font-size:34px;margin-left:10px}
`;

// Client JS extracted as a named constant
const CLIENT_JS = `
(function(){
  function n(v){return '<span class="n">'+v+'</span>';}
  function fmt(diff){
    if(diff<=0) return 'now';
    if(diff<60) return 'in '+n(diff)+'m';
    var h=Math.floor(diff/60),m=diff%60;
    return 'in '+n(h)+'h'+(m?'\\u00a0'+n(m)+'m':'');
  }
  function tickCountdowns(){
    document.querySelectorAll('.mins[data-time]').forEach(function(el){
      var diff=Math.round((new Date(el.dataset.time)-new Date())/60000);
      el.innerHTML=fmt(diff);
    });
  }
  function tickClock(){
    document.getElementById('clock').textContent=
      new Date().toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Europe/Prague'});
  }
  tickCountdowns();
  tickClock();
  setInterval(tickClock,1000);
})();
`;

function buildRows(departures) {
  return departures.map((d) => {
    const iso = d.time.toISOString();
    const delayMins = d.isRealtime ? Math.round(d.delaySeconds / 60) : 0;
    const delayBadge = delayMins > 0 ? `<span class="delay">+${delayMins}m</span>` : "";
    const logoHtml = d.stopLogo
      ? `<img src="/res/${htmlEscape(d.stopLogo)}" alt="" style="height:0.8em;vertical-align:middle;margin-left:0.35em;opacity:0.85">`
      : "";
    return `<tr>
  <td class="line">${htmlEscape(d.routeShortName)}</td>
  <td class="stop">${htmlEscape(d.stopName)}${logoHtml}</td>
  <td class="mins" data-time="${iso}">—</td>
  <td class="time">${formatTime(d.time)}${delayBadge}</td>
</tr>`;
  }).join("");
}

/**
 * @param {Array} departures
 * @param {number|null} tempCelsius  — null renders as empty (graceful degradation)
 */
export function renderHtml(departures, tempCelsius) {
  const tempHtml = tempCelsius != null
    ? `${tempCelsius}°C`
    : "";

  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<meta http-equiv="refresh" content="30">
<title>Trams</title>
<style>${CSS}</style>
</head>
<body>
<div id="topbar">
  <div id="clock">—</div>
  <div id="temp">${tempHtml}</div>
</div>
<table><tbody>${buildRows(departures)}</tbody></table>
<script>${CLIENT_JS}</script>
</body>
</html>`;
}

export function renderJson(departures) {
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
