import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {parseRecipientWorkbook,planRecipientImport} from '../server/recipient-import.mjs';
import {createSqliteWorkStore,createPostgresWorkStore} from '../server/work-task-stores.mjs';
import {importWorkbook} from './fixtures/recipient-import-workbook.mjs';

const existing={id:'existing',name:'김확인',birthDate:'1940-01-01',longTermCareNumber:'1234567890',careGrade:'3등급',phone:'010-1111-1111',address:'기존 주소',isDraft:false,enabled:false,updatedAt:'before',serviceStartDate:'2026-01-01',serviceEndDate:'2026-12-31',contractRegisteredDate:'2026-01-01',contractExpiredDate:'2026-12-31'};
test('reads page titles, multiline headers, all pages, dates, blank fields and broken decorative drawings',async()=>{
 const source=await importWorkbook({rows:[['김확인','3',new Date('1940-01-01T00:00:00Z'),'l1234567890','','','2026.1.1','2026-01-01','2027-12-31','2028-12-31']],second:[['새수급자','인지지원','19500101','','','새 주소']],brokenDrawing:true});
 const parsed=await parseRecipientWorkbook(source);assert.equal(parsed.rows.length,2);assert.deepEqual(parsed.rows[0].errors,[]);assert.equal(parsed.rows[0].data.birthDate,'1940-01-01');assert.equal(parsed.rows[0].data.longTermCareNumber,'L1234567890');assert.equal(parsed.rows[0].data.careGrade,'3등급');assert.equal(parsed.rows[0].data.contractExpiredDate,'2027-12-31');assert(!('phone'in parsed.rows[0].data));assert(!Object.values(parsed.rows[0].data).includes('2028-12-31'));
 const plan=planRecipientImport(parsed,[existing]);assert.equal(plan.rows[0].action,'update');assert.equal(plan.rows[0].match,'인정번호 일치');assert.equal(plan.rows[1].action,'create');assert(!plan.rows[0].changes.some(c=>['phone','address','longTermCareNumber'].includes(c.field)));
});
test('matches missing number by unique name and birth, blocks ambiguous/deleted/mismatched identities',async()=>{
 const parsed=await parseRecipientWorkbook(await importWorkbook({rows:[['김확인','3등급','1940-01-01']]}));
 assert.equal(planRecipientImport(parsed,[existing]).rows[0].match,'이름·생년월일 일치');
 assert(planRecipientImport(parsed,[existing,{...existing,id:'other'}]).rows[0].errors.length);
 assert(planRecipientImport(parsed,[{...existing,deleted:true}]).rows[0].errors.length);
 const numbered=await parseRecipientWorkbook(await importWorkbook({rows:[['다른사람','','1940-01-01','L1234567890']]}));assert(planRecipientImport(numbered,[existing]).rows[0].errors.length);
});
test('duplicate contracts require an explicit single-row choice; invalid dates and formulas never import',async()=>{
 const parsed=await parseRecipientWorkbook(await importWorkbook({rows:[['김확인','3등급','1940-01-01','','','','','2026-01-01','2026-12-31'],['김확인','3등급','1940-01-01','','','','','2026-10-01','2027-09-30'],['오류대상','9등급','1940-02-31'],['수식대상','3등급','1940-01-01','','',{formula:'1+1',result:2}]],second:[['김확인','3등급','1940-01-01','','','','','2026-01-01','2026-12-31']]}));
 const plan=planRecipientImport(parsed,[existing]);assert.equal(plan.rows[0].conflictGroup,plan.rows[1].conflictGroup);assert(plan.rows[2].errors.length>=2);assert(plan.rows[3].errors.some(e=>e.includes('수식')));assert.equal(plan.rows[4].action,'duplicate');
 await assert.rejects(parseRecipientWorkbook({filename:'bad.xlsx',file:Buffer.from('bad').toString('base64')}),/읽을 수/);
 await assert.rejects(parseRecipientWorkbook({filename:'bad.xls',file:'a'}),/xlsx/);
});
for(const mode of ['sqlite','postgres-adapter'])test(`${mode}: preview is read only; selective, atomic import preserves state and history and rejects stale retries`,async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec(`CREATE TABLE recipients(id TEXT PRIMARY KEY,name TEXT,birth_date TEXT,long_term_care_number TEXT UNIQUE,care_grade TEXT,phone TEXT,address TEXT,representative_name TEXT NOT NULL DEFAULT '',representative_relation TEXT NOT NULL DEFAULT '',representative_phone TEXT NOT NULL DEFAULT '',contract_registered_date TEXT,service_start_date TEXT,service_end_date TEXT,contract_expired_date TEXT,is_draft INTEGER,enabled INTEGER,service_type TEXT,caregiver_requirements TEXT,reduction_type TEXT,related_people TEXT,created_at TEXT,updated_at TEXT,assigned_backoffice_user_id TEXT,medical_history TEXT NOT NULL DEFAULT '');CREATE TABLE recipient_deletions(recipient_id TEXT PRIMARY KEY);CREATE TABLE recipient_contract_events(id TEXT PRIMARY KEY,recipient_id TEXT,type TEXT,service_start_date TEXT,service_end_date TEXT,memo TEXT,created_at TEXT);`);
 const bridge={async connect(){return {async query(sql,params=[]){if(sql.startsWith('LOCK TABLE'))return{rows:[]};if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)){db.exec(sql);return{rows:[]};}const values=[],converted=sql.replace(/\$(\d+)/g,(_,n)=>{values.push(params[Number(n)-1]);return'?';});const rows=db.prepare(converted).all(...values);return{rows,rowCount:rows.length};},release(){}};}};
 if(mode==='postgres-adapter')db.exec(readFileSync(new URL('../server/work-task-schema.sql',import.meta.url),'utf8')+readFileSync(new URL('../server/work-journal-schema.sql',import.meta.url),'utf8'));
 const store=mode==='sqlite'?createSqliteWorkStore(db,()=>true):createPostgresWorkStore(bridge,()=>true);
 db.prepare(`INSERT INTO recipients(id,name,birth_date,long_term_care_number,care_grade,phone,address,contract_registered_date,service_start_date,service_end_date,contract_expired_date,is_draft,enabled,created_at,updated_at,assigned_backoffice_user_id,medical_history) VALUES('existing','김확인','1940-01-01','1234567890','3등급','010-1111-1111','기존 주소','2026-01-01','2026-01-01','2026-12-31','2026-12-31',0,0,'created','before','staff','건강 기록 보존')`).run();
 const body=await importWorkbook({rows:[['김확인','4등급','1940-01-01','','','','2026-01-01','2026-01-01','2027-12-31'],['새수급자','3등급','1950-01-01'],['오류','9등급','1940-02-31']]});
 let preview=await store.previewRecipientImport(body);assert.equal(preview.rows[0].targetId,'existing');assert.equal(db.prepare('SELECT count(*) n FROM recipients').get().n,1);
 await assert.rejects(store.applyRecipientImport({...body,fingerprint:preview.fingerprint,selectedKeys:preview.rows.map(r=>r.key)}),/오류/);
 assert.equal(db.prepare('SELECT care_grade FROM recipients').get().care_grade,'3등급');
 db.exec("UPDATE recipients SET updated_at='concurrent' WHERE id='existing'");
 await assert.rejects(store.applyRecipientImport({...body,fingerprint:preview.fingerprint,selectedKeys:[preview.rows[0].key]}),{status:409});
 preview=await store.previewRecipientImport(body);
 const applyBody={...body,fingerprint:preview.fingerprint,selectedKeys:preview.rows.slice(0,2).map(r=>r.key)};
 db.exec("CREATE TRIGGER fail_import BEFORE INSERT ON recipients BEGIN SELECT RAISE(ABORT,'rollback import'); END;");
 await assert.rejects(store.applyRecipientImport(applyBody),/rollback import/);assert.equal(db.prepare('SELECT care_grade FROM recipients').get().care_grade,'3등급');assert.equal(db.prepare('SELECT count(*) n FROM recipient_contract_events').get().n,0);db.exec('DROP TRIGGER fail_import');
 assert.deepEqual(await store.applyRecipientImport(applyBody),{created:1,updated:1});
 const saved=db.prepare("SELECT * FROM recipients WHERE id='existing'").get();assert.equal(saved.care_grade,'4등급');assert.equal(saved.phone,existing.phone);assert.equal(saved.address,existing.address);assert.equal(saved.long_term_care_number,'1234567890');assert.equal(saved.enabled,0);assert.equal(saved.is_draft,0);assert.equal(saved.assigned_backoffice_user_id,'staff');assert.equal(saved.medical_history,'건강 기록 보존');
 const created=db.prepare("SELECT * FROM recipients WHERE id!='existing'").get();assert.equal(created.is_draft,1);assert(created.long_term_care_number.startsWith('__draft__:'));assert.equal(created.service_start_date,'');
 const event=db.prepare('SELECT * FROM recipient_contract_events').get();assert.equal(event.type,'service_correction');assert.equal(JSON.parse(event.memo).previousEndDate,'2026-12-31');
 await assert.rejects(store.applyRecipientImport(applyBody),{status:409});assert.equal(db.prepare('SELECT count(*) n FROM recipients').get().n,2);
 const conflict=await importWorkbook({rows:[['새선택','3등급','1950-02-01','','','첫 주소'],['새선택','3등급','1950-02-01','','','두번째 주소']]});const cp=await store.previewRecipientImport(conflict);await assert.rejects(store.applyRecipientImport({...conflict,fingerprint:cp.fingerprint,selectedKeys:cp.rows.map(r=>r.key)}),/한 행/);await store.applyRecipientImport({...conflict,fingerprint:cp.fingerprint,selectedKeys:[cp.rows[1].key]});assert.equal(db.prepare("SELECT address FROM recipients WHERE name='새선택'").get().address,'두번째 주소');
});
