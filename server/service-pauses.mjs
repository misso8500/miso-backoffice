import { workError, newWorkId } from './work-tasks.mjs';
import { workDate } from './work-journal.mjs';
import { recurrenceToday } from '../shared/work-recurrence.mjs';

export const pauseFrom = row => row ? {id:row.id,recipientId:row.recipient_id,startDate:row.start_date,expectedReturnDate:row.expected_return_date,reason:row.reason,returnedDate:row.returned_date,version:Number(row.version)} : null;
export const heldTaskSql = 'EXISTS (SELECT 1 FROM work_visit_holds vh WHERE vh.task_id=work_tasks.id AND vh.released_at IS NULL)';
export async function assertVisitAvailable(q,id) {
  const held=(await q('SELECT task_id FROM work_visit_holds WHERE task_id=$1 AND released_at IS NULL',[id])).rows[0];
  const paused=(await q('SELECT v.task_id FROM work_visit_tasks v JOIN recipient_service_pauses p ON p.recipient_id=v.recipient_id WHERE v.task_id=$1 AND p.returned_date IS NULL AND v.month>=substr(p.start_date,1,7)',[id])).rows[0];
  if(held||paused)throw workError(409,'서비스 일시정지로 보류된 라운딩입니다. 복귀 처리 후 진행해 주세요.');
}

export function createServicePauseStore(transaction,event) {
  async function audit(q,row,action,current) {
    await q('INSERT INTO recipient_service_pause_events(id,pause_id,actor_id,action,payload,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[newWorkId(),row.id,current.me.id,action,JSON.stringify(pauseFrom(row)),new Date().toISOString()]);
  }
  async function personLock(q,id) {
    const row=(await q(`SELECT * FROM recipients WHERE id=$1${q.forUpdate??''}`,[id])).rows[0];
    if(!row)throw workError(404,'수급자를 찾을 수 없습니다.');return row;
  }
  return {
    async pauseService(recipientId,body,current) {
      const start=workDate(body.startDate),expected=body.expectedReturnDate?workDate(body.expectedReturnDate):null;
      if(start>recurrenceToday()||expected&&expected<start)throw workError(400,'정지일은 오늘까지, 복귀 예정일은 정지일 이후로 입력해 주세요.');
      if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)throw workError(400,'일시정지 사유를 1~1000자로 입력해 주세요.');
      return transaction(async q=>{
        const person=await personLock(q,recipientId);
        if(!person.enabled||person.is_draft)throw workError(409,'서비스 계약 상태를 확인해 주세요.');
        const existing=(await q('SELECT * FROM recipient_service_pauses WHERE recipient_id=$1 ORDER BY start_date DESC,created_at DESC',[recipientId])).rows;
        if(existing.some(row=>!row.returned_date))throw workError(409,'이미 일시정지 중입니다. 최신 명단을 확인해 주세요.');
        if(existing.some(row=>row.returned_date>start)||person.service_start_date>start)throw workError(400,'기존 정지·복귀 이력과 서비스 시작일 이후의 날짜를 입력해 주세요.');
        const now=new Date().toISOString(),id=newWorkId();
        const row=(await q('INSERT INTO recipient_service_pauses(id,recipient_id,start_date,expected_return_date,reason,returned_date,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,NULL,1,$6,$6) RETURNING *',[id,recipientId,start,expected,body.reason.trim(),now])).rows[0];
        // Lock in the same task-id order as other multi-task operations; completed/cancelled work stays untouched.
        const tasks=(await q(`SELECT * FROM work_tasks WHERE id IN (SELECT task_id FROM work_visit_tasks WHERE recipient_id=$1 AND month>=$2) AND status='open' AND completed_at IS NULL ORDER BY id${q.forUpdate??''}`,[recipientId,start.slice(0,7)])).rows;
        for(const task of tasks){
          await q('INSERT INTO work_visit_holds(task_id,pause_id,released_at) VALUES($1,$2,NULL) RETURNING task_id',[task.id,id]);
          const updated=(await q('UPDATE work_tasks SET version=version+1,updated_at=$1,updated_by=$2 WHERE id=$3 RETURNING *',[now,current.me.id,task.id])).rows[0];
          await event(q,{...updated,visit_on_hold:1},'updated',current.me.id);
        }
        await audit(q,row,'paused',current);return pauseFrom(row);
      });
    },
    async resumeService(recipientId,body,current) {
      const returned=workDate(body.returnedDate);
      if(returned>recurrenceToday())throw workError(400,'복귀일은 오늘까지 입력할 수 있습니다.');
      return transaction(async q=>{
        const person=await personLock(q,recipientId);
        if(!person.enabled)throw workError(409,'서비스 종료 상태를 먼저 확인해 주세요.');
        const old=(await q('SELECT * FROM recipient_service_pauses WHERE recipient_id=$1 AND returned_date IS NULL',[recipientId])).rows[0];
        if(!old||old.id!==body.pauseId||old.version!==body.version)throw workError(409,'정지 상태가 변경되었습니다. 최신 명단을 확인해 주세요.');
        if(returned<old.start_date)throw workError(400,'복귀일은 정지일 이후로 입력해 주세요.');
        const now=new Date().toISOString();
        const tasks=(await q(`SELECT * FROM work_tasks WHERE id IN (SELECT h.task_id FROM work_visit_holds h JOIN work_visit_tasks v ON v.task_id=h.task_id WHERE h.pause_id=$1 AND h.released_at IS NULL AND v.month>=$2) ORDER BY id${q.forUpdate??''}`,[old.id,returned.slice(0,7)])).rows;
        for(const task of tasks){
          await q('UPDATE work_visit_holds SET released_at=$1 WHERE task_id=$2 AND pause_id=$3 RETURNING task_id',[now,task.id,old.id]);
          const held=(await q('SELECT task_id FROM work_visit_holds WHERE task_id=$1 AND released_at IS NULL',[task.id])).rows.length;
          const updated=(await q('UPDATE work_tasks SET version=version+1,updated_at=$1,updated_by=$2 WHERE id=$3 RETURNING *',[now,current.me.id,task.id])).rows[0];
          await event(q,{...updated,visit_on_hold:held?1:0},'updated',current.me.id);
        }
        const row=(await q('UPDATE recipient_service_pauses SET returned_date=$1,version=version+1,updated_at=$2 WHERE id=$3 RETURNING *',[returned,now,old.id])).rows[0];
        await audit(q,row,'resumed',current);return pauseFrom(row);
      });
    }
  };
}
