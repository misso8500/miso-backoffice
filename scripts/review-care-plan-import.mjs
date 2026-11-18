// Read-only feasibility audit. Never imports an API server or writes to the database.
import ExcelJS from 'exceljs';
import pg from 'pg';
import {readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadEnv} from '../server/load-env.mjs';
import {isCalendarDate,halfYearEnd} from '../shared/care-plan-periods.mjs';
const file=(await readdir('tmp')).find(name=>name.normalize('NFC').includes('급여제공계획서')&&name.endsWith('.xlsx'));
if(!file)throw Error('tmp에서 급여제공계획서 내역 .xlsx 파일을 찾지 못했습니다.');
const book=new ExcelJS.Workbook();await book.xlsx.readFile(resolve('tmp',file));
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const rows=[],text=cell=>cell.value instanceof Date?cell.value.toISOString().slice(0,10):cell.text.trim().normalize('NFC'),period=value=>{const dates=value.match(/\d{4}-\d{2}-\d{2}/g)||[];return {startDate:dates[0]||'',endDate:dates[1]||''};};
const fields={number:3,sequence:4,birthDate:5,name:6,serviceType:8,contractDate:9,contractStart:10,contractEnd:11,recognitionRaw:12,writtenDate:13,notifiedDate:14,periodRaw:15,externalPlanNumber:16,careGrade:17};
for(const sheet of book.worksheets){sheet.eachRow((row,n)=>{if(n<=2||!row.getCell(6).text.trim())return;const value=Object.fromEntries(Object.entries(fields).map(([key,col])=>[key,text(row.getCell(col))]));rows.push({sheet:sheet.name,row:n,...value,recognition:period(value.recognitionRaw),period:period(value.periodRaw)});});}
const norm=value=>(value||'').normalize('NFC').replace(/\s/g,''),code=value=>(value||'').trim().toUpperCase().replace(/^L/,'');
const count=(values,key)=>Object.fromEntries([...new Set(values.map(key))].map(value=>[value,values.filter(item=>key(item)===value).length]));
let people=[],existingPlans=[];
if(process.argv.includes('--database')){
 loadEnv(process.cwd());const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,ssl:process.env.PGSSLMODE==='require'||process.env.DATABASE_URL?.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});
 try{await client.connect();await client.query('BEGIN READ ONLY');people=(await client.query('SELECT r.id,r.name,r.birth_date,r.long_term_care_number,r.care_grade,r.service_start_date,r.service_end_date,r.enabled,r.is_draft,EXISTS(SELECT 1 FROM recipient_deletions d WHERE d.recipient_id=r.id) AS deleted FROM recipients r')).rows;existingPlans=(await client.query('SELECT recipient_id,revision,effective_date,plan_id,schedule FROM recipient_plans ORDER BY recipient_id,revision')).rows;await client.query('ROLLBACK');}catch(error){throw Error(`읽기 전용 데이터베이스 조회 실패 (${error.code||'unknown'})`);}finally{await client.end();}
}
const targets=people.filter(person=>!person.deleted),mapped=[];
for(const row of rows){
 const numberMatches=targets.filter(person=>code(person.long_term_care_number)===code(row.number)),identityMatches=targets.filter(person=>norm(person.name)===norm(row.name)&&person.birth_date===row.birthDate);let target=null,match='unmatched';
 if(numberMatches.length===1){target=numberMatches[0];match=norm(target.name)!==norm(row.name)||target.birth_date!==row.birthDate?'identity-conflict':'recognition-number';}
 else if(numberMatches.length>1||identityMatches.length>1)match='ambiguous';
 else if(identityMatches.length===1){target=identityMatches[0];match=target.long_term_care_number&&!target.long_term_care_number.startsWith('__draft__:')&&code(target.long_term_care_number)!==code(row.number)?'recognition-conflict':'name-birth-date';}
 const flags=[];
 if(!/^L\d{10}$/.test(row.number))flags.push('invalid-recognition-number');
 if(!row.externalPlanNumber)flags.push('missing-plan-number');
 for(const key of ['birthDate','contractDate','contractStart','contractEnd','writtenDate','notifiedDate'])if(!isCalendarDate(row[key]))flags.push(`invalid-${key}`);
 if(!isCalendarDate(row.period.startDate)||!isCalendarDate(row.period.endDate)||row.period.startDate>row.period.endDate)flags.push('invalid-plan-period');
 else{
  if(row.period.endDate>halfYearEnd(row.period.startDate))flags.push('crosses-half-year');
  if(row.period.startDate<row.contractStart||row.period.endDate>row.contractEnd)flags.push('outside-source-contract');
  if(row.period.startDate<row.recognition.startDate||row.period.endDate>row.recognition.endDate)flags.push('outside-recognition');
  if(target&&(row.period.startDate<target.service_start_date||row.period.endDate>target.service_end_date))flags.push('outside-current-contract');
 }
 if(!isCalendarDate(row.recognition.startDate)||!isCalendarDate(row.recognition.endDate))flags.push('invalid-recognition-period');
 if(isCalendarDate(row.writtenDate)&&isCalendarDate(row.notifiedDate)&&row.notifiedDate<row.writtenDate)flags.push('notification-before-writing');
 if(isCalendarDate(row.writtenDate)&&row.writtenDate>today||isCalendarDate(row.notifiedDate)&&row.notifiedDate>today)flags.push('future-actual-date');
 const safe=['recognition-number','name-birth-date'].includes(match);
 mapped.push({...row,recipientId:target?.id||null,match,safeMatch:safe,flags,currentContract:target?{startDate:target.service_start_date,endDate:target.service_end_date}:null,existingPlanVersions:target?existingPlans.filter(p=>p.recipient_id===target.id).length:0});
}
const safe=mapped.filter(row=>row.safeMatch),visits=safe.filter(row=>row.serviceType==='방문요양');
const unique=values=>[...new Set(values)];
const validCurrent=visits.filter(row=>isCalendarDate(row.period.startDate)&&isCalendarDate(row.period.endDate)&&row.period.startDate<=today&&row.period.endDate>=today);
const latest=new Map();for(const row of visits){if(!isCalendarDate(row.period.startDate))continue;const old=latest.get(row.recipientId);if(!old||row.period.startDate>old.period.startDate||row.period.startDate===old.period.startDate&&row.writtenDate>old.writtenDate)latest.set(row.recipientId,row);}
const summary={file:file.normalize('NFC'),today,readOnly:true,databaseQueried:process.argv.includes('--database'),source:{rows:rows.length,people:unique(rows.map(row=>row.number)).length,types:count(rows,row=>row.serviceType),validPlanNumbers:unique(rows.map(row=>row.externalPlanNumber).filter(Boolean)).length,rowsWithPlaceholderDates:rows.filter(row=>!isCalendarDate(row.writtenDate)||!isCalendarDate(row.notifiedDate)).map(row=>row.row),firstValidWriting:rows.map(row=>row.writtenDate).filter(isCalendarDate).sort()[0],lastValidWriting:rows.map(row=>row.writtenDate).filter(isCalendarDate).sort().at(-1)},database:{visibleRecipients:targets.length,hiddenRecipients:people.length-targets.length,existingPlanRevisions:existingPlans.length},matching:{rowResults:count(mapped,row=>row.match),safeRows:safe.length,safePeople:unique(safe.map(row=>row.recipientId)).length,visitRows:visits.length,visitPeople:unique(visits.map(row=>row.recipientId)).length,currentPlanPeople:unique(validCurrent.map(row=>row.recipientId)).length,unmatchedSourcePeople:unique(mapped.filter(row=>!row.safeMatch).map(row=>row.number)).length,visibleWithoutMatch:targets.filter(person=>!safe.some(row=>row.recipientId===person.id)).map(person=>person.name),recognitionNumbersFillable:unique(safe.filter(row=>row.match==='name-birth-date').map(row=>row.recipientId)).length},validation:{allRowFlags:Object.fromEntries(unique(mapped.flatMap(row=>row.flags)).map(flag=>[flag,mapped.filter(row=>row.flags.includes(flag)).length])),matchedVisitFlags:Object.fromEntries(unique(visits.flatMap(row=>row.flags)).map(flag=>[flag,visits.filter(row=>row.flags.includes(flag)).length]))},latestMatchedVisit:[...latest.values()].map(row=>({name:row.name,row:row.row,period:row.period,flags:row.flags,existingPlanVersions:row.existingPlanVersions}))};
console.log(JSON.stringify(summary,null,2));
const outIndex=process.argv.indexOf('--output');if(outIndex>=0){const directory=process.argv[outIndex+1];if(!directory)throw Error('--output에 폴더를 지정해 주세요.');await mkdir(directory,{recursive:true});await writeFile(resolve(directory,'summary.json'),JSON.stringify(summary,null,2)+'\n');await writeFile(resolve(directory,'mapping-preview.json'),JSON.stringify({readOnly:true,source:file.normalize('NFC'),today,rows:mapped},null,2)+'\n');}
