import {workError} from './work-tasks.mjs';
import {workDate,workRequestId} from './work-journal.mjs';
import {recurrenceToday} from '../shared/work-recurrence.mjs';
import {prospectStages,prospectActivityKinds,prospectClosed} from '../shared/prospects.mjs';
import {recipientNotDeleted} from './recipient-deletions.mjs';
const string=(value,max=1000)=>{if(typeof value!=='string'||value.length>max)throw workError(400,'입력 길이와 내용을 확인해 주세요.');return value.trim();};
const fromRow=row=>({id:row.id,...JSON.parse(row.payload),version:Number(row.version),createdAt:row.created_at,updatedAt:row.updated_at});
const version=(row,value)=>{if(!Number.isInteger(value)||value!==(row?Number(row.version):0))throw workError(409,'다른 화면에서 잠재고객 기록이 변경되었습니다. 입력은 유지됩니다. 최신 기록을 불러와 비교해 주세요.');};
export function createProspectStore(transaction){
 async function record(q,id,lock=false){const row=(await q(`SELECT * FROM work_prospects WHERE id=$1${lock?q.forUpdate??'':''}`,[id])).rows[0];if(!row)throw workError(404,'잠재고객을 찾을 수 없습니다.');return row;}
 async function recipientOptions(q){return (await q(`SELECT * FROM recipients WHERE ${recipientNotDeleted()} ORDER BY name,id`,[])).rows;}
 async function detail(q,id){const row=await record(q,id),person=fromRow(row),options=await recipientOptions(q);return {prospect:{...person,linkedRecipientName:options.find(r=>r.id===person.linkedRecipientId)?.name||person.linkedRecipientName||''},events:(await q('SELECT e.*,m.name AS actor_name FROM work_prospect_events e JOIN work_members m ON m.id=e.actor_id WHERE e.prospect_id=$1 ORDER BY e.created_at DESC,e.id DESC',[id])).rows.map(e=>({id:e.id,kind:e.kind,...JSON.parse(e.payload),actorName:e.actor_name,createdAt:e.created_at})).sort((a,b)=>(b.recordVersion??0)-(a.recordVersion??0))};}
 async function event(q,id,kind,payload,current,eventId){await q('INSERT INTO work_prospect_events(id,prospect_id,kind,payload,actor_id,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[eventId,id,kind,JSON.stringify(payload),current.me.id,new Date().toISOString()]);}
 function normalize(body,current){
  if(!Object.hasOwn(prospectStages,body.stage)||typeof body.archived!=='boolean')throw workError(400,'진행 단계와 보관 상태를 확인해 주세요.');
  const value={name:string(body.name,100),phone:string(body.phone,60),contactName:string(body.contactName,100),contactRelation:string(body.contactRelation,100),contactPhone:string(body.contactPhone,60),address:string(body.address,500),source:string(body.source,200),needs:string(body.needs,5000),stage:body.stage,stageReason:string(body.stageReason,1000),ownerId:string(body.ownerId,100),receivedDate:workDate(body.receivedDate),nextAction:string(body.nextAction,500),nextDate:body.nextDate?workDate(body.nextDate):'',linkedRecipientId:string(body.linkedRecipientId,100),archived:body.archived};
  if(!value.name)throw workError(400,'잠재고객 이름을 입력해 주세요.');
  if(value.receivedDate>recurrenceToday())throw workError(400,'접수일은 오늘까지 입력할 수 있습니다.');
  if(value.ownerId&&!current.assignees.some(person=>person.id===value.ownerId))throw workError(400,'명부에 있는 담당자를 선택해 주세요.');
  if(value.nextDate&&!value.nextAction)throw workError(400,'다음 확인일에 할 업무도 함께 입력해 주세요.');
  if(['deferred','lost'].includes(value.stage)&&!value.stageReason)throw workError(400,'유보·종결 사유를 입력해 주세요.');
  if(value.stage==='contracted'&&!value.linkedRecipientId)throw workError(400,'계약을 완료한 수급자를 선택해 연결해 주세요.');
  if(value.stage!=='contracted')value.linkedRecipientId='';
  if(prospectClosed(value.stage)){value.nextDate='';value.nextAction='';}
  return value;
 }
 return {
  prospects(current){return transaction(async q=>{const people=await recipientOptions(q);return {prospects:(await q('SELECT * FROM work_prospects ORDER BY updated_at DESC,id',[])).rows.map(row=>{const p=fromRow(row);return {...p,linkedRecipientName:people.find(r=>r.id===p.linkedRecipientId)?.name||p.linkedRecipientName||''};}),assignees:current.assignees,recipientOptions:people.filter(r=>!r.is_draft&&r.service_start_date&&r.service_end_date).map(r=>({id:r.id,name:r.name,startDate:r.service_start_date,endDate:r.service_end_date}))};});},
  prospect(id){return transaction(q=>detail(q,id));},
  async saveProspect(id,body,current){const value=normalize(body,current),requestId=workRequestId(body.requestId);return transaction(async q=>{
   const prospectId=id||requestId,old=id?await record(q,id,true):(await q(`SELECT * FROM work_prospects WHERE id=$1${q.forUpdate??''}`,[prospectId])).rows[0];
   if(!id&&old){const original=(await q("SELECT * FROM work_prospect_events WHERE id=$1 AND prospect_id=$2 AND kind='created'",[requestId,prospectId])).rows[0];if(original?.actor_id===current.me.id&&JSON.stringify(JSON.parse(original.payload).value)===JSON.stringify(value))return detail(q,prospectId);throw workError(409,'등록 요청이 이미 처리되었습니다. 명단을 다시 불러와 주세요.');}
   version(old,body.version);
   let linkedName='';
   if(value.linkedRecipientId){const linked=(await q(`SELECT * FROM recipients WHERE id=$1 AND ${recipientNotDeleted()}${q.forUpdate??''}`,[value.linkedRecipientId])).rows[0];const existingLink=old&&JSON.parse(old.payload).linkedRecipientId===value.linkedRecipientId;if((!linked||linked.is_draft||!linked.service_start_date||!linked.service_end_date)&&!existingLink)throw workError(400,'계약 정보가 등록된 수급자를 선택해 주세요.');linkedName=linked?.name||(old?JSON.parse(old.payload).linkedRecipientName:'')||'';const duplicate=(await q('SELECT * FROM work_prospects',[])).rows.some(row=>row.id!==prospectId&&JSON.parse(row.payload).linkedRecipientId===value.linkedRecipientId);if(duplicate)throw workError(409,'이미 다른 잠재고객과 연결된 수급자입니다. 기존 기록을 확인해 주세요.');}
   const before=old?JSON.parse(old.payload):null,payload={...value,linkedRecipientName:linkedName,lastContactDate:before?.lastContactDate||''},now=new Date().toISOString();
   if(old)await q('UPDATE work_prospects SET payload=$1,version=version+1,updated_at=$2 WHERE id=$3 RETURNING id',[JSON.stringify(payload),now,prospectId]);
   else {const inserted=(await q('INSERT INTO work_prospects(id,payload,version,created_at,updated_at) VALUES($1,$2,1,$3,$3) ON CONFLICT(id) DO NOTHING RETURNING id',[prospectId,JSON.stringify(payload),now])).rows[0];if(!inserted){const original=(await q("SELECT * FROM work_prospect_events WHERE id=$1 AND prospect_id=$2 AND kind='created'",[requestId,prospectId])).rows[0];if(original?.actor_id===current.me.id&&JSON.stringify(JSON.parse(original.payload).value)===JSON.stringify(value))return detail(q,prospectId);throw workError(409,'등록 요청이 이미 처리되었습니다. 다시 불러와 주세요.');}}
   const kind=!old?'created':before.archived!==value.archived?(value.archived?'archived':'restored'):before.stage!==value.stage?'stage_changed':'updated';
   await event(q,prospectId,kind,{recordVersion:Number(old?.version??0)+1,date:recurrenceToday(),before:before?{stage:before.stage,nextAction:before.nextAction,nextDate:before.nextDate}:null,value},current,requestId);
   return detail(q,prospectId);
  });},
  async addProspectActivity(id,body,current){const requestId=workRequestId(body.requestId),date=workDate(body.date),content=string(body.content,5000);if(!Object.hasOwn(prospectActivityKinds,body.kind)||!content||date>recurrenceToday()||typeof body.completeFollowUp!=='boolean')throw workError(400,'기록 종류·실제 활동일·내용을 확인해 주세요.');return transaction(async q=>{
   const old=await record(q,id,true),value=JSON.parse(old.payload);
   const retry=(await q('SELECT * FROM work_prospect_events WHERE id=$1',[requestId])).rows[0];
   if(retry){const saved=JSON.parse(retry.payload);if(retry.prospect_id===id&&retry.actor_id===current.me.id&&retry.kind===body.kind&&saved.date===date&&saved.content===content&&saved.completeFollowUp===body.completeFollowUp)return detail(q,id);throw workError(409,'이 기록 요청은 이미 처리되었습니다.');}
   version(old,body.version);if(value.archived)throw workError(409,'보관된 잠재고객은 복원한 뒤 기록해 주세요.');
   if(date<value.receivedDate)throw workError(400,'활동일은 접수일 이후로 입력해 주세요.');
   const completedFollowUp=body.completeFollowUp?{action:value.nextAction,date:value.nextDate}:null;
   if(body.completeFollowUp&&!value.nextAction)throw workError(400,'완료할 다음 업무가 없습니다.');
   if(body.completeFollowUp){value.nextAction='';value.nextDate='';}
   if(body.kind!=='note'&&date>(value.lastContactDate||''))value.lastContactDate=date;
   await q('UPDATE work_prospects SET payload=$1,version=version+1,updated_at=$2 WHERE id=$3 RETURNING id',[JSON.stringify(value),new Date().toISOString(),id]);
   await event(q,id,body.kind,{recordVersion:Number(old.version)+1,date,content,completeFollowUp:body.completeFollowUp,completedFollowUp},current,requestId);return detail(q,id);
  });}
 };
}
