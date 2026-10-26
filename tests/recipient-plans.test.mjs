import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { buildPlanState, preparePlanVersions, guardProfilePlanFields } from '../server/recipient-plans.mjs';
import { createSqlitePlanStore } from '../server/recipient-plan-stores.mjs';
const author={id:'verified-user',name:'담당자'};
const notes={medicalHistory:'건강 상태',caregiverRequirements:'오전 가능',familyNotes:'가족 연락',hospitalNotes:'관련 병원',servicePlanNotes:'방문 계획'};
const base={id:'r1',serviceStartDate:'1999-01-01',serviceEndDate:'2099-12-31',medicalHistory:'기존 건강 메모',caregiverRequirements:'기존 구인조건'};
const input=(version=0,date='2000-01-01')=>({version,notes,effectiveDate:date,schedule:{category:'initial',status:'completed',endDate:date.slice(0,4)+'-06-30',writtenDate:'2000-01-01',notifiedDate:'2000-01-01',recognitionPeriod:{id:'',startDate:'1999-01-01',endDate:'2099-12-31',careGrade:'4등급'}},changeKind:'change',changeReason:'최초 계획 확인',authorName:'가짜 작성자',history:[{forged:true}]});
function store(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  db.exec("PRAGMA foreign_keys=ON;CREATE TABLE recipients(id TEXT PRIMARY KEY,medical_history TEXT,caregiver_requirements TEXT);INSERT INTO recipients VALUES('r1','기존 건강 메모','기존 구인조건');INSERT INTO recipients VALUES('r2','','');");
  return {db,plans:createSqlitePlanStore(db,row=>({...base,id:row.id,medicalHistory:row.medical_history,caregiverRequirements:row.caregiver_requirements}))};
}
test('first save archives legacy notes without guessing old dates or authors',()=>{
  const versions=preparePlanVersions(input(),base,[],author);
  assert.equal(versions.length,2);assert.equal(versions[0].effectiveDate,null);assert.equal(versions[0].authorName,'작성자 기록 없음');
  assert.equal(versions[0].notes.medicalHistory,base.medicalHistory);assert.equal(versions[1].authorId,author.id);assert.equal(versions[1].authorName,author.name);assert.equal(versions[1].version,2);
});
test('invalid dates, fields, missing reasons, stale versions and forged corrections are rejected',()=>{
  for(const patch of [{effectiveDate:'2026-02-30'},{changeReason:''},{changeKind:'legacy'},{notes:{...notes,familyNotes:42}},{notes:{...notes,servicePlanNotes:'a'.repeat(5001)}},{changeKind:'correction',sourceVersion:1}]){
    assert.throws(()=>preparePlanVersions({...input(),...patch},base,[],author),{status:400});
  }
  assert.throws(()=>preparePlanVersions(input(1),base,[],author),{status:409});
  assert.throws(()=>preparePlanVersions(input(),base,[],null),{status:401});
});
test('current plan is selected by effective date rather than latest edit time',()=>{
  const versions=[{version:1,effectiveDate:'2000-01-01'},{version:2,effectiveDate:'2001-01-01'},{version:3,effectiveDate:'2000-01-01'},{version:4,effectiveDate:'2099-01-01'}];
  const state=buildPlanState(base,versions,'2026-10-15');assert.equal(state.current.version,2);assert.equal(state.latest.version,4);assert.equal(state.nextEffectiveDate,'2099-01-01');
  assert.equal(buildPlanState(base,versions,'2099-01-01').current.version,4);
});
test('store preserves all notes, current summaries, authored history and rejects stale writes',t=>{
  const {plans}=store(t);const saved=plans.save('r1',input(),author);
  assert.equal(saved.version,2);assert.deepEqual(saved.current.notes,notes);assert.equal(saved.history.length,2);
  assert.equal(plans.enrich([base])[0].familyNotes,notes.familyNotes);
  const changed=plans.save('r1',{...input(2,'2001-01-01'),notes:{...notes,familyNotes:'가족 사정 변경'},effectiveDate:'2001-01-01',changeReason:'가족 사정 변경'},author);
  assert.equal(changed.version,3);assert.equal(changed.history[1].notes.familyNotes,notes.familyNotes);
  assert.throws(()=>plans.save('r1',input(2),author),{status:409});
  assert.equal(plans.save('r1',{...input(3,'2001-01-01'),notes:changed.current.notes,changeKind:'progress',sourceVersion:3},author).version,3);
});
test('corrections are new records and keep the original effective date',t=>{
  const {plans}=store(t);const saved=plans.save('r1',input(),author);
  const corrected=plans.save('r1',{...input(saved.version),notes:{...notes,hospitalNotes:'병원명 정정'},changeKind:'correction',sourceVersion:saved.current.version,changeReason:'오탈자'},author);
  assert.equal(corrected.current.changeKind,'correction');assert.equal(corrected.current.sourceVersion,2);assert.equal(corrected.history[1].notes.hospitalNotes,notes.hospitalNotes);
  assert.throws(()=>plans.save('r1',{...input(corrected.version),changeKind:'correction',sourceVersion:2,effectiveDate:'2002-01-01'},author),{status:400});
});
test('scheduled plans retain current notes, including after later edits to a past plan',t=>{
  const {plans}=store(t);plans.save('r1',input(),author);
  plans.save('r1',{...input(2,'2099-01-01'),notes:{...notes,servicePlanNotes:'예정 서비스'}},author);
  const result=plans.save('r1',{...input(3),notes:{...notes,hospitalNotes:'현재 병원 정정'},changeKind:'correction',sourceVersion:2},author);
  assert.equal(result.current.notes.servicePlanNotes,notes.servicePlanNotes);assert.equal(result.nextEffectiveDate,'2099-01-01');
  const summary=plans.enrich([base])[0];assert.equal(summary.planSummary.nextEffectiveDate,'2099-01-01');assert.equal(summary.hospitalNotes,'현재 병원 정정');
});
test('failed first save rolls back both legacy archive and new version',t=>{
  const {db,plans}=store(t);
  db.exec("CREATE TRIGGER fail_plan BEFORE INSERT ON recipient_plans WHEN NEW.change_kind='change' BEGIN SELECT RAISE(ABORT,'forced failure');END;");
  assert.throws(()=>plans.save('r1',input(),author));assert.equal(plans.get('r1').version,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM recipient_plans').get().n,0);
});
test('ordinary profile edits cannot silently replace versioned plan notes',()=>{
  const existing={...base,planSummary:{version:2}};
  assert.throws(()=>guardProfilePlanFields({medicalHistory:'이력 없는 변경'},existing),{status:400});
  assert.doesNotThrow(()=>guardProfilePlanFields({phone:'010-1234-5678'},existing));
});
