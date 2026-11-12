/* A single, cancellable playback path for manual and timeout takeovers. */
'use strict';
function runAIDemo(source='manual'){
 const c=state.current;if(!c||!c.started||c.finished||c.auto||c.locked)return;
 const t=c.t,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 c.submitElapsed=c.deadline?t.limit-remaining(c):0;c.seconds=c.deadline?remaining(c):c.seconds;
 clearTimers();cancelAnimationFrame(boardFrame);c.deadline=0;
 document.querySelectorAll('.modal-bg').forEach(el=>el.remove());
 c.auto=true;c.locked=true;c.takeoverReason=source;c.feedback='';c.phase=t.type==='nav'?'walk':'input';
 c.input='';c.answers=[];c.picks=[];c.active=-1;c.moves=[];c.trail=[];c.collisions=0;
 c.queue=[];c.executed=0;c.battery=false;c.selected=[];c.showPath=true;
 if(t.map)c.pos=[...maps[t.map].start];
 const steps=[],add=(run,selector)=>steps.push({run,selector});
 const target=(action,value)=>`[data-action="${action}"]${value===undefined?'':`[data-value="${value}"]`}`;
 if(t.type==='math'){
  for(const [index,q] of t.questions.entries()){
   [...String(q[1])].forEach((digit,i)=>add(()=>{c.input=i?c.input+digit:digit},target('math',digit)));
   add(()=>{c.answers.push(String(q[1]));if(index<t.questions.length-1)c.input=''},target('math','submit'));
  }
 }else if(t.type==='memory'){
  expectedMemory(c).forEach(v=>add(()=>{c.active=v;c.picks.push(v)},target('mem',v)));
  add(()=>{c.active=-1},target('memsubmit'));
 }else if(t.type==='nav'){
  dirsFromPath(maps[t.map].path).forEach(v=>add(()=>{c.trail.push(c.pos);c.pos=step(maps[t.map],c.pos,v);c.moves.push(v);c.steps=c.moves.length},target('navdir',v)));
 }else if(t.type==='robot'){
  const m=maps[t.map],program=[...pathfind(m,m.start,m.battery),...pathfind(m,m.battery,m.goal)];
  program.forEach(v=>add(()=>c.queue.push(v),target('robotdir',v)));
  add(()=>{c.running=true},target('robotrun'));
  program.forEach(v=>add(()=>{c.trail.push(c.pos);c.pos=step(m,c.pos,v);c.battery=c.battery||eq(c.pos,m.battery);c.executed++},'.boardwrap'));
 }else{
  targetSort().forEach(i=>add(()=>c.selected.push(i),target('sort',i)));
  add(()=>{},target('sortsubmit'));
 }
 c.aiTotal=steps.length;c.aiStep=0;c.aiTarget='';markActive(c);renderStage();
 const interval=reduced?22:t.type==='nav'?105:t.type==='robot'?110:145;
 let index=0;
 function next(){
  if(state.current!==c||c.finished)return;
  if(index===steps.length){c.aiTarget='';renderStage();later(()=>finishAssessment(source==='timeout'?'timeout':'submit',true),reduced?60:(t.type==='robot'?750:260));return}
  const item=steps[index++];item.run();c.aiStep=index;c.aiTarget=item.selector;
  if(!reduced)tone();renderStage();later(next,interval);
 }
 later(next,reduced?30:180);
}
function paintAIDemo(c){
 if(!c.auto||!c.locked)return;
 app.querySelectorAll('button').forEach(b=>b.disabled=true);
 const target=c.aiTarget&&app.querySelector(c.aiTarget);
 if(target){target.classList.add('ai-target');const cursor=document.createElement('span');cursor.className='ai-pointer';cursor.setAttribute('aria-hidden','true');target.append(cursor)}
}
