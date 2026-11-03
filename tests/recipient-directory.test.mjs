import test from 'node:test';
import assert from 'node:assert/strict';
import {formatCareNumber,recipientServiceSignal} from '../shared/recipient-directory.mjs';
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
