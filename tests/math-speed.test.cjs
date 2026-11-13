'use strict';
const assert=require('node:assert/strict');
const {harness}=require('./portrait-flow.test.cjs');
const h=harness();
for(const [correct,total,elapsed,base,penalty,raw] of [
 [3,3,8,100,0,100],
 [3,3,18,100,8,92],
 [3,3,80,100,40,60],
 [2,4,30,50,20,30]
]){
 const actual=JSON.parse(h.run(`JSON.stringify(mathSpeedScore(${correct},${total},${elapsed}))`));
 assert.deepEqual(actual,{base,speedPenalty:penalty,raw});
}
assert.equal(h.run('mathSpeedScore(2,3,18).raw'),59,'Round only after subtracting from the unrounded base');
assert.equal(h.run('mathSpeedScore(0,3,80).raw'),0);

// Both math stages use the real elapsed clock and preserve exact independently of speed.
for(const i of [0,5])for(const hinted of [false,true]){
 const h=harness();h.setup(i);h.advance(18000);
 h.run(`state.current.answers=state.current.t.questions.map(q=>String(q[1]));state.current.hints=${hinted?1:0}`);
 assert.equal(h.run('evaluate(state.current).raw'),92);
 assert.match(h.run('evaluate(state.current).detail'),/用时 18s · 速度 −8/);
 h.run('finishAssessment()');
 assert.equal(h.run(`state.records[${i}].raw`),92);
 assert.equal(h.run(`state.records[${i}].score`),hinted?64:92);
 assert.equal(h.run(`state.records[${i}].seconds`),18);
 assert.equal(h.run(`state.records[${i}].exact`),true);
 assert.match(h.app.markup,/用时 18s · 速度 −8/);
 h.run('renderReport()');assert.match(h.app.markup,/assessment-detail[^>]*>[^<]*用时 18s · 速度 −8/);
}
// Captured elapsed takes precedence over a deadline; auto never receives a speed deduction.
for(const auto of [false,true]){
 const h=harness();h.setup(0);
 h.run(`state.current.answers=state.current.t.questions.map(q=>String(q[1]));state.current.submitElapsed=80;finishAssessment('submit',${auto})`);
 assert.equal(h.run('state.records[0].raw'),auto?100:60);
 assert.equal(h.run('state.records[0].score'),auto?0:60);
 assert.equal(h.run('state.records[0].exact'),true);
 if(auto){assert.match(h.app.markup,/settlement-score is-auto">AI 接管/);assert.doesNotMatch(h.app.markup,/速度 −/)}
}
{
 const h=harness();h.setup(0);
 h.run("state.current.answers=state.current.t.questions.map(q=>String(q[1]));state.current.submitElapsed=18;finishAssessment('abandoned')");
 assert.equal(h.run('state.records[0].raw'),0);assert.equal(h.run('state.records[0].score'),0);
 assert.equal(h.run('state.records[0].exact'),false);
}
// Partial/missing answers still contribute zero; half-correct is capped at 30.
{
 const h=harness();h.setup(0);
 h.run("state.current.t={...state.current.t,questions:[['1',1],['2',2],['3',3],['4',4]]};state.current.answers=['1','2','wrong'];state.current.submitElapsed=30;finishAssessment()");
 assert.equal(h.run('state.records[0].raw'),30);assert.equal(h.run('state.records[0].exact'),false);
}
for(const i of [1,2,3,4,6,7]){
 const h=harness();h.setup(i);h.run('finishAssessment()');
 assert.doesNotMatch(h.app.markup,/settlement-speed|速度 −/);
 assert.doesNotMatch(h.run(`state.records[${i}].detail`),/速度 −/);
}
console.log('通过：心算速度 100/92/60/30、舍入、两关用时与详情、hint 64、auto 100/0、中断与未答规则');
