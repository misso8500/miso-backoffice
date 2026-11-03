import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createSqliteWorkStore,createPostgresWorkStore} from '../server/work-task-stores.mjs';
import {prospectAttention} from '../shared/prospects.mjs';
import {recurrenceToday} from '../shared/work-recurrence.mjs';

for(const mode of ['sqlite','postgres-adapter'])test(`${mode}: prospects persist stages, independent activity, follow-ups, history and explicit recipient linkage`,async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE recipients(id TEXT PRIMARY KEY,name TEXT,operational_name TEXT,service_start_date TEXT,service_end_date TEXT,enabled INTEGER,is_draft INTEGER);CREATE TABLE employment_contracts(id TEXT PRIMARY KEY,worker_name TEXT,contract_start_date TEXT,contract_end_date TEXT,is_draft INTEGER,enabled INTEGER);INSERT INTO recipients VALUES('contract','계약 고객','','2026-01-01','2026-12-31',1,0),('draft','계약 전','','','',1,1);`);
 const bridge={async connect(){return {async query(sql,params=[]){if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)){db.exec(sql);return {rows:[]};}const values=[],converted=sql.replace(/ FOR UPDATE$/,'').replace(/\$(\d+)/g,(_,n)=>{values.push(params[Number(n)-1]);return '?';});const rows=db.prepare(converted).all(...values);return {rows,rowCount:rows.length};},release(){}};}};
 if(mode==='postgres-adapter')for(const file of ['work-task-schema.sql','work-journal-schema.sql','prospects-schema.sql'])db.exec(readFileSync(new URL('../server/'+file,import.meta.url),'utf8'));
 const store=mode==='sqlite'?createSqliteWorkStore(db,()=>true):createPostgresWorkStore(bridge,()=>true);
 const a=await store.members({id:'a',email:'a@example.com',name:'센터장'},['a@example.com','b@example.com']),b=await store.members({id:'b',email:'b@example.com',name:'직원'},['a@example.com','b@example.com']);
 const input={name:'상담 고객',phone:'010-1234-5678',contactName:'보호자',contactRelation:'자녀',contactPhone:'010-9999-9999',address:'광주',source:'병원 소개',needs:'방문요양 상담',stage:'intake',stageReason:'',ownerId:'staff-shin-suyeon',receivedDate:'2026-01-01',nextAction:'센터장 실사 방문',nextDate:recurrenceToday(),linkedRecipientId:'',archived:false,version:0,requestId:randomUUID()};
 let result=await store.saveProspect(null,input,a),person=result.prospect;
 assert.equal(person.version,1);assert.equal(result.events[0].actorName,'센터장');assert.equal(prospectAttention(person,recurrenceToday()),'today');
 assert.equal((await store.saveProspect(null,input,a)).prospect.id,person.id);assert.equal((await store.prospects(b)).prospects.length,1);
 assert.equal(db.prepare('SELECT count(*) n FROM recipients').get().n,2,'prospects must never create recipients implicitly');
 await assert.rejects(store.saveProspect(null,{...input,name:'충돌'},a),{status:409});
 result=await store.saveProspect(person.id,{...person,stage:'visit_planned',requestId:randomUUID()},b);person=result.prospect;
 assert.equal(result.events[0].kind,'stage_changed');assert.equal(result.events[0].before.stage,'intake');
 await assert.rejects(store.saveProspect(person.id,{...person,version:1,requestId:randomUUID()},a),{status:409});
 const activity={requestId:randomUUID(),version:person.version,kind:'visit',date:recurrenceToday(),content:'실사 방문 완료. 보호자와 서비스 시작일을 논의함.',completeFollowUp:true};
 result=await store.addProspectActivity(person.id,activity,a);person=result.prospect;
 assert.equal(person.stage,'visit_planned','activity completion must not change the business stage');assert.equal(person.nextDate,'');assert.equal(person.nextAction,'');assert.equal(person.lastContactDate,recurrenceToday());
 assert.equal(result.events[0].completedFollowUp.action,'센터장 실사 방문');
 const retry=await store.addProspectActivity(person.id,activity,a);assert.equal(retry.events.length,result.events.length);
 await assert.rejects(store.addProspectActivity(person.id,{...activity,content:'다른 내용'},a),{status:409});
 await assert.rejects(store.addProspectActivity(person.id,{...activity,requestId:randomUUID(),version:person.version,date:'9999-01-01'},a),{status:400});
 await assert.rejects(store.saveProspect(person.id,{...person,stage:'deferred',stageReason:'',requestId:randomUUID()},a),{status:400});
 result=await store.saveProspect(person.id,{...person,stage:'deferred',stageReason:'보호자와 재논의',nextAction:'보호자 연락',nextDate:'2026-01-02',requestId:randomUUID()},a);person=result.prospect;
 assert.equal(prospectAttention(person,'2026-01-03'),'overdue');
 result=await store.saveProspect(person.id,{...person,archived:true,requestId:randomUUID()},a);person=result.prospect;assert.equal(prospectAttention(person,recurrenceToday()),false);
 await assert.rejects(store.addProspectActivity(person.id,{...activity,requestId:randomUUID(),version:person.version,completeFollowUp:false},a),{status:409});
 result=await store.saveProspect(person.id,{...person,archived:false,requestId:randomUUID()},b);person=result.prospect;
 await assert.rejects(store.saveProspect(person.id,{...person,stage:'contracted',linkedRecipientId:'draft',requestId:randomUUID()},a),{status:400});
 result=await store.saveProspect(person.id,{...person,stage:'contracted',linkedRecipientId:'contract',requestId:randomUUID()},a);person=result.prospect;
 assert.equal(person.linkedRecipientName,'계약 고객');assert.equal(person.nextDate,'');assert.equal(prospectAttention(person,recurrenceToday()),false);
 const second=await store.saveProspect(null,{...input,requestId:randomUUID()},b);
 await assert.rejects(store.saveProspect(second.prospect.id,{...second.prospect,stage:'contracted',linkedRecipientId:'contract',requestId:randomUUID()},b),{status:409});
 // Failed writes roll back the record and event as a unit.
 const before=await store.prospect(second.prospect.id);
 db.exec("CREATE TRIGGER fail_prospect_event BEFORE INSERT ON work_prospect_events BEGIN SELECT RAISE(ABORT,'event failure'); END;");
 await assert.rejects(store.saveProspect(second.prospect.id,{...second.prospect,name:'실패할 변경',requestId:randomUUID()},a),/event failure/);
 assert.deepEqual(await store.prospect(second.prospect.id),before);
 assert.equal(db.prepare('SELECT count(*) n FROM recipients').get().n,2);
 assert.deepEqual((await store.prospects(a)).recipientOptions.map(row=>row.id),['contract']);
});

test('prospect tables have PostgreSQL RLS and deny direct client access',()=>{
 const schema=readFileSync(new URL('../server/postgres/schema.sql',import.meta.url),'utf8');
 for(const table of ['work_prospects','work_prospect_events']){assert(schema.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));assert(schema.includes(`REVOKE ALL ON TABLE ${table} FROM anon, authenticated`));}
});

test('prospect API dispatch rejects unauthorized, malformed and unsupported requests and persists valid activity',async t=>{
 const {Readable}=await import('node:stream');
 const {handleWorkTasks}=await import('../server/work-tasks.mjs');
 const before=process.env.AUTH_ALLOWED_EMAILS;process.env.AUTH_ALLOWED_EMAILS='api@example.com';t.after(()=>{if(before===undefined)delete process.env.AUTH_ALLOWED_EMAILS;else process.env.AUTH_ALLOWED_EMAILS=before;});
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('CREATE TABLE recipients(id TEXT PRIMARY KEY,name TEXT,operational_name TEXT,service_start_date TEXT,service_end_date TEXT,enabled INTEGER,is_draft INTEGER);CREATE TABLE employment_contracts(id TEXT PRIMARY KEY,worker_name TEXT,contract_start_date TEXT,contract_end_date TEXT,is_draft INTEGER,enabled INTEGER);');
 const store=createSqliteWorkStore(db,()=>true),user={id:'api-user',email:'api@example.com',name:'센터장'};
 async function call(path,method='GET',body,actor=user){const req=Readable.from(body===undefined?[]:[typeof body==='string'?body:JSON.stringify(body)]);req.url='/api/work/prospects'+path;req.method=method;let result;assert.equal(await handleWorkTasks(req,{},(_res,status,value)=>{result={status,value};},store,actor),true);return result;}
 assert.equal((await call('','GET',undefined,null)).status,401);assert.equal((await call('','GET',undefined,{...user,email:'blocked@example.com'})).status,403);
 const body={name:'API 상담',phone:'',contactName:'',contactRelation:'',contactPhone:'',address:'',source:'전화',needs:'',stage:'intake',stageReason:'',ownerId:'',receivedDate:recurrenceToday(),nextAction:'다음 상담',nextDate:recurrenceToday(),linkedRecipientId:'',archived:false,version:0,requestId:randomUUID()};
 const created=await call('','POST',body);assert.equal(created.status,200);const id=created.value.prospect.id;
 assert.equal((await call('')).value.prospects.length,1);assert.equal((await call('/'+id)).value.prospect.name,'API 상담');
 assert.equal((await call('/'+id,'DELETE')).status,405);assert.equal((await call('/missing')).status,404);assert.equal((await call('','POST','{invalid')).status,400);
 const activity=await call('/'+id+'/activities','POST',{requestId:randomUUID(),version:1,kind:'consultation',date:recurrenceToday(),content:'방문 상담 예정',completeFollowUp:true});
 assert.equal(activity.status,200);assert.equal(activity.value.prospect.stage,'intake');assert.equal(activity.value.prospect.nextAction,'');assert.equal(activity.value.events[0].kind,'consultation');
 assert.equal((await call('/'+id,'PUT',{...body,version:1,requestId:randomUUID()})).status,409);
});

test('SQLite reopening preserves the prospect record and consultation history',async t=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'miso-prospect-persistence-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'data.sqlite');
 let db=new DatabaseSync(path);t.after(()=>{if(db.isOpen)db.close();});
 db.exec('CREATE TABLE recipients(id TEXT PRIMARY KEY,name TEXT,operational_name TEXT,service_start_date TEXT,service_end_date TEXT,enabled INTEGER,is_draft INTEGER);CREATE TABLE employment_contracts(id TEXT PRIMARY KEY,worker_name TEXT,contract_start_date TEXT,contract_end_date TEXT,is_draft INTEGER,enabled INTEGER);');
 let store=createSqliteWorkStore(db,()=>true);const actor=await store.members({id:'persistent-user',email:'persist@example.com',name:'작성자'},['persist@example.com']);
 let saved=await store.saveProspect(null,{name:'보존할 고객',phone:'010-1111-1111',contactName:'',contactRelation:'',contactPhone:'',address:'',source:'소개',needs:'상담 필요',stage:'consulting',stageReason:'',ownerId:'',receivedDate:recurrenceToday(),nextAction:'',nextDate:'',linkedRecipientId:'',archived:false,version:0,requestId:randomUUID()},actor);
 saved=await store.addProspectActivity(saved.prospect.id,{version:saved.prospect.version,requestId:randomUUID(),kind:'consultation',date:recurrenceToday(),content:'재개 후에도 보존할 상담',completeFollowUp:false},actor);
 db.close();db=new DatabaseSync(path);store=createSqliteWorkStore(db,()=>true);assert.deepEqual(await store.prospect(saved.prospect.id),saved);
});
