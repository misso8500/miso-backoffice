import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareCopayRows,previousCopayMonth} from '../server/copay-comparison.mjs';
test('comparison uses exact prior month, stable IDs and numeric normalization',()=>{
  assert.equal(previousCopayMonth('2026-01'),'2025-12');
  const old={id:1,name:'동명',recipientId:'a',grade:'4등급',rate:'15.0%',limit:null,usage:0,copay:0,extra:null,sourceTotal:null};
  const now={...old,id:9,name:'다른 이름',grade:'4',rate:'15%',copay:100,sourceTotal:100};
  const result=compareCopayRows([now],[old],'2025-12',true)[0].comparison;
  assert.deepEqual(Object.keys(result.changes),['copay','total']);assert.equal(result.changes.copay.previous,0);
  assert.equal(compareCopayRows([{...now,recipientId:'b'}],[old],'2025-12',true)[0].comparison.status,'no_previous_recipient');
  assert.equal(compareCopayRows([now],[old,old],'2025-12',true)[0].comparison.status,'ambiguous');
});
