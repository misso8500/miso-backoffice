import test from 'node:test';
import assert from 'node:assert/strict';
import {halfYearEnd,planDeadline,deadlineLabel} from '../shared/care-plan-periods.mjs';
import {preparePlanVersions,buildPlanState} from '../server/recipient-plans.mjs';
const recipient={id:'r',serviceStartDate:'2026-04-15',serviceEndDate:'2028-09-08'};
const author={id:'a',name:'담당자'};
const notes={medicalHistory:'',caregiverRequirements:'',familyNotes:'',hospitalNotes:'',servicePlanNotes:'방문요양 제공'};
const schedule=(category='regular',status='completed')=>({category,status,endDate:'2026-12-31',writtenDate:'2026-06-21',notifiedDate:'2026-06-21',recognitionPeriod:{id:'',startDate:'2026-01-01',endDate:'2028-09-08',careGrade:'4등급'}});
const body=(patch={})=>({version:0,notes,effectiveDate:'2026-07-01',changeKind:'change',changeReason:'정기 계획',schedule:schedule(),...patch});
const save=(input,versions=[],today='2026-10-15')=>preparePlanVersions(input,recipient,versions,author,today);
test('half-year boundaries and ten-day deadlines handle the prior year and leap years',()=>{
 assert.equal(halfYearEnd('2026-04-15'),'2026-06-30');assert.equal(halfYearEnd('2026-09-10'),'2026-12-31');
 assert.equal(planDeadline('regular','2027-01-01'),'2026-12-22');assert.equal(planDeadline('regular','2026-07-01'),'2026-06-21');
 assert.equal(planDeadline('initial','2026-04-15'),null);assert.equal(planDeadline('needs_change','2026-09-10'),null);
 assert.equal(planDeadline('regular','2024-03-01'),'2024-02-20');
});
test('deadline is server-derived; late actual dates remain valid and visibly late',()=>{
 const p=save(body({schedule:{...schedule(),deadline:'2099-01-01',notifiedDate:'2026-06-22'}}))[0];
 assert.equal(p.schedule.deadline,'2026-06-21');assert.equal(deadlineLabel(p.schedule,p.effectiveDate,'2026-10-15'),'마감 후 완료');
 assert.equal(deadlineLabel(schedule(),'2026-07-01','2026-10-15'),'기한 내 완료');
});
test('initial April plan runs to June, has no advance deadline',()=>{
 const p=save(body({effectiveDate:'2026-04-15',schedule:{...schedule('initial'),endDate:'2026-06-30',writtenDate:'2026-04-15',notifiedDate:'2026-04-15'}}))[0];
 assert.equal(p.schedule.deadline,null);assert.equal(p.schedule.endDate,'2026-06-30');
});
test('invalid period containment, incomplete completion and future actual dates fail',()=>{
 for(const patch of [
  {effectiveDate:'2026-07-02'},
  {schedule:{...schedule(),endDate:'2027-01-01'}},
  {schedule:{...schedule(),notifiedDate:null}},
  {schedule:{...schedule(),writtenDate:'2027-01-01'}},
  {schedule:{...schedule(),notifiedDate:'2026-06-20'}},
  {schedule:{...schedule(),recognitionPeriod:null}},
  {schedule:{...schedule(),recognitionPeriod:{...schedule().recognitionPeriod,endDate:'2026-11-01'}}},
  {notes:{...notes,servicePlanNotes:''}}
 ])assert.throws(()=>save(body(patch)),{status:400});
 assert.throws(()=>save(body({effectiveDate:'2026-01-01',schedule:{...schedule(),endDate:'2026-06-30'}})),{status:400});
});
test('draft has no execution effect; completion supersedes old execution without mutating history',()=>{
 const initial=save(body());
 const draft=save(body({version:1,effectiveDate:'2026-09-10',schedule:{...schedule('needs_change','draft'),writtenDate:null,notifiedDate:null,recognitionPeriod:null}}),initial);
 let state=buildPlanState(recipient,[...initial,...draft],'2026-10-15');assert.equal(state.executionCurrent.id,initial[0].id);assert.equal(state.executionCurrent.executionEndDate,'2026-12-31');
 const completed=save(body({version:2,effectiveDate:'2026-09-10',changeKind:'progress',sourceVersion:2,schedule:{...schedule('needs_change'),writtenDate:'2026-09-10',notifiedDate:'2026-09-10'}}),[...initial,...draft]);
 state=buildPlanState(recipient,[...initial,...draft,...completed],'2026-10-15');
 assert.equal(state.plans.length,2);assert.equal(state.executionCurrent.id,completed[0].id);assert.equal(state.plans[0].executionEndDate,'2026-09-09');assert.equal(initial[0].schedule.endDate,'2026-12-31');
 assert.equal(state.regularRequirement.startDate,'2027-01-01');assert.equal(state.regularRequirement.deadline,'2026-12-22');
});
test('draft completion and corrections keep plan identity and reject stale logical revisions',()=>{
 const first=save(body({schedule:schedule('regular','draft')}));
 const completed=save(body({version:1,changeKind:'progress',sourceVersion:1}),first);
 assert.equal(completed[0].planId,first[0].planId);
 assert.throws(()=>save(body({version:2,changeKind:'correction',sourceVersion:1}),[...first,...completed]),{status:409});
});
test('plans are not executing after their end and missing regular plans show their deadline',()=>{
 const p=save(body({effectiveDate:'2026-04-15',schedule:{...schedule('initial'),endDate:'2026-06-30'}}));
 const state=buildPlanState(recipient,p,'2026-10-15');assert.equal(state.executionCurrent,null);assert.equal(state.regularRequirement.startDate,'2026-07-01');assert.equal(state.regularRequirement.deadlinePassed,true);assert.equal(state.regularRequirement.status,'missing');
 assert.equal(buildPlanState(recipient,[],'2026-10-15').regularRequirement,null);
});
test('same-start duplicate regular plan must be continued rather than inserted twice',()=>{
 const first=save(body());assert.throws(()=>save(body({version:1}),first),{status:409});
});
