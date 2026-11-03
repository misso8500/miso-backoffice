import test from 'node:test';
import assert from 'node:assert/strict';
import {compareRecipients} from '../src/lib/recipient-sort.ts';
const person=(id,name,careGrade='',serviceStartDate='',serviceEndDate='')=>({id,name,careGrade,serviceStartDate,serviceEndDate,birthDate:''});
const rows=[person('c','하늘','인지지원등급','2026-01-01','2028-01-01'),person('a','가람','5등급','2026-03-01','2027-01-01'),person('d','나래','','',''),person('b','다솜','1등급','2026-02-01','2026-12-31')];
const sorted=(field,direction)=>[...rows].sort((a,b)=>compareRecipients(a,b,{field,direction})).map(p=>p.id);
test('Korean names support both directions without altering the source list',()=>{
 assert.deepEqual(sorted('name','asc'),['a','d','b','c']);assert.deepEqual(sorted('name','desc'),['c','b','d','a']);assert.deepEqual(rows.map(p=>p.id),['c','a','d','b']);
});
test('grades use numeric order followed by cognitive support, with missing grades last in both directions',()=>{
 assert.deepEqual(sorted('careGrade','asc'),['b','a','c','d']);assert.deepEqual(sorted('careGrade','desc'),['c','a','b','d']);
});
test('contract start and expiry sort independently; missing dates remain last',()=>{
 assert.deepEqual(sorted('serviceStartDate','asc'),['c','b','a','d']);assert.deepEqual(sorted('serviceStartDate','desc'),['a','b','c','d']);assert.deepEqual(sorted('serviceEndDate','asc'),['b','a','c','d']);assert.deepEqual(sorted('serviceEndDate','desc'),['c','a','b','d']);
});
test('ties resolve by Korean name then birth date and ID, independent of input order',()=>{
 const people=[{...person('z','가람','3등급'),birthDate:'1950-01-01'},{...person('a','가람','3등급'),birthDate:'1940-01-01'},person('b','나래','3등급')];
 for(const direction of ['asc','desc'])assert.deepEqual(people.sort((a,b)=>compareRecipients(a,b,{field:'careGrade',direction})).map(p=>p.id),['a','z','b']);
});
