/* HUMAN/01 V3.1 — bounded, validated offline question generators. */
'use strict';
const QuestionBank=(()=>{
 const colors=['#679bbd','#d89a68','#83aa77'];
 const shapes=['circle','square','triangle'];
 const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
 const key=p=>p.join(',');
 const directions=[[0,-1],[-1,0],[0,1],[1,0]];
 function randomInt(min,max){
  const span=max-min+1,limit=Math.floor(4294967296/span)*span;
  const value=new Uint32Array(1);let n;
  do{if(globalThis.crypto?.getRandomValues){crypto.getRandomValues(value);n=value[0]}else n=Math.floor(Math.random()*4294967296)}while(n>=limit);
  return min+n%span;
 }
 function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=randomInt(0,i);[a[i],a[j]]=[a[j],a[i]]}return a}
 function free(m,p){return p[0]>=0&&p[1]>=0&&p[0]<m.w&&p[1]<m.h&&!m.walls.some(w=>same(w,p))}
 function shortest(m,start,goal){
  const queue=[[start,0]],seen=new Set([key(start)]);
  for(let i=0;i<queue.length;i++){
   const [p,d]=queue[i];if(same(p,goal))return d;
   for(const [dx,dy] of directions){const n=[p[0]+dx,p[1]+dy];if(free(m,n)&&!seen.has(key(n))){seen.add(key(n));queue.push([n,d+1])}}
  }
  return Infinity;
 }
 function math(hard,used){
  let q;
  function unique(make){for(let i=0;i<100;i++){const v=make();if(!used.has(v[0])){used.add(v[0]);return v}}throw Error('心算生成失败')}
  if(!hard){
   q=[unique(()=>{const a=randomInt(13,19),b=randomInt(4,8);return [`${a} × ${b}`,a*b]}),
      unique(()=>{const a=randomInt(28,59),b=randomInt(27,58);return [`${a} + ${b}`,a+b]}),
      unique(()=>{const b=randomInt(6,9),a=randomInt(10,14)*b;return [`${a} ÷ ${b}`,a/b]})];
  }else{
   q=[unique(()=>{const a=randomInt(31,39),b=randomInt(21,26);return [`${a} × ${b}`,a*b]}),
      unique(()=>{const a=randomInt(13,17)*12,b=randomInt(3,6)*6,c=randomInt(6,8);return [`(${a} − ${b}) × ${c}`,(a-b)*c]}),
      unique(()=>{const b=randomInt(11,14),a=randomInt(60,76)*b,c=randomInt(16,23),d=randomInt(6,8);return [`${a} ÷ ${b} + ${c} × ${d}`,a/b+c*d]})];
  }
  const [a,,b]=q[0][0].split(' ');
  return {questions:q,hint:`把 ${a} × ${b} 拆成整十数与个位数分别相乘。`};
 }
 function memory(length){
  const seq=shuffle(Array.from({length:9},(_,i)=>i));
  if(length===6)return seq.slice(0,6);
  // Original reverse task: nine distinct positions and one non-adjacent repeat.
  const repeated=seq[randomInt(0,8)],slots=Array.from({length:10},(_,i)=>i).filter(i=>seq[i]!==repeated&&seq[i-1]!==repeated);
  seq.splice(slots[randomInt(0,slots.length-1)],0,repeated);return seq;
 }
 function turns(path){let n=0;for(let i=2;i<path.length;i++)if(path[i][0]-path[i-1][0]!==path[i-1][0]-path[i-2][0]||path[i][1]-path[i-1][1]!==path[i-1][1]-path[i-2][1])n++;return n}
 function route(w,h,length){
  const start=[0,h-1],goal=[w-1,0],path=[start],seen=new Set([key(start)]);
  function visit(){
   const p=path.at(-1),left=length-path.length+1,dist=Math.abs(goal[0]-p[0])+Math.abs(goal[1]-p[1]);
   if(dist>left||(left-dist)%2||(!left&&!same(p,goal)))return false;
   if(!left)return turns(path)>=(length===20?12:5)&&turns(path)<=(length===20?18:9);
   if(same(p,goal))return false;
   for(const [dx,dy] of shuffle(directions)){
    const n=[p[0]+dx,p[1]+dy];if(n[0]<0||n[0]>=w||n[1]<0||n[1]>=h||seen.has(key(n)))continue;
    seen.add(key(n));path.push(n);if(visit())return true;path.pop();seen.delete(key(n));
   }
   return false;
  }
  if(!visit())throw Error('路线生成失败');
  const flipX=randomInt(0,1),flipY=randomInt(0,1);
  return path.map(([x,y])=>[flipX?w-1-x:x,flipY?h-1-y:y]);
 }
 function map(kind){
  const robot=kind==='robot',final=kind==='final',w=final?8:7,h=final?8:robot?5:6,length=final?20:robot?10:11;
  const path=route(w,h,length),occupied=new Set(path.map(key));
  const cells=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(!occupied.has(`${x},${y}`))cells.push([x,y]);
  const m={w,h,start:path[0],goal:path.at(-1),path,walls:shuffle(cells).slice(0,final?14:robot?9:11),land:[]};
  if(robot)m.battery=path[3];
  else if(!final){const open=shuffle(cells.filter(p=>free(m,p))).slice(0,4);m.land=[...open.map((p,i)=>[...p,i%2?'house':'tree']),[...m.goal,'house']]}
  return m;
 }
 function matches(p,rule){return p.c===rule.color&&p.shape===rule.shape&&p.n%2===rule.parity&&p.stamp===rule.stamp}
 function sorting(){
  const rule={color:colors[randomInt(0,2)],shape:shapes[randomInt(0,2)],parity:randomInt(0,1),stamp:!!randomInt(0,1)};
  const numbers=shuffle([2,4,6,8,10,12,14].map(n=>n-rule.parity));
  const target=()=>({c:rule.color,shape:rule.shape,n:numbers.pop(),stamp:rule.stamp});
  const parcels=Array.from({length:5},target),seen=new Set(parcels.map(p=>JSON.stringify(p)));
  // Five near misses differ by exactly one attribute; five differ by two or more.
  for(let i=0;i<10;i++){
   const p={c:rule.color,shape:rule.shape,n:2*randomInt(1,7)-rule.parity,stamp:rule.stamp};
   const fields=shuffle(['c','shape','n','stamp']).slice(0,i<5?1:randomInt(2,4));
   for(const field of fields){if(field==='c')p.c=shuffle(colors.filter(c=>c!==rule.color))[0];if(field==='shape')p.shape=shuffle(shapes.filter(s=>s!==rule.shape))[0];if(field==='n')p.n=p.n%2?p.n+1:p.n-1;if(field==='stamp')p.stamp=!rule.stamp}
   if(seen.has(JSON.stringify(p))){i--;continue}seen.add(JSON.stringify(p));parcels.push(p);
  }
  return {rule,parcels:shuffle(parcels)};
 }
 function create(){
  const used=new Set();
  const round={version:1,math:math(false,used),finalmath:math(true,used),memory:memory(6),finalmemory:memory(10),nav:map('nav'),robot:map('robot'),finalnav:map('final'),sort:sorting()};
  if(!validate(round))throw Error('题库校验失败');return round;
 }
 // Validation is also applied to localStorage data before restoring a round.
 function validate(round){
  try{
   if(!round||round.version!==1)return false;
   const expressions=new Set();
   for(const [id,hard] of [['math',false],['finalmath',true]]){
    const qs=round[id].questions;if(qs.length!==3)return false;
    for(const [i,q] of qs.entries()){
     if(!Array.isArray(q)||q.length!==2||typeof q[0]!=='string'||expressions.has(q[0]))return false;
     expressions.add(q[0]);let parts,result;
     if(i===0){parts=q[0].match(/^(\d{2}) × (\d{1,2})$/);if(!parts)return false;const a=+parts[1],b=+parts[2];if(a<(hard?31:13)||a>(hard?39:19)||b<(hard?21:4)||b>(hard?26:8))return false;result=a*b}
     else if(!hard&&i===1){parts=q[0].match(/^(\d{2}) \+ (\d{2})$/);if(!parts)return false;const a=+parts[1],b=+parts[2];if(a<28||a>59||b<27||b>58)return false;result=a+b}
     else if(!hard){parts=q[0].match(/^(\d{2,3}) ÷ ([6-9])$/);if(!parts||+parts[1]/+parts[2]<10||+parts[1]/+parts[2]>14)return false;result=+parts[1]/+parts[2]}
     else if(i===1){parts=q[0].match(/^\((\d{3}) − (\d{2})\) × ([6-8])$/);if(!parts)return false;const a=+parts[1],b=+parts[2];if(a<156||a>204||a%12||b<18||b>36||b%6)return false;result=(a-b)*+parts[3]}
     else{parts=q[0].match(/^(\d{3,4}) ÷ (1[1-4]) \+ (\d{2}) × ([6-8])$/);if(!parts)return false;const a=+parts[1]/+parts[2],b=+parts[3];if(a<60||a>76||!Number.isInteger(a)||b<16||b>23)return false;result=a+b*+parts[4]}
     if(!Number.isInteger(result)||q[1]!==result)return false;
    }
   }
   for(const [id,len,minUnique] of [['memory',6,6],['finalmemory',10,8]]){const s=round[id];if(!Array.isArray(s)||s.length!==len||s.some((v,i)=>!Number.isInteger(v)||v<0||v>8||(i&&v===s[i-1]))||new Set(s).size<minUnique)return false}
   for(const [id,w,h,len,walls] of [['nav',7,6,11,11],['robot',7,5,10,9],['finalnav',8,8,20,14]]){
    const m=round[id];if(m.w!==w||m.h!==h||m.path.length!==len+1||m.walls.length!==walls)return false;
    const cell=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isInteger)&&p[0]>=0&&p[0]<w&&p[1]>=0&&p[1]<h;
    if(!m.walls.every(cell)||new Set(m.walls.map(key)).size!==walls||!m.path.every(cell)||new Set(m.path.map(key)).size!==len+1||!same(m.path[0],m.start)||!same(m.path.at(-1),m.goal))return false;
    if(m.path.some((p,i)=>!free(m,p)||(i&&Math.abs(p[0]-m.path[i-1][0])+Math.abs(p[1]-m.path[i-1][1])!==1)))return false;
    const optimal=shortest(m,m.start,m.goal);if(optimal<(id==='finalnav'?14:len)||optimal>(id==='finalnav'?18:len))return false;
    if(id==='robot'&&(!cell(m.battery)||!same(m.battery,m.path[3])||shortest(m,m.start,m.battery)+shortest(m,m.battery,m.goal)!==10))return false;
    if(!Array.isArray(m.land)||m.land.some(p=>!Array.isArray(p)||p.length!==3||!cell(p.slice(0,2))||!free(m,p)||!['tree','house'].includes(p[2])))return false;
   }
   const {rule,parcels}=round.sort;
   if(!colors.includes(rule.color)||!shapes.includes(rule.shape)||![0,1].includes(rule.parity)||typeof rule.stamp!=='boolean'||parcels.length!==15)return false;
   if(parcels.some(p=>!colors.includes(p.c)||!shapes.includes(p.shape)||!Number.isInteger(p.n)||p.n<1||p.n>14||typeof p.stamp!=='boolean')||new Set(parcels.map(p=>JSON.stringify(p))).size!==15||parcels.filter(p=>matches(p,rule)).length!==5)return false;
   return true;
  }catch{return false}
 }
 return {create,validate,matches,shortest};
})();
if(typeof module!=='undefined')module.exports=QuestionBank;
