import test from 'node:test';
import assert from 'node:assert/strict';
import {getRecipientStatus,formatCareNumber,recipientServiceSignal,recipientContractMonth} from '../shared/recipient-directory.mjs';
test('recognition number displays one L without changing storage',()=>{
 for(const value of ['1234567890','L1234567890','l1234567890',' LL1234567890 '])assert.equal(formatCareNumber(value),'L1234567890');
 for(const value of [undefined,'','__draft__:123'])assert.equal(formatCareNumber(value),'인정번호 미등록');
});
test('service signals represent draft, stopped, renewal and active status',()=>{
 assert.deepEqual(recipientServiceSignal({isDraft:true,servicePaused:true},'계약종료'),{state:'black',label:'기초 정보 입력 중'});
 assert.equal(recipientServiceSignal({enabled:false},'급여제공중').state,'red');
 assert.equal(recipientServiceSignal({},'계약종료').state,'red');
 assert.deepEqual(recipientServiceSignal({servicePaused:true},'급여갱신필요'),{state:'red',label:'서비스 일시정지'});
 for(const status of ['급여갱신필요','계약종료예정'])assert.equal(recipientServiceSignal({},status).state,'yellow');
 assert.deepEqual(recipientServiceSignal({},'급여제공중'),{state:'green',label:'서비스 진행 중'});
 assert.equal(recipientServiceSignal({},'급여시작').state,'idle');
});

test('contract shading compares the full month; expiry wins when both dates are in this month',()=>{
 assert.deepEqual(recipientContractMonth({serviceStartDate:'2026-11-01',serviceEndDate:'2027-11-30'},'2026-11'),{starts:true,ends:false,tone:'start'});
 assert.deepEqual(recipientContractMonth({serviceStartDate:'2026-10-01',serviceEndDate:'2026-11-30'},'2026-11'),{starts:false,ends:true,tone:'end'});
 assert.deepEqual(recipientContractMonth({serviceStartDate:'2026-11-01',serviceEndDate:'2026-11-30'},'2026-11'),{starts:true,ends:true,tone:'end'});
 assert.equal(recipientContractMonth({serviceStartDate:'',serviceEndDate:'2026-02-30'},'2026-02').tone,null);
 assert.equal(recipientContractMonth({serviceStartDate:'2026-12-31',serviceEndDate:'2027-01-31'},'2027-01').tone,'end');
});


// Registration readiness alone must not skip the explicit completion step.
test('registration completion previews use the same status rules as the directory',()=>{
 const now=new Date(2026,10,4),person={isDraft:true,enabled:true,serviceStartDate:'2026-01-01',serviceEndDate:'2028-12-31'};
 const signal=value=>recipientServiceSignal(value,getRecipientStatus(value,now));
 assert.equal(signal(person).state,'black');assert.equal(signal({...person,isDraft:false}).state,'green');
 assert.equal(signal({...person,isDraft:false,enabled:false}).state,'red');assert.equal(signal({...person,isDraft:false,servicePaused:true}).state,'red');
 assert.equal(signal({...person,isDraft:false,serviceEndDate:'2026-12-01'}).state,'yellow');assert.equal(signal({...person,isDraft:false,serviceEndDate:'2026-10-31'}).state,'red');
 assert.equal(signal({...person,isDraft:false,serviceStartDate:'2026-12-01'}).state,'idle');
});
