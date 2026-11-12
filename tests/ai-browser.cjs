'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),shots=process.env.SHOTS_DIR||'/workspace/humanity-test-shots';
const url=process.env.TEST_URL||pathToFileURL(path.join(root,'index.html')).href;
const statusFile=path.join(__dirname,'ai-browser-status.json');
let browser;const errors=[],results=[];
async function main(){
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/opt/ungoogled-chromium/chrome',args:['--no-sandbox']});
 fs.mkdirSync(shots,{recursive:true});
 for(const reduced of [false,true])for(const mode of ['manual','timeout']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,reducedMotion:reduced?'reduce':'no-preference',acceptDownloads:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const outside=[];page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(new URL(url).origin))outside.push(r.url())});
  await page.goto(url);await page.waitForFunction(()=>state.screen==='home');
  await page.evaluate(mode=>{
   window.__playback=[];
   const original=renderStage;renderStage=function(){original();const c=state.current;if(c?.auto)window.__playback.push({i:state.i,step:c.aiStep,total:c.aiTotal,allLocked:[...document.querySelectorAll('#app button')].every(b=>b.disabled)})};
   if(mode==='timeout')for(const t of tests){t.limit=1;if(t.type==='memory')t.flash=30;if(t.type==='nav')t.preview=1}
  },mode);
  await page.click('[data-action="new"]');
  for(let i=0;i<8;i++){
   await page.waitForFunction(i=>state.screen==='play'&&state.i===i,i);
   await page.waitForTimeout(350);
   const readability=await page.evaluate(()=>({font:parseFloat(getComputedStyle(document.querySelector('.task-instruction')).fontSize),color:getComputedStyle(document.querySelector('.task-instruction')).color,width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,auto:!!document.querySelector('[data-action="auto"]'),rules:[...document.querySelectorAll('.rule')].map(n=>({font:parseFloat(getComputedStyle(n).fontSize),color:getComputedStyle(n).color}))}));
   assert.ok(readability.font>=15);assert.equal(readability.color,'rgb(53, 68, 109)');assert.ok(readability.auto);
   assert.ok(readability.width<=390&&readability.height<=844,`Stage ${i+1} overflow: ${JSON.stringify(readability)}`);
   if(i===4){assert.equal(readability.rules.length,3);assert.ok(readability.rules.every(r=>r.font>=16&&r.color==='rgb(36, 54, 94)'))}
   if(mode==='manual')await page.click('[data-action="auto"]');
   await page.waitForFunction(()=>state.current?.auto===true);
   assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#app button')].every(b=>b.disabled)),true);
   const unchanged=await page.evaluate(()=>{let c=state.current,before=JSON.stringify([c.answers,c.picks,c.moves,c.queue,c.selected]);document.dispatchEvent(new KeyboardEvent('keydown',{key:'9'}));document.querySelector('[data-action="auto"]').click();return before===JSON.stringify([c.answers,c.picks,c.moves,c.queue,c.selected])});assert.ok(unchanged);
   if(!reduced){
    await page.waitForFunction(()=>state.current?.aiStep>=(state.current?.t.type==='robot'?13:2));
    assert.ok(await page.locator('.ai-target').count());
    await page.screenshot({path:path.join(shots,`ai-${mode}-${String(i+1).padStart(2,'0')}.png`)});
   }
   await page.waitForFunction(i=>state.records.length===i+1,i);
   const record=await page.evaluate(i=>state.records[i],i);
   assert.equal(record.mode,'auto');assert.equal(record.raw,100);assert.equal(record.score,0);assert.equal(record.reason,mode==='timeout'?'timeout':'submit');
   assert.equal(await page.evaluate(()=>dependency()),Math.min(100,(i+1)*20));
  }
  await page.waitForFunction(()=>state.screen==='report');
  const summary=await page.evaluate(()=>({score:reportStats().score,dependency:dependency(),tag:reportTag(),family:reportLabels.AI.includes(reportTag()),steps:window.__playback,timeoutNotes:[...document.querySelectorAll('.assessment-meta')].filter(n=>n.textContent.includes('超时由 AI 代做')).length}));
  assert.equal(summary.score,0);assert.equal(summary.dependency,100);assert.ok(summary.family);assert.ok(summary.steps.every(s=>s.allLocked));
  if(mode==='timeout')assert.equal(summary.timeoutNotes,8);
  for(let i=0;i<8;i++){const frames=summary.steps.filter(s=>s.i===i);assert.ok(new Set(frames.map(s=>s.step)).size>5)}
  if(!reduced){await page.waitForTimeout(700);await page.screenshot({path:path.join(shots,`ai-${mode}-report.png`),fullPage:true})}
  await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__shared=data}});window.__canvasTexts=[];const text=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(value,...args){window.__canvasTexts.push(String(value));return text.call(this,value,...args)}});
  await page.click('[data-action="share"]');assert.ok((await page.evaluate(()=>window.__shared.text)).includes(summary.tag));
  const [download]=await Promise.all([page.waitForEvent('download'),page.click('[data-action="reportpng"]')]);
  const pngPath=path.join(shots,`ai-${mode}${reduced?'-reduced':''}-card.png`);await download.saveAs(pngPath);
  const png=fs.readFileSync(pngPath);assert.equal(png.readUInt32BE(16),750);assert.equal(png.readUInt32BE(20),1160);
  assert.ok(await page.evaluate(tag=>window.__canvasTexts.includes(tag),summary.tag));
  await page.reload();await page.waitForFunction(()=>state.screen==='home');await page.click('[data-action="resume"]');await page.waitForFunction(()=>state.screen==='report');assert.equal(await page.locator('.report-verdict').textContent(),summary.tag);
  for(const [family,score] of [['S',95],['A',85],['B',70],['C',50],['D',25]]){
   await page.evaluate(score=>{state.records=tests.map(t=>({id:t.id,raw:score,score,mode:'self',exact:true,reason:'submit',detail:'测试成绩'}));reportLabel=null;renderReport()},score);
   assert.equal(await page.evaluate(f=>reportLabels[f].includes(reportTag()),family),true);
   const dimensions=await page.locator('.report-verdict').evaluate(el=>({size:parseFloat(getComputedStyle(el).fontSize),animation:getComputedStyle(el).animationName,right:el.getBoundingClientRect().right}));
   assert.ok(dimensions.size>=34&&dimensions.right<=390);assert.equal(dimensions.animation,reduced?'none':'verdict-stamp');
   if(!reduced&&mode==='manual'&&family==='S'){await page.waitForTimeout(700);await page.screenshot({path:path.join(shots,'report-S-verdict.png'),fullPage:true})}
  }
  assert.deepEqual(outside,[]);results.push({mode,reduced,stages:8,score:0,dependency:100,pngAndShare:true,allLabelBuckets:true});await context.close();
 }
 assert.deepEqual(errors,[]);const output={passed:true,viewport:'390×844',errors,results};fs.writeFileSync(statusFile,JSON.stringify(output,null,2)+'\n');fs.writeFileSync(path.join(shots,'ai-validation.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));await browser.close();
}
main().catch(async e=>{const output={passed:false,browserAcceptance:false,error:e.message.slice(0,1800),errors,results};fs.writeFileSync(statusFile,JSON.stringify(output,null,2)+'\n');console.error(e.message.slice(0,1800));if(browser)await browser.close();process.exitCode=1});
