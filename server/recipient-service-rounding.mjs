import {workError,newWorkId} from './work-tasks.mjs';
import {workDate,journalEvent} from './work-journal.mjs';
import {visitAssigneeIds} from '../shared/work-visits.mjs';
import {assertVisitAvailable} from './service-pauses.mjs';
export const roundingStatuses=['unplanned','coordinating','paperwork','visited'];
export function roundingValue(row,task) {
 const payload=row?JSON.parse(row.payload):{};
 const done=task && Boolean(task.completed_at || task.status==='done');
 return {status:done?'visited':payload.status==='visited'&&task?'coordinating':payload.status||'unplanned',date:payload.date||'',assigneeId:task?.roster_assignee_id||task?.assignee_id||payload.assigneeId||'',version:Number(row?.version??0),taskId:task?.id??null,taskVersion:task?Number(task.version):null};
}
export function createServiceRoundingStore(transaction,taskFromRow,event) {
 return {saveServiceRounding(month,id,body,current){
  if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'1000-01'||typeof id!=='string'||!id||!Number.isInteger(body.version)||body.version<0||!roundingStatuses.includes(body.status))throw workError(400,'라운딩 입력 내용을 확인해 주세요.');
  const date=body.date?workDate(body.date):'';
  if(date&&date.slice(0,7)!==month)throw workError(400,'라운딩 일자는 선택한 월 안의 날짜로 입력해 주세요.');
  const assignee=body.assigneeId||'';
  if(assignee&&(!visitAssigneeIds.includes(assignee)||!current.assignees.some(a=>a.id===assignee)))throw workError(400,'담당 사회복지사를 선택해 주세요.');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(body.status==='visited'&&(!date||!assignee||date>today))throw workError(400,'방문완료는 실제 방문일과 담당자를 입력해야 하며 미래 날짜는 사용할 수 없습니다.');
  return transaction(async q=>{
   const person=(await q(`SELECT * FROM recipients WHERE id=$1${q.forUpdate??''}`,[id])).rows[0];if(!person)throw workError(404,'수급자를 찾을 수 없습니다.');
   const old=(await q(`SELECT * FROM recipient_service_rounding WHERE month=$1 AND recipient_id=$2${q.forUpdate??''}`,[month,id])).rows[0];
   if(Number(old?.version??0)!==body.version)throw workError(409,'라운딩 정보가 변경되었습니다. 새로고침 후 다시 확인해 주세요.');
   let task=(await q(`SELECT t.* FROM work_visit_tasks v JOIN work_tasks t ON t.id=v.task_id WHERE v.month=$1 AND v.recipient_id=$2${q.forUpdate??''}`,[month,id])).rows[0];
   if((task?Number(task.version):null)!==(body.taskVersion??null))throw workError(409,'연결된 할일이 변경되었습니다. 새로고침 후 다시 확인해 주세요.');
   const previous=roundingValue(old,task),payload=old?JSON.parse(old.payload):{},now=new Date().toISOString();
   if(body.status==='visited'&&previous.status!=='visited'&&body.confirmComplete!==true)throw workError(400,'방문완료와 센터업무 연동을 확인해 주세요.');
   if(task?.status==='cancelled')throw workError(409,'연결된 라운딩 할일이 취소되어 있습니다. 센터업무에서 확인해 주세요.');
   if(body.status==='visited') {
    if((await q('SELECT id FROM recipient_service_pauses WHERE recipient_id=$1 AND returned_date IS NULL',[id])).rows.length)throw workError(409,'서비스 일시정지 중에는 방문완료로 처리할 수 없습니다.');
    if(!task){
     const taskId=newWorkId(),related=JSON.stringify([{id,type:'recipient',name:person.name,info:person.operational_name||''}]);
     task=(await q("INSERT INTO work_tasks(id,requester_id,roster_assignee_id,title,description,category,due_date,related,status,version,created_at,updated_at,updated_by) VALUES($1,$2,$3,$4,$5,'service',$6,$7,'open',1,$8,$8,$2) RETURNING *",[taskId,current.me.id,assignee,`${month} ${person.name} 라운딩`,'방문요양 서비스 관리에서 연결한 라운딩 업무',date,related,now])).rows[0];
     await q('INSERT INTO work_visit_tasks(month,recipient_id,task_id) VALUES($1,$2,$3) RETURNING task_id',[month,id,taskId]);await event(q,task,'created',current.me.id);
    }
   }
   if(task){
    await assertVisitAvailable(q,task.id);
    const completed=body.status==='visited'?(task.completed_at||now):null;
    task=(await q('UPDATE work_tasks SET roster_assignee_id=$1,assignee_id=NULL,due_date=$2,completed_at=$3,version=version+1,updated_by=$4,updated_at=$5 WHERE id=$6 RETURNING *',[assignee||null,date||null,completed,current.me.id,now,task.id])).rows[0];
    await event(q,task,'updated',current.me.id);
   }
   const execution=payload.executionId?(await q(`SELECT * FROM work_executions WHERE id=$1${q.forUpdate??''}`,[payload.executionId])).rows[0]:null;
   if(body.status==='visited'){
    if(execution){const updated=(await q("UPDATE work_executions SET assignee_id=$1,work_date=$2,status='recorded',version=version+1,updated_by=$3,updated_at=$4 WHERE id=$5 RETURNING *",[assignee,date,current.me.id,now,execution.id])).rows[0];await journalEvent(q,'execution',updated,'updated',current.me.id);}
    else {payload.executionId=newWorkId();const snapshot=JSON.stringify({title:task.title,category:'service',related:JSON.parse(task.related)});const created=(await q("INSERT INTO work_executions(id,task_id,plan_id,assignee_id,work_date,period,content,snapshot,status,version,created_by,updated_by,created_at,updated_at) VALUES($1,$2,NULL,$3,$4,'unknown',$5,$6,'recorded',1,$7,$7,$8,$8) RETURNING *",[payload.executionId,task.id,assignee,date,task.title,snapshot,current.me.id,now])).rows[0];await journalEvent(q,'execution',created,'created',current.me.id);}
   }else if(execution&&execution.status==='recorded'){const updated=(await q("UPDATE work_executions SET status='voided',version=version+1,updated_by=$1,updated_at=$2 WHERE id=$3 RETURNING *",[current.me.id,now,execution.id])).rows[0];await journalEvent(q,'execution',updated,'voided',current.me.id);}
   Object.assign(payload,{status:body.status,date,assigneeId:assignee,updatedAt:now,updatedBy:current.me.id});
   const saved=old?(await q('UPDATE recipient_service_rounding SET payload=$1,version=version+1 WHERE month=$2 AND recipient_id=$3 RETURNING *',[JSON.stringify(payload),month,id])).rows[0]:(await q('INSERT INTO recipient_service_rounding(month,recipient_id,payload,version) VALUES($1,$2,$3,1) RETURNING *',[month,id,JSON.stringify(payload)])).rows[0];
   return {month,recipientId:id,rounding:roundingValue(saved,task),task:task?{...taskFromRow(task),canEdit:true}:null};
  });
 }};
}
