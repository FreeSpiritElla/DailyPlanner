const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
for(const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new Function(script[1]);
const section=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
function device(){
  const records=new Map();
  const c={Date,JSON,Set,Object,console,storageOK:true,currentDate:'2026-10-03',LOCAL_PREFIX:'dailyplan-',
    modeTypes:()=>['core','collab','ops','a','b','c','routine','buffer'],
    localStorage:{setItem:(k,v)=>records.set(k,v),getItem:k=>records.get(k)||null,
      key:i=>Array.from(records.keys())[i],get length(){return records.size;}},
    key:d=>'dailyplan-'+d,getCfg:()=>({token:'fixture',gistId:'fixture'}),gistConfigured:()=>true,
    setStatus:()=>{},render:()=>{c.renders++;},renders:0,
    syncToggle:{classList:{add:()=>{},remove:()=>{}}}};
  vm.createContext(c);
  vm.runInContext(section('  function freshBlock(', '  let currentDate=')+
    section('  function cleanModeData(', '  function load(')+
    section('  function collectAllLocal(', '  async function gistGet(')+
    section('  async function pullAndMerge(', '  refreshSyncButton();'),c);
  c.state=c.defaultDateData();
  c.save=()=>c.localStorage.setItem(c.key(c.currentDate),JSON.stringify(c.state));
  return c;
}
(async()=>{
  const a=device(),b=device();let remote={};
  for(const c of [a,b]){
    c.gistGet=async()=>JSON.parse(JSON.stringify(remote));
    c.gistPut=async(_token,_id,bundle)=>{remote=JSON.parse(JSON.stringify(bundle));};
  }
  a.state.work.memo='Work note\nsecond line';a.state.work._memoU=100;
  a.state.personal.memo='Personal note';a.state.personal._memoU=110;
  await a.pushToGist();await b.pullAndMerge({silent:true});
  assert.equal(b.state.work.memo,a.state.work.memo);assert.equal(b.state.personal.memo,'Personal note');
  // This device changes its plan while the other device changes only the memo.
  b.state.work.blocksPM[0].task='Updated plan';b.state.work._u=300;
  a.state.work.memo='New note';a.state.work._memoU=200;await a.pushToGist();
  await b.pushToGist();await a.pullAndMerge({silent:true});
  assert.equal(a.state.work.memo,'New note');assert.equal(a.state.work.blocksPM[0].task,'Updated plan');
  // A remote memo change with an unchanged plan timestamp must refresh the screen.
  const before=b.renders;remote[b.currentDate].work.memo='Remote note';remote[b.currentDate].work._memoU=400;
  await b.pullAndMerge({silent:true});assert.equal(b.state.work.memo,'Remote note');assert.ok(b.renders>before);
  // Edits made while the GET request is in flight must not be replaced by the response.
  const get=b.gistGet;b.gistGet=async()=>{b.state.personal.memo='Typed during sync';b.state.personal._memoU=500;return get();};
  await b.syncNow();assert.equal(remote[b.currentDate].personal.memo,'Typed during sync');b.gistGet=get;
  // Explicit deletion is synchronized, while old clients missing memo fields cannot erase notes.
  b.state.work.memo='';b.state.work._memoU=600;await b.syncNow();await a.pullAndMerge({silent:true});
  assert.equal(a.state.work.memo,'');assert.equal(a.state.work._memoU,600);
  const old={_u:999,blocksPM:[{task:'Legacy plan'}]};
  const mixed=a.mergeModeData({memo:'Keep me',_memoU:700,_u:1},old);
  assert.equal(mixed.memo,'Keep me');assert.equal(mixed.blocksPM[0].task,'Legacy plan');
  const blankLegacy=a.mergeModeData({memo:'Keep me',_memoU:700,_u:1},{memo:'',_u:999});
  assert.equal(blankLegacy.memo,'Keep me');
  const legacy=a.cleanModeData('work',{memo:'Legacy note',_u:50,_layoutV2:true});
  assert.equal(legacy._memoU,50);assert.equal(a.cleanModeData('work',legacy)._memoU,50);
  console.log('PASS: syntax, two-device sync, independent memo/plan merge, memo-only refresh, in-flight edits, deletion, legacy compatibility');
})().catch(e=>{console.error(e);process.exitCode=1;});
