/* Pure frontend floorplan catalog and named design storage. Coordinates: mm. */
const DESIGN_STORE = 'huxing-designs-v2';
let designDB = {version:2,plans:{}}, catalog = [], activeDesign = null, changingPlan = false;
const copyData = value => JSON.parse(JSON.stringify(value));
function assertData(ok, message){ if (!ok) throw new Error(message); }
function validatePlan(p){
  assertData(p && p.schemaVersion===1 && p.units==='mm' && typeof p.id==='string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(p.id) && !['constructor','prototype'].includes(p.id) && typeof p.name==='string','户型身份或版本无效');
  const point = v => Array.isArray(v) && v.length===2 && v.every(Number.isFinite);
  const rect = r => Array.isArray(r) && r.length>=4 && r.slice(0,4).every(Number.isFinite) && r[2]>r[0] && r[3]>r[1];
  assertData(Array.isArray(p.rooms) && p.rooms.length>0,'缺少房间');
  const ids = new Set();
  p.rooms.forEach(r => { assertData(typeof r.id==='string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(r.id) && !['constructor','prototype'].includes(r.id) && !ids.has(r.id) && typeof r.name==='string' && Object.hasOwn(MATS,r.mat) && Array.isArray(r.poly) && r.poly.length>=3 && r.poly.every(point) && (!r.at || point(r.at)),'房间数据无效'); ids.add(r.id); });
  ['walls','windows','doors','slides'].forEach(k=>assertData(Array.isArray(p[k]),'缺少 '+k));
  p.walls.forEach(r=>assertData(rect(r) && ['b','e','n','low'].includes(r[4]),'墙体无效'));
  p.windows.forEach(r=>assertData(rect(r),'窗无效'));
  p.doors.forEach(d=>assertData(rect(d.rect) && point(d.h) && point(d.c) && point(d.o) && Number.isFinite(d.len) && d.len>0,'门无效'));
  p.slides.forEach(d=>assertData(rect(d.rect) && typeof d.v==='boolean','推拉门无效'));
  (p.dimensions || []).forEach(d=>assertData(Array.isArray(d) && typeof d[0]==='boolean' && Number.isFinite(d[1]) && Number.isFinite(d[2]) && Array.isArray(d[3]) && d[3].length && d[3].every(v=>Number.isFinite(v)&&v>0),'尺寸标注无效'));
  (p.lintels || []).forEach(l=>assertData(rect(l.rect) && Number.isFinite(l.height) && l.height>0,'过梁无效'));
  (p.windowHeights || []).forEach(h=>assertData(point(h) && h[0]>=0 && h[1]>h[0],'窗高度无效'));
  ['walkStart','walkLook'].forEach(k=>assertData(!p[k] || point(p[k]),'漫游坐标无效'));
  normalizeDesign({furniture:p.furniture || []},p);
  return copyData(p);
}
function normalizeDesign(s,p){
  assertData(s && Array.isArray(s.furniture),'缺少家具列表');
  const types = new Set(LIB.flatMap(c=>c.items.map(i=>i[0]))), ids=new Set();
  const furniture=s.furniture.map(f=>{
    assertData(f && types.has(f.type) && typeof f.name==='string' && ['cx','cy','w','d','rot'].every(k=>Number.isFinite(f[k])) && f.w>0 && f.d>0 && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(f.color),'家具数据无效');
    const g=copyData(f); if(typeof g.id!=='string' || ids.has(g.id))g.id=uid(); ids.add(g.id); return g;
  });
  const rooms={}; p.rooms.forEach(r=>{const v=s.rooms?.[r.id]; rooms[r.id]={name:typeof v?.name==='string'?v.name:r.name,mat:MATS[v?.mat]?v.mat:r.mat};});
  assertData(!s.demolished || Array.isArray(s.demolished),'拆墙数据无效');
  const demolished=(s.demolished || []).filter(id=>typeof id==='string' && /^w\d+$/.test(id) && p.walls[+id.slice(1)]?.[4]==='n');
  assertData(!s.removedOpenings || Array.isArray(s.removedOpenings),'门拆除数据无效');
  const removedOpenings=[...new Set((s.removedOpenings || []).filter(id=>typeof id==='string' && /^[ds]\d+$/.test(id) && (id[0]==='d'?p.doors:p.slides)[+id.slice(1)]))];
  assertData(!s.measures || Array.isArray(s.measures),'测量数据无效');
  const measures=copyData(s.measures || []);
  measures.forEach(m=>assertData(m && [m.a?.x,m.a?.y,m.b?.x,m.b?.y].every(Number.isFinite),'测量数据无效'));
  return {furniture,rooms,demolished,removedOpenings,measures};
}
function persistDB(){
  try { localStorage.setItem(DESIGN_STORE,JSON.stringify(designDB)); $('#saveStatus').textContent=tr('已保存到本机','Saved locally'); return true; }
  catch(e){ $('#saveStatus').textContent=tr('保存失败，请导出备份','Save failed; export a backup'); return false; }
}
function bucket(){ return designDB.plans[currentPlan.id]; }
function saveDesign(){
  if(!currentPlan || !activeDesign)return false;
  const b=bucket(); b.floorplan=copyData(currentPlan); b.active=activeDesign;
  b.designs[activeDesign].state=copyData(state); b.designs[activeDesign].updatedAt=new Date().toISOString();
  designDB.lastPlan=currentPlan.id; return persistDB();
}
function refreshSelectors(){
  $('#floorplanSelect').innerHTML=catalog.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join(''); $('#floorplanSelect').value=currentPlan.id;
  $('#designSelect').innerHTML=Object.entries(bucket().designs).map(([id,d])=>`<option value="${esc(id)}">${esc(d.name)}</option>`).join(''); $('#designSelect').value=activeDesign;
}
function installPlan(p){
  currentPlan=p; WALLS=p.walls; WINS=p.windows; DOORS=p.doors; SLIDES=p.slides; ROOMS=p.rooms; DIMENSIONS=p.dimensions || [];
  const points=ROOMS.flatMap(r=>r.poly).concat([...WALLS,...WINS,...DOORS.map(d=>d.rect),...SLIDES.map(d=>d.rect)].flatMap(r=>[[r[0],r[1]],[r[2],r[3]]]));
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const x=Math.min(...xs),y=Math.min(...ys),x1=Math.max(...xs),y1=Math.max(...ys); planExtent={x,y,w:x1-x,h:y1-y};
  DIMENSIONS.forEach(([hz,at,start,segs])=>{const end=start+segs.reduce((a,b)=>a+b,0); points.push(hz?[start,at]:[at,start],hz?[end,at]:[at,end]);});
  const bx=Math.min(...points.map(p=>p[0]))-500,by=Math.min(...points.map(p=>p[1]))-500;
  BOUNDS={x:bx,y:by,w:Math.max(...points.map(p=>p[0]))+500-bx,h:Math.max(...points.map(p=>p[1]))+500-by};
}
function resetDesignUI(){
  drag=null; pinch=null; ui.sel=null; ui.mA=null; ui.mCur=null; undoStack.length=0; redoStack.length=0;
  setTool('select'); renderOpenings(); renderDims(); fitView(); renderAll(); window.View3D?.resetPlan(); refreshSelectors();
}
async function fetchJSON(url){ const r=await fetch(url); if(!r.ok)throw new Error(`${url}: ${r.status}`); return r.json(); }
function upgradeWallClassification(b,p){
  if(!b || !(p.revision>b.floorplan.revision))return false;
  const geometry = plan => {const v=copyData(plan);delete v.revision;delete v.sourceNotes;v.walls=v.walls.map(w=>w.slice(0,4));return JSON.stringify(v);};
  if(geometry(b.floorplan)!==geometry(p))return false;
  const designs=Object.fromEntries(Object.entries(b.designs).map(([id,d])=>[id,{...d,state:normalizeDesign(d.state,p)}]));
  b.floorplan=copyData(p);b.designs=designs;return true;
}
async function switchPlan(id){
  if(changingPlan)return;
  if($('#stage').classList?.contains('animating'))throw new Error('请等待二维/三维切换完成');
  changingPlan=true;
  try {
    if(currentPlan && !saveDesign())throw new Error('当前方案未保存，请先导出备份');
    const item=catalog.find(p=>p.id===id); assertData(item,'找不到户型');
    const p=validatePlan(item.embedded || await fetchJSON('floorplans/'+item.file)); assertData(p.id===id,'列表与户型身份不一致');
    let b=designDB.plans[id];
    // Only adopt a newer classification when every coordinate and array index matches.
    // Keep saved snapshots for structural revisions so furniture and demolition IDs remain valid.
    upgradeWallClassification(b,p);
    installPlan(b?validatePlan(b.floorplan):p);
    if(!b){ b={floorplan:copyData(currentPlan),active:'default',designs:{default:{name:'默认方案',state:defaultState()}}}; designDB.plans[id]=b;
      if(id==='original'){try{const old=JSON.parse(localStorage.getItem(STORE));if(old)b.designs.default.state=normalizeDesign(old,currentPlan);}catch(e){toast('旧方案无法迁移，原存储已保留');}}
    }
    activeDesign=b.designs[b.active]?b.active:Object.keys(b.designs)[0]; state=normalizeDesign(b.designs[activeDesign].state,currentPlan);
    resetDesignUI(); saveDesign();
  } finally {changingPlan=false; if(currentPlan)refreshSelectors();}
}
function saveAsDesign(){
  let dialog=$('#designNameDialog');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='designNameDialog';document.body.append(dialog);}
  dialog.innerHTML=`<form method="dialog"><label>${tr('新方案名称','New design name')}<input id="designName" required maxlength="100"></label><button value="cancel">${tr('取消','Cancel')}</button><button id="confirmDesignName" value="save">${tr('保存','Save')}</button></form>`;
  $('#designName').value=bucket().designs[activeDesign].name+' 副本';
  dialog.onclose=()=>{const name=$('#designName').value.trim();if(dialog.returnValue!=='save' || !name)return; const id=uid();bucket().designs[id]={name,state:copyData(state)};activeDesign=id;saveDesign();refreshSelectors();};
  dialog.showModal(); $('#designName').focus();
}
function exportDesign(){
  saveDesign(); const d=bucket().designs[activeDesign];
  download(currentPlan.id+'-'+d.name+'.json',new Blob([JSON.stringify({format:'room-design-plan',version:2,floorplan:currentPlan,design:{name:d.name,state},exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}));
}
async function importDesign(doc){
  if(changingPlan || $('#stage').classList?.contains('animating'))throw new Error('请等待户型或视图切换完成');
  if(doc && !doc.format && Array.isArray(doc.furniture)){
    if(!confirm('这是不含户型身份的旧版方案。按原始三室两厅两卫户型导入为新方案？'))return;
    doc={format:'room-design-plan',version:2,floorplan:await fetchJSON('floorplans/original.json'),design:{name:'旧版导入方案',state:doc}};
  }
  assertData(doc?.format==='room-design-plan' && doc.version===2,'只支持包含户型数据的 v2 方案；旧方案会从原本机存储自动迁移');
  const p=validatePlan(doc.floorplan),s=normalizeDesign(doc.design?.state,p);
  assertData(typeof doc.design.name==='string','缺少方案名称');
  if(!saveDesign())throw new Error('当前方案未保存，请先导出备份');
  // Distinct geometry with the same ID gets an independent local identity.
  const existing=designDB.plans[p.id];
  if(existing && JSON.stringify(existing.floorplan)!==JSON.stringify(p)){p.id=p.id+'-import-'+Date.now();p.name+='（导入副本）';}
  if(!catalog.some(i=>i.id===p.id))catalog.push({id:p.id,name:p.name,embedded:p});
  const b=designDB.plans[p.id] || (designDB.plans[p.id]={floorplan:p,designs:{}});
  installPlan(p); activeDesign=uid(); b.active=activeDesign; b.designs[activeDesign]={name:doc.design.name,state:s}; state=s;
  resetDesignUI(); saveDesign(); toast(tr('方案已导入为独立方案','Imported as a new design'));
}
async function bootPlans(){
  const app=$('.app'); app.inert=true;
  try {
    const raw=localStorage.getItem(DESIGN_STORE); if(raw){try{designDB=JSON.parse(raw);assertData(designDB.version===2 && designDB.plans && typeof designDB.plans==='object','本地存储格式无效');}catch(e){throw new Error('本地方案库损坏，请先备份浏览器存储后处理');}}
    const list=await fetchJSON('floorplans/list.json'); catalog=list.floorplans;
    assertData(Array.isArray(catalog) && catalog.length && new Set(catalog.map(p=>p.id)).size===catalog.length,'户型列表无效');
    catalog.forEach(p=>assertData(typeof p.id==='string' && typeof p.name==='string' && typeof p.file==='string' && !p.file.includes('..') && !p.file.includes(':'),'列表条目无效'));
    Object.entries(designDB.plans).forEach(([id,b])=>{if(!catalog.some(p=>p.id===id))catalog.push({id,name:b.floorplan.name,embedded:b.floorplan});});
    await switchPlan(catalog.some(p=>p.id===designDB.lastPlan)?designDB.lastPlan:list.default || catalog[0].id);
    $('#floorplanSelect').onchange=e=>switchPlan(e.target.value).catch(err=>toast(err.message));
    $('#designSelect').onchange=e=>{const id=e.target.value;if(!saveDesign()){refreshSelectors();return;}activeDesign=id;state=normalizeDesign(bucket().designs[id].state,currentPlan);resetDesignUI();saveDesign();};
    $('#saveDesign').onclick=()=>{if(saveDesign())toast(tr('方案已保存','Design saved'));}; $('#saveAsDesign').onclick=saveAsDesign;
    app.inert=false;
  } catch(e){app.inert=false; $('#designControls').innerHTML=''; const msg=document.createElement('div');msg.setAttribute('role','alert');msg.textContent='加载失败：'+e.message+'。请通过 HTTP 静态服务器运行，刷新重试。';$('#designControls').append(msg);}
}
