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
function harness(reduced=false,animated=false){
 let now=10000,id=0,cssWidth=322;
 const pending=new Map(),storage=new Map(),frames=new Map(),canvasTexts=[],strokes=[];
 const element=()=>({classList:{add(){},toggle(){}},append(){},setAttribute(){},animate(){}});
 const clock=element(),ctx=new Proxy({fillText:s=>canvasTexts.push(s),stroke(){strokes.push(this.strokeStyle)}},{get:(target,key)=>target[key]||(()=>{})});
 const canvas={width:840,height:840,getBoundingClientRect:()=>({width:cssWidth,height:cssWidth,left:0,top:0}),getContext:()=>ctx};
 const app={markup:'',buttons:[],listeners:{},addEventListener(event,fn){this.listeners[event]=fn},querySelector:()=>element(),querySelectorAll(){return this.buttons}};
 Object.defineProperty(app,'innerHTML',{get(){return this.markup},set(v){this.markup=v;this.buttons=[...v.matchAll(/<button\b([^>]*)>/g)].map(m=>({...element(),disabled:/\sdisabled(?:\s|$)/.test(m[1])}));}});
 const document={body:{dataset:{}},addEventListener(){},querySelectorAll:()=>[],querySelector:s=>s==='#app'?app:s==='.ambient'?element():s==='#gameboard'&&app.markup.includes('id="gameboard"')?canvas:s==='.stage-meta #clock'?clock:null,createElement:element};
 const schedule=(fn,delay,repeat=0)=>{const n=++id;pending.set(n,{fn,at:now+delay,repeat});return n};
 const context=vm.createContext({document,Math,Uint32Array,performance:{now:()=>now},Date:class extends Date{static now(){return now}},matchMedia:()=>({matches:reduced}),setTimeout:(fn,d)=>schedule(fn,d),clearTimeout:n=>pending.delete(n),setInterval:(fn,d)=>schedule(fn,d,d),clearInterval:n=>pending.delete(n),requestAnimationFrame:fn=>{if(!animated)return 0;const n=++id;frames.set(n,fn);return n},cancelAnimationFrame:n=>frames.delete(n),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{scrollTo(){},addEventListener(){},devicePixelRatio:3}});
 for(const file of ['questions.js','ai-demo.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 vm.runInContext(source,context);
 const run=s=>vm.runInContext(s,context);
 if(!animated)run('animateStage=()=>{}');
 run('tone=()=>{};state.sound=false');
 function advance(ms){const end=now+ms;let count=0;while(true){const next=[...pending.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;assert.ok(++count<20000,'Timer loop');const [n,item]=next;now=item.at;if(item.repeat)item.at+=item.repeat;else pending.delete(n);item.fn()}now=end}
 function until(predicate){let count=0;while(!predicate()){assert.ok(++count<20000,'Timer loop');const next=[...pending.values()].sort((a,b)=>a.at-b.at)[0];assert.ok(next,'Expected pending timer');advance(next.at-now)}}
 const setup=i=>run(`clearTimers();state.records=[];state.i=${i};state.screen='play';state.current=makeCurrent(tests[${i}]);begin()`);
 const settlementEvent=event=>app.listeners[event]({target:{closest:selector=>selector==='.settlement-screen'?{}:null}});
 const frame=()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now))};
 return {run,advance,until,setup,app,canvas,clock,canvasTexts,strokes,frames,frame,settlementEvent,resize:w=>{cssWidth=w},get now(){return now}};
}
module.exports={harness};
if(require.main===module){
for(const reduced of [false,true]){
 const settleMs=reduced?2000:3000,loadMs=reduced?300:1220;
 // Independent and hinted scores are saved before the yellow result; no early next stage.
 for(const hinted of [false,true]){
  const h=harness(reduced);h.setup(0);
  h.run(`state.current.answers=state.current.t.questions.map(q=>String(q[1]));state.current.hints=${hinted?1:0};finishAssessment()`);
  assert.equal(h.run('state.screen'),'settlement');
  assert.equal(h.run('state.records[0].score'),hinted?70:100);
  assert.match(h.app.markup,new RegExp(`settlement-score [^"]*">${hinted?70:100}</div>`));
  assert.match(h.app.markup,/独立评估分/);
  assert.match(h.app.markup,/点击继续/);
  h.run('finishAssessment()');assert.equal(h.run('state.records.length'),1);
  h.advance(settleMs-1);assert.equal(h.run('state.screen'),'settlement');
  h.advance(1);assert.equal(h.run('state.screen'),'loading');
  h.advance(loadMs);assert.equal(h.run('state.screen'),'play');assert.equal(h.run('state.i'),1);
 }
 // Click and touch share the same guarded callback; a stale timer cannot start twice.
 for(const event of ['click','pointerup']){
  const h=harness(reduced);h.setup(0);
  h.run('globalThis.starts=0;const originalStart=startStage;startStage=i=>{starts++;originalStart(i)};finishAssessment()');
  h.advance(499);h.settlementEvent(event);assert.equal(h.run('state.screen'),'settlement');
  assert.equal(h.run('starts'),0);
  h.advance(1);h.settlementEvent(event);assert.equal(h.run('state.screen'),'loading');
  assert.equal(h.run('starts'),1);
  h.settlementEvent('pointerup');h.settlementEvent('click');h.run('finishAssessment()');
  h.advance(settleMs);assert.equal(h.run('starts'),1);
  assert.equal(h.run('state.screen'),'play');assert.equal(h.run('state.i'),1);
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
  assert.doesNotMatch(h.app.markup,/settlement-speed|速度 −/);
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
 assert.match(h.app.markup,/<div class="play-area"><header class="top">[\s\S]*<div class="progressline">[\s\S]*class="stage [\s\S]*<div class="tools">/);
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
// Start cues begin only when controls become available; finalnav keeps its route hidden.
for(const reduced of [false,true])for(const i of [2,3,7]){
 const h=harness(reduced,true);h.setup(i);
 if(i!==3){
  assert.equal(h.run('state.current.spotlightUntil||0'),0);
  assert.equal(h.frames.size,0,'No idle animation during route preview');
  h.advance(5000);
 }
 assert.equal(h.run('state.current.spotlightUntil'),h.now+1200);
 assert.equal(h.frames.size,reduced?0:1);
 h.canvasTexts.length=0;h.strokes.length=0;h.run('drawBoard(state.current)');
 assert.ok(h.canvasTexts.includes('起点'));assert.ok(h.canvasTexts.includes('终点'));
 if(i===7){
  assert.equal(h.run('state.current.showPath'),false);
  assert.ok(!h.strokes.includes('#3c65e4'),'No standard route in finalnav walk phase');
 }
 h.advance(1201);h.frame();assert.equal(h.frames.size,reduced?0:1,'Only one idle frame is pending');
 if(i!==3){
  const direction=h.run('dirsFromPath(maps[state.current.t.map].path)[0]');
  h.canvas.onpointerdown({clientX:100,clientY:100});
  h.run('drawBoard(state.current)');h.frame(); // Must not erase a gesture between frames.
  const [dx,dy]={'↑':[0,-40],'↓':[0,40],'←':[-40,0],'→':[40,0]}[direction];
  h.canvas.onpointerup({clientX:100+dx,clientY:100+dy});
  assert.equal(h.run('state.current.moves.length'),1);
  if(i===7){h.strokes.length=0;h.run('drawBoard(state.current)');assert.ok(!h.strokes.includes('#86a7e5'),'No player trail in finalnav')}
  h.advance(130);h.frame();assert.equal(h.run('!!state.current.boardTween'),false);
 }
 h.run('autoDo()');assert.equal(h.run('state.current.spotlightUntil'),0);
 assert.equal(h.run('boardHasIdle(state.current)'),false);
 h.advance(130);h.frame();assert.ok(h.frames.size<=1,'AI movement can own at most one tween');
 h.run('renderHome()');assert.equal(h.frames.size,0);
 h.setup(i);if(i!==3)h.advance(5000);
 h.run('finishAssessment()');assert.equal(h.frames.size,0);
 h.run('drawBoard(state.current)');assert.equal(h.frames.size,0,'A finished board cannot restart animation');
 h.setup(i);if(i!==3)h.advance(5000);
 h.run('startStage(0)');assert.equal(h.frames.size,0,'Changing stage cancels animation immediately');
}
// The final settlement also supports clicking through to the report exactly once.
for(const reduced of [false,true]){
 const h=harness(reduced);h.setup(7);h.advance(5000);
 h.run('dirsFromPath(maps[state.current.t.map].path).forEach(navMove)');
 h.advance(500);h.settlementEvent('pointerup');h.settlementEvent('click');
 assert.equal(h.run('state.screen'),'loading');
 h.advance(reduced?300:1220);assert.equal(h.run('state.screen'),'report');
 h.advance(3000);assert.equal(h.run('state.screen'),'report');
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
}
