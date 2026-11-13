'use strict';
// Node-only state/timer checks. DOM stubs do not claim browser layout coverage.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1]
 .replace('state.records=load();showLoading(0,renderHome,true);','');
function harness(reduced=false){
 let now=10000,id=0,cssWidth=322;
 const pending=new Map(),storage=new Map();
 const element=()=>({classList:{add(){},toggle(){}},append(){},setAttribute(){},animate(){}});
 const clock=element(),ctx=new Proxy({},{get:()=>()=>{}});
 const canvas={width:840,height:840,getBoundingClientRect:()=>({width:cssWidth,height:cssWidth,left:0,top:0}),getContext:()=>ctx};
 const app={markup:'',buttons:[],addEventListener(){},querySelector:()=>element(),querySelectorAll(){return this.buttons}};
 Object.defineProperty(app,'innerHTML',{get(){return this.markup},set(v){this.markup=v;this.buttons=[...v.matchAll(/<button\b([^>]*)>/g)].map(m=>({...element(),disabled:/\sdisabled(?:\s|$)/.test(m[1])}));}});
 const document={body:{dataset:{}},addEventListener(){},querySelectorAll:()=>[],querySelector:s=>s==='#app'?app:s==='.ambient'?element():s==='#gameboard'&&app.markup.includes('id="gameboard"')?canvas:s==='.stage-meta #clock'?clock:null,createElement:element};
 const schedule=(fn,delay,repeat=0)=>{const n=++id;pending.set(n,{fn,at:now+delay,repeat});return n};
 const context=vm.createContext({document,Math,Uint32Array,performance:{now:()=>now},Date:class extends Date{static now(){return now}},matchMedia:()=>({matches:reduced}),setTimeout:(fn,d)=>schedule(fn,d),clearTimeout:n=>pending.delete(n),setInterval:(fn,d)=>schedule(fn,d,d),clearInterval:n=>pending.delete(n),requestAnimationFrame:()=>0,cancelAnimationFrame(){},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{scrollTo(){},addEventListener(){},devicePixelRatio:3}});
 for(const file of ['questions.js','ai-demo.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 vm.runInContext(source,context);
 const run=s=>vm.runInContext(s,context);
 run('animateStage=()=>{};tone=()=>{};state.sound=false');
 function advance(ms){const end=now+ms;let count=0;while(true){const next=[...pending.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;assert.ok(++count<20000,'Timer loop');const [n,item]=next;now=item.at;if(item.repeat)item.at+=item.repeat;else pending.delete(n);item.fn()}now=end}
 function until(predicate){let count=0;while(!predicate()){assert.ok(++count<20000,'Timer loop');const next=[...pending.values()].sort((a,b)=>a.at-b.at)[0];assert.ok(next,'Expected pending timer');advance(next.at-now)}}
 const setup=i=>run(`clearTimers();state.records=[];state.i=${i};state.screen='play';state.current=makeCurrent(tests[${i}]);begin()`);
 return {run,advance,until,setup,app,canvas,clock,resize:w=>{cssWidth=w},get now(){return now}};
}
for(const reduced of [false,true]){
 const settleMs=reduced?1600:2000,loadMs=reduced?300:1220;
 // Independent and hinted scores are saved before the yellow result; no early next stage.
 for(const hinted of [false,true]){
  const h=harness(reduced);h.setup(0);
  h.run(`state.current.answers=state.current.t.questions.map(q=>String(q[1]));state.current.hints=${hinted?1:0};finishAssessment()`);
  assert.equal(h.run('state.screen'),'settlement');
  assert.equal(h.run('state.records[0].score'),hinted?70:100);
  assert.match(h.app.markup,new RegExp(`settlement-score [^"]*">${hinted?70:100}</div>`));
  assert.match(h.app.markup,/独立评估分/);
  h.run('finishAssessment()');assert.equal(h.run('state.records.length'),1);
  h.advance(settleMs-1);assert.equal(h.run('state.screen'),'settlement');
  h.advance(1);assert.equal(h.run('state.screen'),'loading');
  h.advance(loadMs);assert.equal(h.run('state.screen'),'play');assert.equal(h.run('state.i'),1);
 }
 // Both takeover paths must finish their real demonstration, then hide the numeric zero.
 for(const source of ['manual','timeout'])for(let i=0;i<8;i++){
  const h=harness(reduced);h.setup(i);
  if(source==='manual')h.run('autoDo()');else{
   h.until(()=>h.run("!['show','preview'].includes(state.current.phase)"));
   h.run('state.current.deadline=Date.now()+100');h.advance(100);
  }
  assert.equal(h.run('state.current.auto'),true);
  assert.doesNotMatch(h.app.markup,/assessment-strip/);
  assert.equal(h.run('state.records.length'),0);
  h.until(()=>h.run("state.screen==='settlement'"));
  assert.equal(h.run(`state.records[${i}].mode`),'auto');
  assert.equal(h.run(`state.records[${i}].raw`),100);
  assert.equal(h.run(`state.records[${i}].score`),0);
  assert.equal(h.run(`state.records[${i}].reason`),source==='manual'?'submit':'timeout');
  assert.match(h.app.markup,/settlement-score is-auto">AI 接管/);
  assert.doesNotMatch(h.app.markup,/独立评估分|>0<\/div>/);
  if(i===3)assert.equal(h.run('state.current.executed'),h.run('state.current.queue.length'));
  h.advance(settleMs);assert.equal(h.run('state.screen'),'loading');
  h.advance(loadMs);assert.equal(h.run('state.screen'),i===7?'report':'play');
 }
 // Robot settlement must wait for all moves and the final animation pause.
 {
  const h=harness(reduced);h.setup(3);
  h.run("{const m=maps.robot;[...pathfind(m,m.start,m.battery),...pathfind(m,m.battery,m.goal)].forEach(robotAdd);robotRun()}");
  h.until(()=>h.run('state.current.executed===state.current.queue.length'));
  assert.equal(h.run('state.records.length'),0);h.advance(1009);
  assert.equal(h.run('state.screen'),'play');h.advance(1);
  assert.equal(h.run('state.screen'),'settlement');assert.equal(h.run('state.records[3].score'),100);
 }
 // Abandon and cancellation never schedule a result/next-stage callback.
 {
  const h=harness(reduced);h.setup(0);h.run("finishAssessment('abandoned');renderHome()");
  assert.equal(h.run('state.records[0].reason'),'abandoned');h.advance(10000);
  assert.equal(h.run('state.screen'),'home');assert.doesNotMatch(h.app.markup,/settlement-screen/);
  h.setup(0);h.run('finishAssessment();renderHome()');h.advance(10000);
  assert.equal(h.run('state.screen'),'home');
 }
}
// Every title starts with its unpadded number; the top-right slot only holds the clock.
for(let i=0;i<8;i++){
 const h=harness();h.setup(i);
 assert.ok(h.app.markup.includes(`<h1>${i+1}. ${h.run('state.current.t.name')}</h1>`));
 assert.match(h.app.markup,/<div class="stage-meta"><b id="clock"[^>]*>[^<]*<\/b><\/div>/);
 assert.match(h.app.markup,/<div class="play-area">/);
 assert.doesNotMatch(h.app.markup,/assessment-strip/);
 if(i===3)assert.match(h.app.markup,/<p class="subtitle task-instruction is-compact">点方向键编排，取电池→出口，提交执行。<\/p>/);
}
// Preview and answer countdowns share the top-right slot. Moves remain part of scoring state.
for(const i of [2,7]){
 const h=harness();h.setup(i);
 assert.match(h.app.markup,/stage-meta[\s\S]*?id="clock"[\s\S]*?路线 · 5s/);
 assert.doesNotMatch(h.app.markup,/mini-status/);
 h.advance(1000);assert.match(h.app.markup,/路线 · 4s/);
 h.advance(4000);assert.match(h.app.markup,/id="clock"[^>]*>\d+s/);
 h.advance(1000);assert.equal(h.clock.textContent,`${h.run('tests[state.i].limit')-1}s`);
 assert.equal(h.canvas.width,966); // 322 CSS px × device density 3.
 if(i===7)assert.equal(h.canvas.height,966); // 8×8 cells retain a square canvas.
 h.resize(410);h.run('drawBoard(state.current)');assert.equal(h.canvas.width,1230);
 h.run('navMove(dirsFromPath(maps[state.current.t.map].path)[0])');
 assert.equal(h.run('state.current.moves.length'),1);
 assert.doesNotMatch(h.app.markup,/assessment-strip/);
}
// All-independent play still yields 100/S++ and zero AI dependency after all 8 results.
{
 const h=harness();h.run('newGame()');
 for(let i=0;i<8;i++){
  h.until(()=>h.run(`state.screen==='play'&&state.i===${i}&&!['show','preview'].includes(state.current.phase)`));
  h.run(`{const c=state.current,t=c.t;if(t.type==='math'){for(const q of t.questions){for(const n of String(q[1]))mathKey(n);mathKey('submit')}}else if(t.type==='memory'){expectedMemory(c).forEach(memPick);finishAssessment()}else if(t.type==='nav'){dirsFromPath(maps[t.map].path).forEach(navMove)}else if(t.type==='robot'){const m=maps.robot;[...pathfind(m,m.start,m.battery),...pathfind(m,m.battery,m.goal)].forEach(robotAdd);robotRun()}else{c.selected=targetSort();sortSubmit()}}`);
  h.until(()=>h.run("state.screen==='settlement'"));assert.equal(h.run(`state.records[${i}].score`),100);
 }
 h.until(()=>h.run("state.screen==='report'"));assert.equal(h.run('reportStats().score'),100);assert.equal(h.run('reportStats().grade'),'S++');assert.equal(h.run('dependency()'),0);
}
console.log('通过：结算时序/提示折分/32 路 AI 接管/机器人执行/中断取消/标题计时/无进度行/单行机器人说明/高清画布/独立全流程 100 分（Node，无浏览器）');
