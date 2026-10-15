import test from 'node:test';
import assert from 'node:assert/strict';
import {renewalDate,recognitionPeriods,currentRecognition,recognitionStatus,previousPeriod,institutionStatus} from '../shared/recipient-validity.mjs';
test('renewal target is one calendar month before recognition end, clamped across month lengths',()=>{
 assert.equal(renewalDate('2028-09-08'),'2028-08-08');assert.equal(renewalDate('2027-03-31'),'2027-02-28');assert.equal(renewalDate('2028-03-31'),'2028-02-29');assert.equal(renewalDate('2027-01-15'),'2026-12-15');assert.equal(renewalDate('2026-02-30'),null);
});
test('recognition periods combine document and plan snapshots without guessing dates or grades',()=>{
 const a={id:'doc',startDate:'2026-01-01',endDate:'2027-12-31'},b={id:'next',startDate:'2028-01-01',endDate:'2029-12-31'};
 const periods=recognitionPeriods({recognitionPeriods:[a,b],planSummary:{plans:[{schedule:{recognitionPeriod:{...a,id:'',careGrade:'4등급'}}}]}});
 assert.equal(periods.length,2);assert.equal(currentRecognition(periods,'2026-10-15').id,'doc');assert.equal(periods[1].careGrade,'4등급');assert.equal(periods[0].careGrade,'');
 assert.equal(recognitionStatus(currentRecognition(periods,'2030-01-01'),'2030-01-01'),'인정기간 만료');assert.deepEqual(recognitionPeriods({}),[]);
 assert.equal(recognitionStatus(null,'2026-10-15'),'인정기간 미등록');
});
test('future recognition does not replace the still-current recognition period',()=>{
 const periods=[{startDate:'2028-01-01',endDate:'2029-12-31'},{startDate:'2026-01-01',endDate:'2027-12-31'}];
 assert.equal(currentRecognition(periods,'2027-12-31'),periods[1]);assert.equal(currentRecognition(periods,'2028-01-01'),periods[0]);
 assert.equal(recognitionStatus(currentRecognition(periods,'2025-01-01'),'2025-01-01'),'인정 시작 예정');
});
test('contract status uses institution dates, independently of recognition or visit activity',()=>{
 const r={serviceStartDate:'2026-01-01',serviceEndDate:'2026-12-31',enabled:true};
 assert.equal(institutionStatus(r,'2026-10-15'),'계약 중');assert.equal(institutionStatus(r,'2027-01-01'),'계약 만료');assert.equal(institutionStatus(r,'2025-12-31'),'이용 시작 예정');assert.equal(institutionStatus({...r,enabled:false},'2026-10-15'),'비활성화');assert.equal(institutionStatus({...r,serviceStartDate:''},'2026-10-15'),'기간 확인 필요');
});
test('historical snapshots distinguish known dates from unstructured legacy memos',()=>{
 assert.deepEqual(previousPeriod({memo:'old memo'}),{startDate:'',endDate:''});
 assert.deepEqual(previousPeriod({memo:JSON.stringify({previousStartDate:'2026-01-01',previousEndDate:'2026-12-31'})}),{startDate:'2026-01-01',endDate:'2026-12-31'});
});
