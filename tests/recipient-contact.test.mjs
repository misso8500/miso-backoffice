import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareRecipientContact} from '../server/recipient-contact.mjs';
const existing={updatedAt:'2026-01-01T00:00:00.000Z',serviceEndDate:'2027-12-31',medicalHistory:'보존할 건강 정보'};
const body={updatedAt:existing.updatedAt,phone:' 010-1234-5678 ',address:' 광주 ',representativeName:' 보호자 ',representativeRelation:' 자녀 ',representativePhone:'010-0000-0000'};
test('contact edits normalize only their five fields and never touch contract or clinical fields',()=>{
 const value=prepareRecipientContact(body,existing);assert.equal(value.phone,'010-1234-5678');assert.equal(value.address,'광주');assert.equal(value.representativeName,'보호자');assert(!Object.hasOwn(value,'serviceEndDate'));assert(!Object.hasOwn(value,'medicalHistory'));assert(value.updatedAt>existing.updatedAt);
 assert.throws(()=>prepareRecipientContact({...body,medicalHistory:''},existing),{status:400});assert.throws(()=>prepareRecipientContact({...body,serviceEndDate:'2020-01-01'},existing),{status:400});
});
test('missing records, stale versions and malformed contact values fail before any write',()=>{
 assert.throws(()=>prepareRecipientContact(body,null),{status:404});assert.throws(()=>prepareRecipientContact({...body,updatedAt:'old'},existing),{status:409});assert.throws(()=>prepareRecipientContact({...body,phone:123},existing),{status:400});assert.throws(()=>prepareRecipientContact({...body,address:'x'.repeat(501)},existing),{status:400});
});
test('incomplete draft recipients can update contact information without completing registration',()=>{
 const value=prepareRecipientContact({...body,address:'',representativeName:'',representativeRelation:'',representativePhone:''},{...existing,isDraft:true,longTermCareNumber:'',birthDate:''});assert.equal(value.address,'');assert(!Object.hasOwn(value,'isDraft'));
});
