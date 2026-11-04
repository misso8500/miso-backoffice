import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRecipientCareNumber} from '../server/recipient-care-number.mjs';
const existing={updatedAt:'2026-01-01T00:00:00.000Z',isDraft:true};
test('care number edits add one L and do not complete a draft or change other information',()=>{
 for(const input of ['1234567890','L1234567890',' l1234567890 ']){
  const value=prepareRecipientCareNumber({updatedAt:existing.updatedAt,longTermCareNumber:input},existing);assert.equal(value.longTermCareNumber,'L1234567890');assert.deepEqual(Object.keys(value).sort(),['longTermCareNumber','updatedAt']);assert(value.updatedAt>existing.updatedAt);
 }
});
test('missing records, stale versions, malformed numbers and unrelated writes are rejected',()=>{
 const body={updatedAt:existing.updatedAt,longTermCareNumber:'L1234567890'};
 assert.throws(()=>prepareRecipientCareNumber(body,null),{status:404});assert.throws(()=>prepareRecipientCareNumber({...body,updatedAt:'old'},existing),{status:409});
 for(const value of ['',1234567890,'L123','LL1234567890','X1234567890','L12345678901'])assert.throws(()=>prepareRecipientCareNumber({...body,longTermCareNumber:value},existing),{status:400});
 assert.throws(()=>prepareRecipientCareNumber({...body,isDraft:false},existing),{status:400});
});
