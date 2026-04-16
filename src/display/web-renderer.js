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

const TRANSITION = "900s ease-in-out";

// CSS extracted as a named constant so it can be read/edited independently
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d0d0d;color:#c8c8c8;font-family:monospace;font-size:58px;padding:32px;transition:background-color ${TRANSITION},color ${TRANSITION}}
body.no-transition,body.no-transition *{transition:none!important}
#topbar{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:24px}
#clock{font-size:56px;font-weight:700;color:#fff;letter-spacing:0.04em;transition:color ${TRANSITION}}
#date{font-size:44px;font-weight:700;color:#aaa;letter-spacing:0.03em;text-decoration:underline;text-underline-offset:6px;white-space:nowrap;flex-shrink:0;transition:color ${TRANSITION}}
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
@keyframes depL{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes depR{0%,49%{opacity:0}50%,100%{opacity:1}}
.dep-l,.dep-r{font-size:52px;font-weight:700;color:#ff3030;text-shadow:0 0 12px #ff3030,0 0 28px #ff303077;animation-duration:1s;animation-timing-function:linear;animation-iteration-count:infinite;line-height:1;vertical-align:middle}
.dep-l{animation-name:depL}
.dep-r{animation-name:depR}
td.time{color:#fff;text-align:right;white-space:nowrap;width:160px;transition:color ${TRANSITION}}
.delay{color:#ff4444;font-size:34px;margin-left:10px;transition:color ${TRANSITION}}
@keyframes rowExit{from{transform:translateY(0);opacity:1}to{transform:translateY(-32px);opacity:0}}
@keyframes rowFlipOut{from{transform:scaleY(1);opacity:1}to{transform:scaleY(0);opacity:0}}
@keyframes rowFlipIn{from{transform:scaleY(0);opacity:0}to{transform:scaleY(1);opacity:1}}
tr.exit{animation:rowExit 200ms ease-in forwards}
tr.flip-out{animation:rowFlipOut 880ms ease-in forwards;transform-origin:center}
tr.flip-in{animation:rowFlipIn 1100ms ease-out both;transform-origin:center}
tr.pre-flip{transform:scaleY(0);opacity:0;transform-origin:center}
body.day{background-color:#f0ede8;color:#2a2a2a}
body.day #clock{color:#111}
body.day #date{color:#555}
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
body.sunrise #date{color:#7a4a20}
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
body.sunset #date{color:#ffccaa}
body.sunset #temp{color:#ffe0b0}
body.sunset td{border-bottom-color:#a03018}
body.sunset td.line{color:#fff}
body.sunset td.stop{color:#ffccaa}
body.sunset td.mins{color:#ffb060}
body.sunset td.mins .n{color:#ffd080}
body.sunset td.time{color:#fff}
body.sunset .delay{color:#ffb060}
body.night .city-logo,body.sunset .city-logo{filter:invert(1)}
`;

// Client JS extracted as a named constant
const CLIENT_JS = `
(function(){
  var srISO=window._SR||'',ssISO=window._SS||'',currentFp='',flipTimer=null;
  var STAGGER=320,FLIP_OUT_DURATION=880;
  function n(v){return '<span class="n">'+v+'</span>';}
  function fmt(diff){
    if(diff<=0) return 'now';
    if(diff<60) return n(diff)+'m';
    var h=Math.floor(diff/60),m=diff%60;
    return n(h)+'h'+(m?'\\u00a0'+n(m)+'m':'');
  }
  function tickCountdowns(){
    document.querySelectorAll('.mins[data-time]').forEach(function(el){
      var diffMs=new Date(el.dataset.time)-new Date();
      var diffMin=Math.floor(diffMs/60000);
      var tr=el.closest('tr');
      var min=tr?parseInt(tr.dataset.min||'1',10):1;
      if(diffMs<min*60000){
        el.removeAttribute('data-time');
        el.classList.remove('urgent');
        el.classList.add('is-departed');
        el.innerHTML='<span class="dep-l">*</span><span class="dep-r">*</span>';
        return;
      }
      el.classList.toggle('urgent',diffMs<(min*60+30)*1000);
      el.innerHTML=fmt(diffMin);
    });
  }
  function tickClock(){
    document.getElementById('clock').textContent=
      new Date().toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Europe/Prague'});
  }
  function tickDate(){
    var d=new Date();
    var parts=new Intl.DateTimeFormat('sk-SK',{weekday:'long',day:'numeric',month:'numeric',timeZone:'Europe/Prague'}).formatToParts(d);
    var map={};
    parts.forEach(function(p){map[p.type]=p.value;});
    var wd=map.weekday||'';
    wd=wd.charAt(0).toUpperCase()+wd.slice(1).replace(/\.$/,'');
    var el=document.getElementById('date');
    if(el) el.textContent=wd+' '+map.day+'.'+map.month+'.';
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
    // only animate when there are departed rows to replace
    var hasDeparted=Array.from(tbody.querySelectorAll('td.mins')).some(function(el){
      return el.classList.contains('is-departed');
    });
    if(!hasDeparted) return;
    var tmp=document.createElement('tbody');
    tmp.innerHTML=evt.detail.serverResponse;
    var newRows=Array.from(tmp.querySelectorAll('tr'));
    var oldMap={};
    tbody.querySelectorAll('tr').forEach(function(tr){if(tr.dataset.key)oldMap[tr.dataset.key]=tr;});
    // staggered wave flip-out: first row first, then each subsequent row
    var allRows=Array.from(tbody.querySelectorAll('tr'));
    allRows.forEach(function(tr,i){
      tr.classList.remove('flip-out','flip-in');
      tr.style.animationDelay=(i*STAGGER)+'ms';
      void tr.offsetWidth;
      tr.classList.add('flip-out');
    });
    // cancel any pending flip-in from a previous update
    if(flipTimer)clearTimeout(flipTimer);
    var flipOutMs=(allRows.length>1?(allRows.length-1)*STAGGER:0)+FLIP_OUT_DURATION;
    flipTimer=setTimeout(function(){
      flipTimer=null;
      var frag=document.createDocumentFragment();
      newRows.forEach(function(newTr){
        var key=newTr.dataset.key;
        var tr;
        if(key&&oldMap[key]){
          tr=oldMap[key];
          tr.classList.remove('flip-out','flip-in');
          tr.classList.add('pre-flip');
          tr.style.animationDelay='';
          var om=tr.querySelector('.mins'),nm=newTr.querySelector('.mins');
          var ot=tr.querySelector('.time'),nt=newTr.querySelector('.time');
          if(om&&nm)om.dataset.time=nm.dataset.time;
          if(ot&&nt)ot.innerHTML=nt.innerHTML;
          tr.dataset.min=newTr.dataset.min;
        }else{
          tr=newTr;
          tr.classList.remove('enter','flip-out','flip-in');
          tr.classList.add('pre-flip');
          tr.style.animationDelay='';
        }
        frag.appendChild(tr);
      });
      // pad to always have 6 rows so the table never shrinks
      while(frag.childElementCount<6){
        var ph=document.createElement('tr');
        ph.innerHTML='<td class="line">\u00a0</td><td class="stop"></td><td class="mins"></td><td class="time"></td>';
        frag.appendChild(ph);
      }
      tbody.innerHTML='';
      tbody.appendChild(frag);
      tickCountdowns();
      // only animate rows that have real departure data
      var rows=Array.from(tbody.querySelectorAll('tr[data-key]'));
      requestAnimationFrame(function(){requestAnimationFrame(function(){
        rows.forEach(function(tr,i){
          tr.style.animationDelay=(i*STAGGER)+'ms';
          tr.classList.remove('pre-flip');
          tr.classList.add('flip-in');
        });
      });});
    },flipOutMs);
  });
  requestAnimationFrame(function(){requestAnimationFrame(function(){document.body.classList.remove('no-transition');});});
  tickCountdowns();
  tickClock();
  tickDate();
  setInterval(tickClock,1000);
  setInterval(tickDate,60000);
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
    ? `<img src="/res/${htmlEscape(d.stopLogo)}" alt=""${d.stopLogo === "City-icon.png" ? ' class="city-logo"' : ''} style="height:0.8em;vertical-align:middle;margin-left:0.35em;opacity:0.85">`
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
  <div id="date"></div>
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
