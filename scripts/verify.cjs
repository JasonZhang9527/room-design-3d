const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('index.html','utf8');
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(m[0].includes('importmap'))continue;new vm.Script(m[1].replace(/^import .*;$/gm,''));}
const nodes={},memory=new Map(),ctx=vm.createContext({console,structuredClone,Date,Blob,URL,localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(url,'utf8'))})});
vm.runInContext(html.slice(html.indexOf('const MATS ='),html.indexOf('const PX_MM'))+`
let currentPlan=null,WALLS=[],WINS=[],DOORS=[],SLIDES=[],ROOMS=[],DIMENSIONS=[],planExtent,BOUNDS,state,drag,pinch;
const ui={layers:{}},undoStack=[],redoStack=[];
const $=s=>nodes[s] || (nodes[s]={textContent:'',innerHTML:'',value:''});
const tr=(a,b)=>a,esc=s=>s,nm=s=>s;
function toast(){} function resetDesignUI(){} function download(name,blob){this.exported=blob;} function save(){return saveDesign();}
`,ctx); // defaultState references ROOMS only when called
ctx.nodes=nodes;
vm.runInContext(fs.readFileSync('plan-storage.js','utf8')+'\nresetDesignUI=()=>{};',ctx);
vm.runInContext(html.slice(html.indexOf('const openingRemoved ='),html.indexOf('/* ======================= 几何工具'))+html.slice(html.indexOf('function renderWalls()'),html.indexOf('function renderLabels()')),ctx);
async function run(code){return vm.runInContext(code.includes('await ')?`(async()=>{${code}})()`:code,ctx);}
(async()=>{
  await run(`catalog=(await fetchJSON('floorplans/list.json')).floorplans; await switchPlan('original');`);
  await run(`for(const entry of catalog){const p=validatePlan(await fetchJSON('floorplans/'+entry.file));assertData(p.id===entry.id,'Catalog ID mismatch');}`);
  await run(`this.wallPlan=validatePlan(await fetchJSON('floorplans/two-bedroom-balcony.json'));this.oldWallPlan=copyData(wallPlan);oldWallPlan.revision=1;oldWallPlan.walls.forEach(w=>w[4]='e');this.oldBucket={floorplan:oldWallPlan,designs:{one:{name:'保留方案',state:{furniture:copyData(wallPlan.furniture),rooms:{},demolished:[],measures:[]}}}};assertData(upgradeWallClassification(oldBucket,wallPlan),'Wall classification migration failed');assertData(oldBucket.designs.one.state.furniture.length===wallPlan.furniture.length,'Furniture lost');assertData(oldBucket.floorplan.walls.slice(0,13).every(w=>w[4]==='b') && oldBucket.floorplan.walls.slice(13).every(w=>w[4]==='n'),'Wrong wall types');this.structural=copyData(wallPlan);structural.revision=3;structural.walls[0][0]-=10;assertData(!upgradeWallClassification(oldBucket,structural),'Geometry change must keep snapshot');`);
  assert.equal(await run('ROOMS.length'),13);
  await run(`state.removedOpenings=['d0','s0'];state.demolished=['w0'];renderWalls();renderOpenings();assertData(!$('#gWalls').innerHTML.includes('data-wall="w0"'),'Removed wall still rendered');assertData(!$('#gOpen').innerHTML.includes('data-opening="d0"') && !$('#gOpen').innerHTML.includes('data-opening="s0"'),'Removed door still rendered');assertData(liveDoors().length===DOORS.length-1 && liveSlides().length===SLIDES.length-1,'3D opening filters failed');state.demolished=[];saveDesign();`);
  await run(`state.furniture[0].cx=1234;state.measures=[{a:{x:0,y:0},b:{x:100,y:100}}];saveDesign(); await switchPlan('studio');`);
  assert.equal(await run('state.furniture.length'),1);assert.equal(await run('state.measures.length'),0);
  await run(`await switchPlan('original');`);assert.equal(await run('state.furniture[0].cx'),1234);assert.equal(await run('state.measures.length'),1);
  assert.equal(await run('state.removedOpenings.length'),2);
  await run(`this.imported={format:'room-design-plan',version:2,floorplan:copyData(currentPlan),design:{name:'导入测试',state:copyData(state)}}; await importDesign(imported);`);
  assert.equal(await run('Object.keys(bucket().designs).length'),2);
  await run(`const mismatch=copyData(imported);mismatch.floorplan.rooms[0].poly[0][0]+=10;await importDesign(mismatch);`);
  assert.match(await run('currentPlan.id'),/^original-import-/);
  await run(`exportDesign();`);const exp=JSON.parse(await ctx.exported.text());assert.equal(exp.floorplan.id,await run('currentPlan.id'));assert.equal(exp.design.name,'导入测试');
  await assert.rejects(run(`importDesign({format:'room-design-plan',version:2,floorplan:{},design:{}})`));
  await run(`localStorage.setItem=()=>{throw new Error('quota')};`);assert.equal(await run('saveDesign()'),false);assert.match(nodes['#saveStatus'].textContent,/保存失败/);
  console.log('PASS: inline syntax, both schemas, per-plan isolation, measurements, import copies, geometry conflicts, export snapshot, invalid import, quota failure');
})().catch(e=>{console.error(e);process.exitCode=1;});
