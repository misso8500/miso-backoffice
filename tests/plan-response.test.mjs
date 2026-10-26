import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePlanResponse} from '../shared/validate-plan-response.mjs';
test('older API response fails with actionable restart guidance before rendering',()=>{
 assert.throws(()=>validatePlanResponse({version:0,history:[],current:null,legacyNotes:{}}),/npm run api/);
 assert.throws(()=>validatePlanResponse(null),/이전 버전/);
});
test('current empty and populated responses pass without changing business data',()=>{
 const state={version:0,history:[],legacyNotes:{},context:{institutionPeriod:{startDate:'',endDate:''},recognitionPeriods:[]},plans:[]};
 assert.equal(validatePlanResponse(state),state);
 assert.equal(validatePlanResponse({...state,plans:[{schedule:{status:'draft'}}]}).plans.length,1);
 assert.throws(()=>validatePlanResponse({...state,plans:[{}]}),/응답 형식/);
});
