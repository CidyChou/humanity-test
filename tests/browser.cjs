'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.TEST_URL||'http://127.0.0.1:8876';
const shots=process.env.SHOTS_DIR||'/workspace/humanity-test-shots';
fs.mkdirSync(shots,{recursive:true});
const errors=[],external=[],results=[];
let browser;
async function main(){
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/opt/ungoogled-chromium/chrome',args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,acceptDownloads:true});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:'))external.push(r.url())});
 await page.addInitScript(()=>{
  window.__loads=[];
  let start=0;
  new MutationObserver(()=>{
   if(document.querySelector('.loading-screen')&&!start)start=performance.now();
   if(!document.querySelector('.loading-screen')&&start){window.__loads.push(performance.now()-start);start=0}
  }).observe(document,{childList:true,subtree:true});
 });
 const capture=async name=>page.screenshot({path:path.join(shots,name),fullPage:true});
 async function fits(label){
  const dims=await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,buttons:[...document.querySelectorAll('#app button:not(:disabled)')].map(b=>{let r=b.getBoundingClientRect();return {action:b.dataset.action,x:r.x,y:r.y,right:r.right,bottom:r.bottom}})}));
  assert.ok(dims.width<=390,`${label}: 横向溢出 ${dims.width}`);
  assert.ok(dims.height<=844,`${label}: 作答页面超高 ${dims.height}`);
  for(const b of dims.buttons)assert.ok(b.x>=0&&b.right<=390&&b.y>=0&&b.bottom<=844,`${label}: 按钮不可见 ${JSON.stringify(b)}`);
 }
 const action=(a,v)=>`[data-action="${a}"]${v===undefined?'':`[data-value="${v}"]`}`;
 await page.goto(origin);
 await page.waitForSelector('.loading-screen');await page.waitForTimeout(220);await capture('01-boot.png');
 await page.waitForFunction(()=>state.screen==='home');await fits('首页');await capture('02-home.png');
 const moving=await page.evaluate(async()=>{
  const nodes=['.ambient-layer.far','.ambient-layer.mid','.ambient-layer.near','.hero-bot','.hero-bot-body','.hero-eye','.hero-orbit'].map(s=>document.querySelector(s));
  const before=nodes.map(n=>getComputedStyle(n).transform);await new Promise(r=>setTimeout(r,220));
  return nodes.map((n,i)=>({moving:getComputedStyle(n).transform!==before[i],animations:n.getAnimations().length}));
 });
 assert.ok(moving.every(x=>x.animations>0));assert.ok(moving.filter(x=>x.moving).length>=6);
 await page.click(action('new'));
 const transitions=[];
 for(let i=0;i<8;i++){
  await page.waitForSelector('.loading-screen');
  assert.equal(await page.evaluate(()=>localStorage.getItem(activeKey)),null,'转场不启动作答时钟');
  await page.waitForTimeout(250);await capture(`transition-${String(i+1).padStart(2,'0')}.png`);
  await page.waitForFunction(idx=>state.screen==='play'&&state.i===idx,i);
  await fits(`第 ${i+1} 关`);transitions.push(i+1);
  const type=await page.evaluate(()=>state.current.t.type);
  if(type==='memory')await page.waitForFunction(()=>state.current?.phase==='input');
  if(type==='nav')await page.waitForFunction(()=>state.current?.phase==='walk');
  await fits(`第 ${i+1} 关作答`);await page.waitForTimeout(380);await capture(`stage-${String(i+1).padStart(2,'0')}.png`);
  if(type==='math'){
   const answers=await page.evaluate(()=>state.current.t.questions.map(q=>String(q[1])));
   for(const answer of answers){for(const digit of answer)await page.click(action('math',digit));await page.click(action('math','submit'))}
  }else if(type==='memory'){
   const sequence=await page.evaluate(()=>expectedMemory(state.current));
   for(const n of sequence)await page.click(action('mem',n));
   await page.click(action('memsubmit'));
  }else if(type==='nav'){
   const moves=await page.evaluate(()=>dirsFromPath(maps[state.current.t.map].path));
   for(const v of moves)await page.click(action('navdir',v));
  }else if(type==='robot'){
   const commands=await page.evaluate(()=>{const m=maps.robot;return [...pathfind(m,m.start,m.battery),...pathfind(m,m.battery,m.goal)]});
   for(const v of commands)await page.click(action('robotdir',v));
   await page.click(action('robotrun'));
  }else{
   const selected=await page.evaluate(()=>targetSort());
   for(const n of selected)await page.click(action('sort',n));
   await page.click(action('sortsubmit'));
  }
 }
 await page.waitForFunction(()=>state.screen==='report');
 const final=await page.evaluate(()=>({stats:reportStats(),records:state.records,loads:window.__loads}));
 assert.equal(final.stats.score,100);assert.equal(final.stats.raw,100);assert.equal(final.stats.grade,'S');assert.equal(final.stats.final,true);
 assert.equal(final.records.length,8);assert.ok(final.records.every(r=>r.score===100&&r.raw===100&&r.exact&&r.mode==='self'));
 assert.equal(final.loads.length,10);assert.ok(final.loads.every(ms=>ms>=1100&&ms<1600),JSON.stringify(final.loads));
 assert.equal(await page.locator('.report-review').count(),6);
 await page.waitForTimeout(850);await capture('report.png');
 const [download]=await Promise.all([page.waitForEvent('download'),page.click(action('reportpng'))]);
 await download.saveAs(path.join(shots,'HUMAN-01-report.png'));
 results.push({fullRun:'100 / S',transitions,loadDurationsMs:final.loads.map(Math.round),pngBytes:fs.statSync(path.join(shots,'HUMAN-01-report.png')).size});

 // The actual scoring implementation must remain byte-for-byte identical to V3.0/V3.1 baseline.
 const baseline=execFileSync('git',['show','c6410f4:index.html'],{encoding:'utf8'});
 const current=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const evaluator=s=>s.slice(s.indexOf('function evaluate(c)'),s.indexOf('function finishAssessment('));
 assert.equal(evaluator(current),evaluator(baseline));
 const scoreCases=await page.evaluate(()=>{
  const out=[];
  const check=(name,c,want)=>{const actual=evaluate(c).raw;if(actual!==want)throw Error(name+': '+actual+' != '+want);out.push([name,actual])};
  let c=makeCurrent(tests[1]);c.picks=expectedMemory(c).slice(0,3);check('记忆半分',c,50);
  c=makeCurrent(tests[2]);const m=maps.nav,route=dirsFromPath(m.path),opposite={'↑':'↓','↓':'↑','←':'→','→':'←'};c.moves=[route[0],opposite[route[0]],...route];c.pos=[...m.goal];check('导航多走两步',c,87);
  c.collisions=1;check('导航碰撞扣分',c,82);
  c=makeCurrent(tests[3]);c.pos=[...maps.robot.goal];c.battery=true;c.queue=Array(10).fill('→');check('编程最优',c,100);
  c.queue.push('←','→');check('编程效率',c,95);c.collisions=1;check('编程碰撞',c,60);
  c=makeCurrent(tests[4]);const good=targetSort(),bad=parcels.findIndex((_,i)=>!good.includes(i));c.selected=[...good.slice(0,4),bad];check('筛选误选',c,60);
  c=makeCurrent(tests[0]);c.answers=[String(c.t.questions[0][1])];check('心算部分分',c,33);
  return out;
 });
 results.push({scoringImplementation:'unchanged',scoreCases});

 // Finish-mode checks use the real automatic settlement and persisted record.
 for(const [mode,want,reason] of [['hint',70,'submit'],['auto',0,'submit'],['self',100,'timeout'],['self',0,'abandoned']]){
  const r=await page.evaluate(({mode,reason})=>{
   clearTimers();state.records=[];state.i=0;state.screen='play';let c=state.current=makeCurrent(tests[0]);c.started=true;c.answers=c.t.questions.map(q=>String(q[1]));c.hints=mode==='hint'?1:0;c.auto=mode==='auto';finishAssessment(reason,c.auto);const r={...state.records[0],dependency:dependency()};clearTimers();return r;
  },{mode,reason});
  assert.equal(r.score,want);assert.equal(r.raw,reason==='abandoned'?0:100);if(reason==='timeout')assert.equal(r.exact,false);
  assert.equal(r.dependency,mode==='hint'?8:mode==='auto'?20:0);
 }
 results.push({settlement:['提示100→70 / 依赖8','代做100→0 / 依赖20','超时不算exact','中断0分']});

 // Reload during play: only the active item is abandoned; completed items and deck survive.
 await page.evaluate(()=>{clearTimers();applyRound(QuestionBank.create());state.records=[];save();startStage(0)});
 await page.waitForFunction(()=>state.screen==='play');
 const deck=await page.evaluate(()=>JSON.stringify(roundDeck));
 await page.evaluate(()=>{state.current.answers=state.current.t.questions.map(q=>String(q[1]));finishAssessment()});
 await page.waitForFunction(()=>state.screen==='play'&&state.i===1);
 await page.reload();await page.waitForFunction(()=>state.screen==='home');
 const restored=await page.evaluate(()=>({deck:JSON.stringify(roundDeck),records:state.records,active:localStorage.getItem(activeKey)}));
 assert.equal(restored.deck,deck);assert.equal(restored.records[0].score,100);assert.equal(restored.records[1].reason,'abandoned');assert.equal(restored.records[1].score,0);assert.equal(restored.active,null);
 await page.click(action('resume'));await page.waitForFunction(()=>state.screen==='play'&&state.i===2);
 assert.equal(await page.evaluate(()=>JSON.stringify(roundDeck)),deck);
 results.push({resume:'原键、原题、完成项保留、当前项中断0分'});

 // Existing saves without a deck must still show their original fixed-question review.
 await page.evaluate(()=>{clearTimers();localStorage.clear();localStorage.setItem('humanity01-v1','keep');localStorage.setItem(storageV2,JSON.stringify({records:[{id:'math',mode:'self',raw:100,score:100,exact:true,detail:'旧存档',review:{answers:['102','85','12'],picks:[],moves:[]}}]}))});
 await page.reload();await page.waitForFunction(()=>state.screen==='home');
 assert.equal(await page.evaluate(()=>state.records[0].score),100);
 assert.equal(await page.evaluate(()=>tests[0].questions[0][0]),'17 × 6');
 assert.equal(await page.evaluate(()=>localStorage.getItem('humanity01-v1')),'keep');

 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>renderHome());
 const reduced=await page.evaluate(()=>[...document.querySelectorAll('.ambient-layer,.hero-bot,.hero-eye')].every(n=>getComputedStyle(n).animationName==='none'));
 assert.ok(reduced);await page.click(action('new'));await page.click('#confirm-modal');
 await page.waitForFunction(()=>state.screen==='play'&&state.i===0);
 const reducedMs=await page.evaluate(()=>window.__loads.at(-1));assert.ok(reducedMs>=250&&reducedMs<650);
 await fits('减少动态效果');results.push({reducedMotion:true,durationMs:Math.round(reducedMs),legacySave:true});

 // Opening a local HTML file needs no server, module loader or fetch request.
 const offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));
 const offlineExternal=[];offline.on('request',r=>{if(/^https?:/.test(r.url()))offlineExternal.push(r.url())});
 await offline.goto('file://'+path.resolve(__dirname,'../index.html'));await offline.waitForFunction(()=>state.screen==='home');
 await offline.click(action('new'));await offline.waitForFunction(()=>state.screen==='play');
 assert.deepEqual(offlineExternal,[]);assert.equal(await offline.evaluate(()=>QuestionBank.validate(roundDeck)),true);
 results.push({fileProtocol:true,externalRequests:external});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 fs.writeFileSync(path.join(shots,'validation.json'),JSON.stringify({viewport:'390×844',errors,results},null,2)+'\n');
 console.log(JSON.stringify({viewport:'390×844',errors,results},null,2));
 await browser.close();
}
main().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1});
