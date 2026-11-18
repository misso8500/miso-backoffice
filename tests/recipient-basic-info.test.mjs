import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {basicInfoDraft,registrationIssues} from '../shared/recipient-basic-info.mjs';
import {prepareRecipientBasicInfo,createRecipientBasicInfoStore} from '../server/recipient-basic-info.mjs';
const existing={...basicInfoDraft({}),id:'a',name:'김수급',serviceType:'방문',reductionType:'일반',isDraft:true,updatedAt:'2026-01-01T00:00:00.000Z',contractRegisteredDate:'',contractExpiredDate:''};
const ready={...basicInfoDraft(existing),birthDate:'1940-01-01',longTermCareNumber:'1234567890',careGrade:'3등급',address:'광주',representativeName:'김보호',representativeRelation:'자녀',representativePhone:'010-1234-5678',serviceStartDate:'2026-01-01',serviceEndDate:'2028-12-31',updatedAt:existing.updatedAt,completeRegistration:false,periodReason:'initial'};
test('등록 안내는 실질적인 필수정보를 검사하고 담당자·업무식별명은 선택으로 둔다',()=>{
 assert.deepEqual(registrationIssues(ready),[]);assert.equal(registrationIssues({...ready,serviceEndDate:'2026-02-30'})[0].key,'serviceEndDate');assert.equal(registrationIssues({...ready,serviceEndDate:'2025-12-31'})[0].key,'serviceEndDate');
 assert.equal(prepareRecipientBasicInfo(ready,existing).isDraft,true);const complete=prepareRecipientBasicInfo({...ready,completeRegistration:true},existing);assert.equal(complete.isDraft,false);assert.equal(complete.value.longTermCareNumber,'L1234567890');
 assert.throws(()=>prepareRecipientBasicInfo({...ready,address:'',completeRegistration:true},existing),{status:400});assert.throws(()=>prepareRecipientBasicInfo({...ready,updatedAt:'old'},existing),{status:409});assert.throws(()=>prepareRecipientBasicInfo({...ready,enabled:true},existing),{status:400});assert.throws(()=>prepareRecipientBasicInfo({...ready,assignedBackofficeUserId:'unknown'},existing),{status:400});
 assert.throws(()=>prepareRecipientBasicInfo({...ready,address:''},{...existing,...ready,isDraft:false}),{status:400});
});
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE recipients(id TEXT PRIMARY KEY,name TEXT,birth_date TEXT,long_term_care_number TEXT,care_grade TEXT,phone TEXT,address TEXT,representative_name TEXT,representative_relation TEXT,representative_phone TEXT,operational_name TEXT,assigned_backoffice_user_id TEXT,service_start_date TEXT,service_end_date TEXT,service_type TEXT,reduction_type TEXT,related_people TEXT,contract_registered_date TEXT,contract_expired_date TEXT,updated_at TEXT,is_draft INTEGER,enabled INTEGER DEFAULT 1,medical_history TEXT DEFAULT '보존할 병력');CREATE TABLE recipient_deletions(recipient_id TEXT);CREATE TABLE backoffice_users(id TEXT);INSERT INTO backoffice_users VALUES('worker');CREATE TABLE recipient_contract_events(id TEXT,recipient_id TEXT,type TEXT,service_start_date TEXT,service_end_date TEXT,contract_registered_date TEXT,contract_expired_date TEXT,memo TEXT,created_at TEXT);`);
 db.prepare("INSERT INTO recipients(id,name,long_term_care_number,service_type,reduction_type,updated_at,is_draft) VALUES('a','김수급','__draft__:a','방문','일반',?,1)").run(existing.updatedAt);
 let transactions=0;
 const store=createRecipientBasicInfoStore(async callback=>{transactions++;db.exec('BEGIN');try{const result=await callback(async(sql,values=[])=>{const bound=[];const query=sql.replace(/\$(\d+)/g,(_,n)=>{bound.push(values[Number(n)-1]);return '?';});return {rows:db.prepare(query).all(...bound)};});db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}});
 return {db,store,count:()=>transactions};
}
test('수정사항과 등록 완료를 한 트랜잭션에 저장하고 계약·등록 이력을 남긴다',async()=>{
 const {db,store,count}=fixture();try{
 await store.saveRecipientBasicInfo('a',{...ready,operationalName:'업무 표시',assignedBackofficeUserId:'worker',phone:'010-9999-9999',completeRegistration:true});assert.equal(count(),1);
 const row=db.prepare("SELECT * FROM recipients WHERE id='a'").get();assert.equal(row.is_draft,0);assert.equal(row.phone,'010-9999-9999');assert.equal(row.assigned_backoffice_user_id,'worker');assert.equal(row.long_term_care_number,'L1234567890');assert.equal(row.contract_expired_date,'2028-12-31');assert.equal(row.enabled,1);assert.equal(row.medical_history,'보존할 병력');
 const events=db.prepare('SELECT * FROM recipient_contract_events').all();assert.deepEqual(events.map(e=>e.type),['service_initial','registration_completed']);assert.equal(JSON.parse(events[0].memo).previousStartDate,'');
 await assert.rejects(store.saveRecipientBasicInfo('a',ready),{status:409});assert.equal(db.prepare("SELECT phone FROM recipients WHERE id='a'").get().phone,row.phone);
 }finally{db.close();}
});
test('이력 저장 실패 시 모든 수정과 등록 상태를 롤백한다',async()=>{
 const {db,store}=fixture();try{db.exec("CREATE TRIGGER fail_event BEFORE INSERT ON recipient_contract_events BEGIN SELECT RAISE(ABORT,'history failed'); END;");await assert.rejects(store.saveRecipientBasicInfo('a',{...ready,completeRegistration:true}),/history failed/);const row=db.prepare("SELECT * FROM recipients WHERE id='a'").get();assert.equal(row.is_draft,1);assert.equal(row.long_term_care_number,'__draft__:a');assert.equal(row.service_end_date,null);assert.equal(row.updated_at,existing.updatedAt);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM recipient_contract_events').get().n,0);}finally{db.close();}
});
test('숫자만 저장된 기존 인정번호도 중복 거부하며 임시저장은 등록을 완료하지 않는다',async()=>{
 const {db,store}=fixture();try{db.exec("INSERT INTO recipients(id,long_term_care_number) VALUES('b','1234567890')");await assert.rejects(store.saveRecipientBasicInfo('a',ready),{status:409});db.exec("DELETE FROM recipients WHERE id='b'");await store.saveRecipientBasicInfo('a',{...ready,longTermCareNumber:'',serviceStartDate:'',serviceEndDate:''});assert.equal(db.prepare("SELECT is_draft FROM recipients WHERE id='a'").get().is_draft,1);db.exec("INSERT INTO recipient_deletions VALUES('a')");await assert.rejects(store.saveRecipientBasicInfo('a',ready),{status:404});}finally{db.close();}
});
