'use strict';
const assert=require('node:assert/strict');
const Q=require('../questions.js');
const ids=['math','memory','nav','robot','sort','finalmath','finalmemory','finalnav'];
const variants=ids.map(()=>new Set());
const started=performance.now();let worst=0;
for(let i=0;i<1000;i++){
 const before=performance.now(),round=Q.create();worst=Math.max(worst,performance.now()-before);
 assert.ok(Q.validate(round));
 ids.forEach((id,j)=>variants[j].add(JSON.stringify(round[id])));
 assert.equal(new Set(round.memory).size,6);
 assert.equal(new Set(round.finalmemory).size,9);
 assert.equal(Q.shortest(round.nav,round.nav.start,round.nav.goal),11);
 assert.equal(Q.shortest(round.robot,round.robot.start,round.robot.battery)+Q.shortest(round.robot,round.robot.battery,round.robot.goal),10);
 assert.equal(round.finalnav.path.length,21);
 assert.equal(round.sort.parcels.filter(p=>Q.matches(p,round.sort.rule)).length,5);
}
variants.forEach((set,i)=>assert.ok(set.size>=20,`${ids[i]} 至少 20 套`));
const corruptions=[
 r=>r.math.questions[0][1]++,r=>r.finalmath.questions[2][1]++,
 r=>r.math.questions[0][0]='<img src=x onerror=alert(1)>',
 r=>r.memory.fill(0),r=>r.finalmemory.pop(),r=>r.nav.walls.push(r.nav.start),
 r=>r.nav.path[2]=r.nav.path[0],r=>r.robot.battery=[-1,0],
 r=>r.finalnav.path.splice(5,1),r=>r.sort.rule.color='invalid',
 r=>r.sort.parcels[0].shape='invalid',r=>r.sort.parcels.pop()
];
for(const corrupt of corruptions){const r=Q.create();corrupt(r);assert.equal(Q.validate(r),false)}
assert.equal(Q.validate(null),false);assert.equal(Q.validate({}),false);
console.log(JSON.stringify({rounds:1000,variants:ids.map((id,i)=>[id,variants[i].size]),durationMs:Math.round(performance.now()-started),worstGenerationMs:Math.round(worst),corruptionsRejected:corruptions.length},null,2));
