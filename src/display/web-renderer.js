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

const TRANSITION = "30s ease-in-out";

// CSS extracted as a named constant so it can be read/edited independently
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d0d0d;color:#c8c8c8;font-family:monospace;font-size:58px;padding:32px;transition:background-color ${TRANSITION},color ${TRANSITION}}
body.no-transition,body.no-transition *{transition:none!important}
#topbar{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:24px}
#clock{font-size:56px;font-weight:700;color:#fff;letter-spacing:0.04em;transition:color ${TRANSITION}}
#temp{font-size:48px;color:#7ecfff;transition:color ${TRANSITION}}
table{width:100%;border-collapse:collapse}
td{padding:24px 0;border-bottom:1px solid #1a1a1a;vertical-align:middle;transition:border-bottom-color ${TRANSITION}}
td.line{font-weight:700;color:#fff;padding-right:28px;white-space:nowrap;width:80px;transition:color ${TRANSITION}}
td.stop{color:#aaa;font-size:50px;padding-right:28px;white-space:nowrap;transition:color ${TRANSITION}}
td.mins{color:#e87c2a;font-size:38px;white-space:nowrap;width:160px;transition:color ${TRANSITION}}
td.mins .n{font-size:54px;font-weight:700;color:#f5c87a;transition:color ${TRANSITION}}
@keyframes urgentBreath{0%,100%{opacity:1}50%{opacity:0.2}}
td.mins.urgent{color:#ff5050;text-shadow:0 0 12px #ff505099;animation:urgentBreath 1.5s ease-in-out infinite;transition:none}
td.mins.urgent .n{color:#ff5050;transition:none}
td.time{color:#fff;text-align:right;white-space:nowrap;width:160px;transition:color ${TRANSITION}}
.delay{color:#ff4444;font-size:34px;margin-left:10px;transition:color ${TRANSITION}}
@keyframes rowExit{from{transform:translateY(0);opacity:1}to{transform:translateY(-32px);opacity:0}}
@keyframes rowFlip{0%,100%{transform:scaleY(1);opacity:1}40%,60%{transform:scaleY(0);opacity:0}}
tr.exit{animation:rowExit 200ms ease-in forwards}
tr.flip{animation:rowFlip 350ms ease-in-out both;transform-origin:center}
body.day{background-color:#f0ede8;color:#2a2a2a}
body.day #clock{color:#111}
body.day #temp{color:#0070a0}
body.day td{border-bottom-color:#d8d4d0}
body.day td.line{color:#0070a0}
body.day td.stop{color:#111}
body.day td.mins{color:#c05000}
body.day td.mins .n{color:#b06000}
body.day td.time{color:#0070a0}
body.day .delay{color:#c05000}
body.sunrise{background-color:#fde8c8;color:#3d1a00}
body.sunrise #clock{color:#2d0e00}
body.sunrise #temp{color:#6060a0}
body.sunrise td{border-bottom-color:#e8c090}
body.sunrise td.line{color:#2d0e00}
body.sunrise td.stop{color:#8b4820}
body.sunrise td.mins{color:#d4800a}
body.sunrise td.mins .n{color:#c06800}
body.sunrise td.time{color:#2d0e00}
body.sunrise .delay{color:#d4800a}
body.sunset{background-color:#c04820;color:#ffe8d0}
body.sunset #clock{color:#fff}
body.sunset #temp{color:#ffe0b0}
body.sunset td{border-bottom-color:#a03018}
body.sunset td.line{color:#fff}
body.sunset td.stop{color:#ffccaa}
body.sunset td.mins{color:#ffb060}
body.sunset td.mins .n{color:#ffd080}
body.sunset td.time{color:#fff}
body.sunset .delay{color:#ffb060}
`;

// Client JS extracted as a named constant
const CLIENT_JS = `
(function(){
  var srISO=window._SR||'',ssISO=window._SS||'',currentFp='';
  function n(v){return '<span class="n">'+v+'</span>';}
  function fmt(diff){
    if(diff<=0) return 'now';
    if(diff<60) return n(diff)+'m';
    var h=Math.floor(diff/60),m=diff%60;
    return n(h)+'h'+(m?'\\u00a0'+n(m)+'m':'');
  }
  function tickCountdowns(){
    var needRefresh=false;
    document.querySelectorAll('.mins[data-time]').forEach(function(el){
      var diffMs=new Date(el.dataset.time)-new Date();
      var diffSec=Math.round(diffMs/1000);
      var diffMin=Math.round(diffMs/60000);
      var tr=el.closest('tr');
      var min=tr?parseInt(tr.dataset.min||'1',10):1;
      if(diffMs<min*60000){if(tr)tr.remove();needRefresh=true;return;}
      el.classList.toggle('urgent',diffMin===min&&diffSec%60<30);
      el.innerHTML=fmt(diffMin);
    });
    if(needRefresh){
      var tbody=document.querySelector('tbody[hx-get]');
      if(tbody){currentFp='';htmx.ajax('GET',tbody.getAttribute('hx-get'),{target:tbody,swap:'innerHTML'});}
    }
  }
  function tickClock(){
    document.getElementById('clock').textContent=
      new Date().toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Europe/Prague'});
  }
  function getMode(){
    if(!srISO||!ssISO) return 'night';
    var now=new Date(),sr=new Date(srISO),ss=new Date(ssISO),H=3600000;
    if(now>=new Date(sr-H)&&now<new Date(sr+H)) return 'sunrise';
    if(now>=new Date(sr+H)&&now<new Date(ss-H)) return 'day';
    if(now>=new Date(ss-H)&&now<new Date(ss+H)) return 'sunset';
    return 'night';
  }
  function applyMode(){
    var mode=getMode(),b=document.body;
    if(!b.classList.contains(mode)){
      b.classList.remove('night','day','sunrise','sunset');
      b.classList.add(mode);
    }
  }
  function refreshWeather(){
    fetch('/api/weather')
      .then(function(r){return r.json();})
      .then(function(data){
        var el=document.getElementById('temp');
        if(el&&data.tempCelsius!=null) el.textContent=data.tempCelsius+'°C';
        if(data.sunrise) srISO=data.sunrise;
        if(data.sunset)  ssISO=data.sunset;
        applyMode();
      })
      .catch(function(){});
  }
  document.body.addEventListener('htmx:configRequest',function(evt){
    evt.detail.headers['X-Rows-Fingerprint']=currentFp;
  });
  document.body.addEventListener('htmx:beforeSwap',function(evt){
    if(!evt.detail.serverResponse) return;
    var fp=evt.detail.xhr&&evt.detail.xhr.getResponseHeader('X-Rows-Fingerprint');
    if(fp) currentFp=fp;
    evt.detail.shouldSwap=false;
    var tbody=evt.detail.target;
    var tmp=document.createElement('tbody');
    tmp.innerHTML=evt.detail.serverResponse;
    var newRows=Array.from(tmp.querySelectorAll('tr'));
    var oldMap={};
    tbody.querySelectorAll('tr').forEach(function(tr){if(tr.dataset.key)oldMap[tr.dataset.key]=tr;});
    var newKeys=new Set(newRows.map(function(tr){return tr.dataset.key;}).filter(Boolean));
    Object.keys(oldMap).forEach(function(key){if(!newKeys.has(key))oldMap[key].classList.add('exit');});
    setTimeout(function(){
      var frag=document.createDocumentFragment();
      var toFlip=[];
      newRows.forEach(function(newTr,i){
        var key=newTr.dataset.key;
        var tr;
        if(key&&oldMap[key]){
          tr=oldMap[key];
          var om=tr.querySelector('.mins'),nm=newTr.querySelector('.mins');
          var ot=tr.querySelector('.time'),nt=newTr.querySelector('.time');
          var changed=om&&nm&&om.dataset.time!==nm.dataset.time;
          // cancel any in-progress animation before touching classes
          tr.classList.remove('enter','exit','flip');
          tr.style.animationDelay='';
          // update data immediately so tickCountdowns always sees correct values
          if(om&&nm)om.dataset.time=nm.dataset.time;
          if(ot&&nt)ot.innerHTML=nt.innerHTML;
          tr.dataset.min=newTr.dataset.min;
          if(changed)toFlip.push({tr:tr,i:i});
        }else{
          tr=newTr;
          tr.classList.remove('enter','exit','flip');
          tr.style.animationDelay='';
          toFlip.push({tr:tr,i:i});
        }
        frag.appendChild(tr);
      });
      tbody.innerHTML='';
      tbody.appendChild(frag);
      // double-rAF: let browser paint the clean DOM before starting animations
      requestAnimationFrame(function(){requestAnimationFrame(function(){
        toFlip.forEach(function(item){
          item.tr.style.animationDelay=(item.i*80)+'ms';
          item.tr.classList.add('flip');
        });
      });});
      tickCountdowns();
    },220);
  });
  requestAnimationFrame(function(){requestAnimationFrame(function(){document.body.classList.remove('no-transition');});});
  tickCountdowns();
  tickClock();
  setInterval(tickClock,1000);
  setInterval(tickCountdowns,3000);
  setInterval(refreshWeather,600000);
  setInterval(applyMode,60000);
})();
`;

/** Returns the display mode for a given time based on sunrise/sunset ISO strings. */
function computeMode(sunrise, sunset) {
  if (!sunrise || !sunset) return "night";
  const now = new Date();
  const sr = new Date(sunrise);
  const ss = new Date(sunset);
  const H = 3600000;
  if (now >= new Date(sr - H) && now < new Date(sr + H)) return "sunrise";
  if (now >= new Date(sr + H) && now < new Date(ss - H)) return "day";
  if (now >= new Date(ss - H) && now < new Date(ss + H)) return "sunset";
  return "night";
}

function buildRow(d) {
  const iso = d.time.toISOString();
  const delayMins = d.isRealtime ? Math.round(d.delaySeconds / 60) : 0;
  const delayBadge = delayMins > 0 ? `<span class="delay">+${delayMins}m</span>` : "";
  const logoHtml = d.stopLogo
    ? `<img src="/res/${htmlEscape(d.stopLogo)}" alt="" style="height:0.8em;vertical-align:middle;margin-left:0.35em;opacity:0.85">`
    : "";
  const key = d.tripId ? htmlEscape(d.tripId) : `${htmlEscape(d.routeShortName)}-${iso}`;
  return { iso, key, delayBadge, logoHtml };
}

/** Initial page render — no animation classes. */
function buildRows(departures) {
  return departures.map((d) => {
    const { iso, key, delayBadge, logoHtml } = buildRow(d);
    return `<tr data-key="${key}" data-min="${d.minMinutes ?? 1}">
  <td class="line">${htmlEscape(d.routeShortName)}</td>
  <td class="stop">${htmlEscape(d.stopName)}${logoHtml}</td>
  <td class="mins" data-time="${iso}">—</td>
  <td class="time">${formatTime(d.scheduledTime ?? d.time)}${delayBadge}</td>
</tr>`;
  }).join("");
}

/** HTMX fragment — new rows get enter animation; existing rows are identified by data-key. */
export function renderRows(departures) {
  return departures.map((d) => {
    const { iso, key, delayBadge, logoHtml } = buildRow(d);
    return `<tr class="enter" data-key="${key}" data-min="${d.minMinutes ?? 1}">
  <td class="line">${htmlEscape(d.routeShortName)}</td>
  <td class="stop">${htmlEscape(d.stopName)}${logoHtml}</td>
  <td class="mins" data-time="${iso}">—</td>
  <td class="time">${formatTime(d.scheduledTime ?? d.time)}${delayBadge}</td>
</tr>`;
  }).join("");
}

/**
 * @param {Array} departures
 * @param {{ temp: number|null, sunrise: string|null, sunset: string|null }|null} weather
 */
export function renderHtml(departures, weather) {
  const temp     = weather?.temp     ?? null;
  const sunrise  = weather?.sunrise  ?? null;
  const sunset   = weather?.sunset   ?? null;
  const tempHtml = temp != null ? `${temp}°C` : "";
  const mode     = computeMode(sunrise, sunset);

  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<meta name="color-scheme" content="light dark">
<title>Trams</title>
<style>${CSS}</style>
<script src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js"></script>
</head>
<body class="no-transition ${mode}">
<script>window._SR=${JSON.stringify(sunrise)};window._SS=${JSON.stringify(sunset)};</script>
<div id="topbar">
  <div id="clock">—</div>
  <div id="temp">${tempHtml}</div>
</div>
<table><tbody hx-get="/api/rows" hx-trigger="every 15s" hx-swap="innerHTML">${buildRows(departures)}</tbody></table>
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
      stopLogo: d.stopLogo ?? null,
    })),
  });
}
