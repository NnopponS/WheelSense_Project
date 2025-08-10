const state = {
  rooms: {}, calibrations: {}, now: 0, lastUpdate: 0
};

const wsChip = document.getElementById('wsStatus');
const elRooms = document.getElementById('kRooms');
const elWheels = document.getElementById('kWheels');
const elLocated = document.getElementById('kLocated');
const elTime = document.getElementById('kTime');
const elFilter = document.getElementById('roomFilter');
const elHideStale = document.getElementById('hideStale');
const elRefresh = document.getElementById('refreshBtn');
const tbody = document.querySelector('#grid tbody');

const btnShowQR = document.getElementById('btnShowQR');
const qrDrawer = document.getElementById('qrDrawer');
const qrList = document.getElementById('qrList');
const btnCalWizard = document.getElementById('btnCalWizard');
const calDrawer = document.getElementById('calDrawer');
const calRoomSel = document.getElementById('calRoom');
const btnStartCal = document.getElementById('btnStartCal');
const calStatus = document.getElementById('calStatus');
const calResult = document.getElementById('calResult');
const btnExport = document.getElementById('btnExport');

const chartRSSI = echarts.init(document.getElementById('chartRSSI'));
const chartDist = echarts.init(document.getElementById('chartDist'));
const chartBatt = echarts.init(document.getElementById('chartBatt'));
const chartModal = document.getElementById('chartModal');
const chartModalInner = echarts.init(document.getElementById('chartModalInner'));
document.querySelectorAll('.close').forEach(b=>b.addEventListener('click',()=> {
  document.getElementById(b.dataset.close).classList.add('hidden');
}));

