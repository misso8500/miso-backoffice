import test from 'node:test';
import assert from 'node:assert/strict';
import { dateInputError, limitDateYearToFourDigits } from '../src/lib/date-input.ts';
import { prepareServicePeriod } from '../server/service-period.mjs';
test('date validation requires four-digit year and real dates, including leap years and ranges',()=>{
  for(const value of ['2026--','202626-01-01','2026-02-30','2026-1-01','2026-13-01'])assert.ok(dateInputError(value));
  assert.equal(dateInputError('2028-02-29'),'');assert.ok(dateInputError('2027-02-29'));
  assert.equal(dateInputError('',false),'');assert.ok(dateInputError('',true));
  assert.ok(dateInputError('2026-01-01',false,'2026-02-01'));assert.ok(dateInputError('2027-01-01',false,undefined,'2026-12-31'));
});
test('renewals preserve old period and do not require unrelated unfinished profile fields',()=>{
  const old={updatedAt:'v1',serviceStartDate:'2025-01-01',serviceEndDate:'2025-12-31',isDraft:true};
  const next=prepareServicePeriod({updatedAt:'v1',serviceStartDate:'2026-01-01',serviceEndDate:'2026-12-31',reason:'renewal'},old);
  assert.equal(next.type,'service_renewal');assert.equal(next.changed,true);assert.equal(JSON.parse(next.memo).previousStartDate,old.serviceStartDate);
  assert.throws(()=>prepareServicePeriod({updatedAt:'v0'},old),{status:409});
  assert.throws(()=>prepareServicePeriod({updatedAt:'v1',serviceStartDate:'2026-12-31',serviceEndDate:'2026-01-01',reason:'renewal'},old),{status:400});
});

test('native calendar values retain normal dates and restrict longer years',()=>{
  assert.equal(limitDateYearToFourDigits('202612-09-08'),'2026-09-08');
  assert.equal(limitDateYearToFourDigits('2026-09-08'),'2026-09-08');
  assert.equal(limitDateYearToFourDigits(''),'');
});
