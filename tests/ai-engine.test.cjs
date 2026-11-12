'use strict';
// Deterministic engine checks. DOM/Canvas stubs do not replace Chromium acceptance.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1].replace('state.records=load();showLoading(0,renderHome,true);','');
function harness(reduced=false){
 let now=10000,id=0;const pending=new Map(),storage=new Map(),snapshots=[],canvasTexts=[];
 function element(attrs=''){
  const attributes=Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
  return {dataset:{action:attributes['data-action'],value:attributes['data-value']},disabled:/\sdisabled(?:\s|$)/.test(attrs),classList:{add(){}},append(){},setAttribute(){},closest(){return this},innerHTML:'',attributes};
 }
 const app={buttons:[],listeners:{},markup:'',addEventListener(event,fn){this.listeners[event]=fn},querySelectorAll(){return this.buttons},querySelector(selector){
  const action=selector.match(/data-action="([^"]+)"/),value=selector.match(/data-value="([^"]+)"/);
  if(action)return this.buttons.find(b=>b.dataset.action===action[1]&&(!value||b.dataset.value===value[1]));return element();
 }};
 Object.defineProperty(app,'innerHTML',{get(){return this.markup},set(value){this.markup=value;this.buttons=[...value.matchAll(/<button\b([^>]*)>/g)].map(m=>element(m[1]))}});
 const ctx2d=new Proxy({fillText(text){canvasTexts.push(text)}},{get(target,key){return target[key]||(()=>{})}});
 const document={body:{dataset:{},append(){}},querySelector(s){return s==='#app'?app:s==='.ambient'?element():null},querySelectorAll(){return []},listeners:{},addEventListener(event,fn){this.listeners[event]=fn},createElement(tag){return tag==='canvas'?{getContext:()=>ctx2d,toDataURL:()=>''}:{...element(),click(){}}}};
 const schedule=(fn,delay,repeat=0)=>{const next=++id;pending.set(next,{fn,at:now+delay,repeat});return next};
 const context=vm.createContext({document,console,Math,Uint32Array,performance:{now:()=>now},matchMedia:()=>({matches:reduced}),Date:class extends Date{static now(){return now}},setTimeout:(fn,delay)=>schedule(fn,delay),clearTimeout:n=>pending.delete(n),setInterval:(fn,delay)=>schedule(fn,delay,delay),clearInterval:n=>pending.delete(n),cancelAnimationFrame(){},requestAnimationFrame(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},navigator:{share:async data=>{context.shared=data}},window:{scrollTo(){}},__snapshots:snapshots});
 for(const file of ['questions.js','ai-demo.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 vm.runInContext(source,context);
 vm.runInContext(`drawBoard=()=>{};animateStage=()=>{};tone=()=>{};const realRenderStage=renderStage;renderStage=()=>{realRenderStage();if(state.current?.auto)__snapshots.push({i:state.i,step:state.current.aiStep,total:state.current.aiTotal,input:state.current.input,picks:[...state.current.picks],moves:[...state.current.moves],queue:[...state.current.queue],executed:state.current.executed,selected:[...state.current.selected],locked:state.current.locked,allDisabled:app.querySelectorAll('button').every(b=>b.disabled)});};`,context);
 const run=s=>vm.runInContext(s,context);
 function until(predicate){let count=0;while(!predicate()){if(++count>20000)throw Error('Timer loop');const next=[...pending.entries()].sort((a,b)=>a[1].at-b[1].at)[0];assert.ok(next,'Pending callback');const [n,item]=next;now=item.at;if(item.repeat)item.at+=item.repeat;else pending.delete(n);item.fn()}}
 return {run,until,app,document,snapshots,storage,canvasTexts,get now(){return now},clickAuto(){const b=app.buttons.find(b=>b.dataset.action==='auto');assert.ok(b&&!b.disabled);app.listeners.click({target:b})}};
}
const results=[];
for(const reduced of [false,true])for(const mode of ['manual','timeout']){
 const h=harness(reduced);h.run('newGame()');
 for(let i=0;i<8;i++){
  h.until(()=>h.run(`state.screen==='play'&&state.i===${i}`));
  assert.match(h.app.markup,/data-action="auto"/);
  if(mode==='timeout'){
   h.until(()=>h.run("!['show','preview'].includes(state.current.phase)"));
   h.run("state.current.deadline=Date.now()+200");
   h.until(()=>h.run('state.current?.auto===true'));
  }else h.clickAuto(); // Also covers takeover during memory/route observation.
  const total=h.run('state.current.aiTotal'),before=h.run('state.current.aiStep'),start=h.now;
  assert.equal(h.run('state.current.locked'),true);
  assert.ok(h.app.buttons.every(b=>b.disabled),'All buttons locked during playback');
  h.run("mathKey('9');memPick(0);navMove('→');robotAdd('↑');autoDo()");
  assert.equal(h.run('state.current.aiStep'),before);assert.equal(h.run('state.current.aiTotal'),total);
  h.until(()=>h.run(`state.records.length===${i+1}`));
  const record=h.run(`state.records[${i}]`),duration=h.now-start;
  assert.equal(record.mode,'auto');assert.equal(record.raw,100);assert.equal(record.score,0);assert.equal(record.reason,mode==='timeout'?'timeout':'submit');
  assert.equal(h.run('dependency()'),Math.min(100,(i+1)*20));
  if(mode==='timeout'){assert.equal(record.exact,false);assert.equal(record.seconds,h.run(`tests[${i}].limit`))}
  assert.ok(reduced?duration<750:duration>=1000&&duration<3500,`Playback duration ${duration}`);
  const steps=h.snapshots.filter(s=>s.i===i&&s.step>0);
  assert.ok(steps.length>=total);assert.ok(steps.every(s=>s.locked&&s.allDisabled));
  assert.deepEqual([...new Set(steps.map(s=>s.step))],Array.from({length:total},(_,i)=>i+1));
  if(i===0)assert.ok(steps.some(s=>s.input.length===1)&&steps.some(s=>s.input.length>=2),'Numbers entered digit by digit');
 }
 h.until(()=>h.run("state.screen==='report'"));
 assert.equal(h.run('reportStats().score'),0);assert.equal(h.run('reportStats().grade'),'D');assert.equal(h.run('dependency()'),100);
 assert.ok(h.run('reportLabels.AI.includes(reportTag())'));
 if(mode==='timeout')assert.equal((h.app.markup.match(/超时由 AI 代做/g)||[]).length,9);
 results.push({mode,reduced,stages:8,score:0,dependency:100,playbackFrames:h.snapshots.length});
}
// A partial human answer must be replaced by a complete, correct demonstration.
{
 const h=harness();h.run("applyRound(QuestionBank.create());state.i=0;state.screen='play';state.current=makeCurrent(tests[0]);begin();state.current.answers=['wrong'];state.current.input='9';state.current.hints=1;state.current.deadline=Date.now()-1;finishAssessment()");
 assert.equal(h.run('state.current.takeoverReason'),'timeout');h.until(()=>h.run('state.records.length===1'));
 assert.equal(h.run('state.records[0].raw'),100);assert.equal(h.run('state.records[0].score'),0);assert.equal(h.run('dependency()'),20);
}
// Cancelled callbacks cannot settle a new stage or a restarted game.
{
 const h=harness();h.run('newGame()');h.until(()=>h.run("state.screen==='play'"));h.clickAuto();h.run('renderHome()');
 assert.equal(h.run('state.records.length'),0);h.run('newGame()');h.until(()=>h.run("state.screen==='play'"));assert.equal(h.run('state.records.length'),0);
}
// Original independent full-score path still yields 100/S with no AI dependency.
{
 const h=harness();h.run('newGame()');
 for(let i=0;i<8;i++){
  h.until(()=>h.run(`state.screen==='play'&&state.i===${i}&&!['show','preview'].includes(state.current.phase)`));
  h.run(`{const c=state.current,t=c.t;if(t.type==='math'){for(const q of t.questions){for(const n of String(q[1]))mathKey(n);mathKey('submit')}}else if(t.type==='memory'){expectedMemory(c).forEach(memPick);finishAssessment()}else if(t.type==='nav'){dirsFromPath(maps[t.map].path).forEach(navMove)}else if(t.type==='robot'){const m=maps.robot;[...pathfind(m,m.start,m.battery),...pathfind(m,m.battery,m.goal)].forEach(robotAdd);robotRun()}else{c.selected=targetSort();sortSubmit()}}`);
 }
 h.until(()=>h.run("state.screen==='report'"));assert.equal(h.run('reportStats().score'),100);assert.equal(h.run('reportStats().grade'),'S');assert.equal(h.run('dependency()'),0);
 results.push({independentRun:'100/S'});
}
// Every report bucket has 2–4 short labels; label persists across PNG/share/reload.
(async()=>{
 const h=harness();
 for(const [grade,score] of [['S',95],['A',85],['B',70],['C',50],['D',25],['AI',0]]){
  h.run(`state.records=tests.map(t=>({id:t.id,raw:${score},score:${score},mode:'${grade==='AI'?'auto':'self'}',exact:true,reason:'submit'}));reportLabel=null;renderReport()`);
  assert.ok(h.run(`reportLabels.${grade}.includes(reportTag())`));assert.ok(h.run(`reportLabels.${grade}.length>=2&&reportLabels.${grade}.length<=4`));
  assert.ok(h.run(`reportLabels.${grade}.every(t=>t.length>=3&&t.length<=6)`));
  const tag=h.run('reportTag()');assert.match(h.app.markup,new RegExp(tag));h.run('reportPNG()');assert.ok(h.canvasTexts.includes(tag));
  await h.run('share()');assert.ok(h.run('shared.text').includes(tag));h.run('reportLabel=null;state.records=load()');assert.equal(h.run('reportTag()'),tag);
 }
 assert.match(html,/aria-label="导航地图"/);assert.match(html,/ai-demo.js/);
 const output={tests:'AI engine + report labels',browserAcceptance:false,results,reportBuckets:6,partialTakeover:true,cancellation:true,pngAndShareLabel:true,legacyStorageKeys:true};
 fs.writeFileSync(path.join(root,'tests/ai-engine-results.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