let ws;
function connectWS(){
  ws = new WebSocket((location.protocol==='https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = ()=> setChip('WS: connected', 'ok');
  ws.onclose = ()=> { setChip('WS: reconnecting…', 'warn'); setTimeout(connectWS,1200); };
  ws.onerror = ()=> setChip('WS: error', 'bad');
  ws.onmessage = (ev)=>{
    const m = JSON.parse(ev.data);
    if (m.type==='snapshot'){ state.rooms = m.data.rooms||{}; state.calibrations = m.data.calibrations||{}; state.lastUpdate=Date.now(); refreshFilter(); render(); }
    if (m.type==='updates'){ applyUpdates(m.updates||[]); state.lastUpdate=Date.now(); render(); }
    if (m.type==='calibration'){ state.calibrations[m.data.room] = m.data; animePulse(elLocated); }
  };
}
connectWS();

function setChip(text, kind){ wsChip.textContent = text; wsChip.className = 'chip ' + (kind||'warn'); }
function refreshFilter(){
  const current = elFilter.value;
  elFilter.innerHTML = '<option value="all">All</option>';
  Object.keys(state.rooms).sort((a,b)=>a-b).forEach(r=>{
    const o = document.createElement('option'); o.value=r; o.textContent='Room '+r; elFilter.appendChild(o);
  });
  const opts = [...elFilter.options].map(o=>o.value);
  if (opts.includes(current)) elFilter.value=current;
  // also update calibrate room list
  calRoomSel.innerHTML = '';
  Object.keys(state.rooms).sort((a,b)=>a-b).forEach(r=>{
    const o = document.createElement('option'); o.value=r; o.textContent='Room '+r; calRoomSel.appendChild(o);
  });
}
function applyUpdates(items){
  items.forEach(it=>{
    const r = String(it.room);
    if(!state.rooms[r]) state.rooms[r] = { wheels:{}, updated_at: Date.now() };
    state.rooms[r].wheels[String(it.wheel)] = it;
    state.rooms[r].updated_at = Date.now();
  });
}

function render(){
  const hideStale = elHideStale.checked;
  const filterRoom = elFilter.value;
  const now = Date.now();
  const STALE_MS = 6000;
  const rows = [];
  let located = 0, active = 0, roomCount = 0;

  for (const [rid, data] of Object.entries(state.rooms)){
    roomCount++;
    for (const it of Object.values(data.wheels)){
      const isStale = it.stale && ((now - (it.last_seen||0))>STALE_MS);
      if (hideStale && isStale) continue;
      if (filterRoom!=='all' && String(it.room)!==filterRoom) continue;
      rows.push(it); active++;
      if (it.located_room!=null && it.loc_confident) located++;
    }
  }
  rows.sort((a,b)=> (a.room-b.room)||(a.wheel-b.wheel) );

  animateCount(elRooms, roomCount);
  animateCount(elWheels, active);
  animateCount(elLocated, located);
  elTime.textContent = new Date(state.lastUpdate||Date.now()).toLocaleTimeString();

  tbody.innerHTML='';
  rows.forEach(d=>{
    const tr = document.createElement('tr');
    const sClass = d.status==='OK' ? 'ok' : (d.status==='ACCEL_UNRELIABLE'||d.status==='DTHETA_CLIPPED' ? 'warn':'bad');
    const mClass = d.motion==='STOP' ? 'warn':'ok';
    const nowIn = d.located_room!=null ? (d.loc_confident ? ('Room '+d.located_room) : '—') : '—';
    const nowCls = d.loc_confident ? 'ok':'warn';
    tr.innerHTML = `
      <td>#${d.wheel}</td>
      <td>${d.room}</td>
      <td><span class="badge ${nowCls}">${nowIn}</span> <small>${d.loc_delta?('Δ'+d.loc_delta.toFixed(1)+'dB'):''}</small></td>
      <td><span class="badge ${sClass}">${d.status}</span></td>
      <td><span class="badge ${mClass}">${d.motion}</span></td>
      <td>${d.rssi ?? ''}</td>
      <td><div class="progress"><div style="width:${Math.max(0,Math.min(100,d.batt||0))}%"></div></div><small>${d.batt ?? ''}%</small></td>
      <td>${(d.distance??0).toFixed(2)} m</td>
      <td>X:${fmt(d.x)} Y:${fmt(d.y)}</td>
      <td>${ago(d.last_seen)}</td>
      <td><button data-wheel="${d.wheel}" data-room="${d.room}" class="btnChart">Open</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.btnChart').forEach(b=> b.addEventListener('click', async ()=>{
    const wheel = parseInt(b.dataset['wheel'],10);
    const room = parseInt(b.dataset['room'],10);
    const mins = parseInt(document.getElementById('histMin').value||'60',10);
    const res = await fetch(`/api/history?wheel=${wheel}&room=${room}&minutes=${mins}`);
    const js = await res.json();
    showModalChart(`Wheel #${wheel} • Room ${room}`, js.rows);
  }));
}

function fmt(v){ return (typeof v==='number') ? v.toFixed(2) : ''; }
function ago(ts){ if(!ts) return '-'; const s=Math.floor((Date.now()-ts)/1000); if(s<60) return s+'s'; const m=Math.floor(s/60); if(m<60) return m+'m'; const h=Math.floor(m/60); return h+'h'; }
function animateCount(el, n){ const from = parseInt(el.textContent||'0',10); const obj={v:from}; anime({ targets: obj, v:n, round:1, duration:600, easing:'easeOutQuad', update:()=> el.textContent=obj.v }); }
function animePulse(el){ anime({ targets: el, scale:[1,1.06,1], duration:450, easing:'easeOutQuad' }); }

// History chart loader
document.getElementById('btnLoadHist').addEventListener('click', async ()=>{
  const w = document.getElementById('histWheel').value;
  const r = document.getElementById('histRoom').value;
  const mins = document.getElementById('histMin').value || 60;
  const url = `/api/history?minutes=${mins}` + (w?`&wheel=${w}`:'') + (r?`&room=${r}`:'');
  const res = await fetch(url); const js = await res.json();
  drawCharts(js.rows||[]);
});
function drawCharts(rows){
  const t = rows.map(x=> new Date(x.ts));
  chartRSSI.setOption({ tooltip:{trigger:'axis'}, xAxis:{type:'time', data:t}, yAxis:{type:'value', name:'dBm'}, series:[{type:'line', smooth:true, areaStyle:{}, data: rows.map(x=>[x.ts,x.rssi])}] });
  chartDist.setOption({ tooltip:{trigger:'axis'}, xAxis:{type:'time'}, yAxis:{type:'value', name:'m'}, series:[{type:'line', smooth:true, areaStyle:{}, data: rows.map(x=>[x.ts,x.distance])}] });
  chartBatt.setOption({ tooltip:{trigger:'axis'}, xAxis:{type:'time'}, yAxis:{type:'value', name:'%'}, series:[{type:'line', smooth:true, areaStyle:{}, data: rows.map(x=>[x.ts,x.batt])}] });
}
function showModalChart(title, rows){
  document.getElementById('chartTitle').textContent = title;
  chartModal.classList.remove('hidden');
  setTimeout(()=> chartModalInner.resize(), 50);
  chartModalInner.setOption({ tooltip:{trigger:'axis'}, legend:{data:['RSSI','Distance','Battery']},
    xAxis:{type:'time'}, yAxis:[{type:'value',name:'dBm'},{type:'value',name:'m'},{type:'value',name:'%'}],
    series:[
      {name:'RSSI', type:'line', smooth:true, data:rows.map(x=>[x.ts,x.rssi])},
      {name:'Distance', type:'line', smooth:true, yAxisIndex:1, data:rows.map(x=>[x.ts,x.distance])},
      {name:'Battery', type:'line', smooth:true, yAxisIndex:2, data:rows.map(x=>[x.ts,x.batt])}
    ]
  });
}

// QR Drawer
btnShowQR.addEventListener('click', ()=>{
  qrList.innerHTML='';
  const base = location.origin + '/#/calibrate?room=';
  const rooms = Object.keys(state.rooms).sort((a,b)=>a-b);
  if (rooms.length===0) { qrList.innerHTML='<div class="muted">ยังไม่พบห้อง</div>'; }
  rooms.forEach(r=>{
    const div = document.createElement('div'); div.className='qr';
    const title = document.createElement('div'); title.textContent = 'Room '+r;
    const canvas = document.createElement('canvas');
    div.appendChild(title); div.appendChild(canvas);
    qrList.appendChild(div);
    QRCode.toCanvas(canvas, base + r, { width: 220 });
  });
  qrDrawer.classList.remove('hidden');
});

// Calibrate wizard (client side capture then POST)
btnCalWizard.addEventListener('click', ()=>{
  calDrawer.classList.remove('hidden');
});
btnStartCal.addEventListener('click', async ()=>{
  const r = parseInt(calRoomSel.value,10);
  calStatus.textContent = 'Capturing 10s... กรุณาอยู่ในห้องนี้';
  const start = Date.now();
  const buf = [];
  const timer = setInterval(()=>{
    // snapshot delta: pick wheels visible in room r and compare to the strongest other room
    const map = {};
    for (const [rid, data] of Object.entries(state.rooms)){
      for (const it of Object.values(data.wheels)){
        if (!map[it.wheel]) map[it.wheel] = {};
        map[it.wheel][rid] = it.rssi;
      }
    }
    const deltas = [];
    Object.values(map).forEach(byRoom=>{
      const entries = Object.entries(byRoom).filter(([rid,v])=>typeof v==='number');
      if (entries.length<1) return;
      entries.sort((a,b)=>b[1]-a[1]);
      const top = entries[0], second = entries[1];
      const delta = second ? (top[1]-second[1]) : 99;
      deltas.push(delta);
    });
    if (deltas.length) buf.push(deltas.reduce((a,b)=>a+b,0)/deltas.length);
  }, 400);

  await new Promise(res=> setTimeout(res, 10050));
  clearInterval(timer);

  if (buf.length===0){ calStatus.textContent='ไม่พบข้อมูลพอสำหรับคาลิเบรต'; return; }
  const median = buf.slice().sort((a,b)=>a-b)[Math.floor(buf.length/2)];
  const suggested = Math.max(4, Math.min(30, Math.round(median*0.7)));
  calResult.innerHTML = `<b>Suggested ΔMin:</b> ${suggested} dB (จาก median ${median.toFixed(1)} dB)`;

  const resp = await fetch('/api/calibration/save', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ room:r, min_delta_db: suggested }) });
  const js = await resp.json();
  if (js.ok){ calStatus.textContent = 'Saved ✓'; animePulse(calResult); } else { calStatus.textContent='Save failed'; }
});

// Export CSV
btnExport.addEventListener('click', async ()=>{
  const res = await fetch('/api/history?minutes=1440'); // 24h
  const js = await res.json();
  const csv = 'ts,room,wheel,rssi,distance,batt,status,motion\n' + js.rows.map(x=>[x.ts,x.room,x.wheel,x.rssi,x.distance,x.batt,x.status,x.motion].join(',' )).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'wheel-history.csv'; a.click();
});

elFilter.addEventListener('change', render);
elHideStale.addEventListener('change', render);
elRefresh.addEventListener('click', async ()=>{
  const r = await fetch('/api/state'); const js = await r.json();
  state.rooms = js.rooms||{}; state.calibrations = js.calibrations||{}; state.lastUpdate = Date.now(); refreshFilter(); render();
});

// Resize charts on window change
window.addEventListener('resize', ()=>{ chartRSSI.resize(); chartDist.resize(); chartBatt.resize(); chartModalInner.resize(); });
