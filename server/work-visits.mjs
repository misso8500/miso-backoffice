import { workError, newWorkId } from './work-tasks.mjs';
import { monthDays } from '../shared/staff-records.mjs';
import { recurrenceToday } from '../shared/work-recurrence.mjs';
import { visitAssigneeIds } from '../shared/work-visits.mjs';

export function createVisitStore(transaction, task, event) {
  function range(month) { const days=monthDays(month);return [days[0],days.at(-1)]; }
  function eligible(row, from, to) {
    const dates=[row.contract_registered_date,row.contract_expired_date,row.service_start_date,row.service_end_date];
    if(row.is_draft||dates.some(date=>typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))return false;
    return [from,row.contract_registered_date,row.service_start_date].sort().at(-1)<=[to,row.contract_expired_date,row.service_end_date].sort()[0];
  }
  return {
    async visitMonth(month) {
      const [from,to]=range(month);
      return transaction(async q=>{
        const people=(await q('SELECT * FROM recipients ORDER BY name,id',[])).rows;
        const links=(await q('SELECT v.recipient_id,t.* FROM work_visit_tasks v JOIN work_tasks t ON t.id=v.task_id WHERE v.month=$1',[month])).rows;
        return {month,dueDate:to,rows:people.filter(person=>eligible(person,from,to)||links.some(link=>link.recipient_id===person.id)).map(person=>{
          const linked=links.find(link=>link.recipient_id===person.id);
          return {recipientId:person.id,name:person.name,enabled:Boolean(person.enabled),eligible:Boolean(eligible(person,from,to)),serviceStartDate:person.service_start_date,serviceEndDate:person.service_end_date,task:linked?task(linked):null};
        })};
      });
    },
    async startVisit(month,body,current) {
      const [from,to]=range(month);
      if(month>recurrenceToday().slice(0,7))throw workError(400,'다음 달 라운딩업무는 미리 생성하지 않습니다.');
      if(body.serviceConfirmed!==true)throw workError(400,'일시정지 여부와 해당 월 서비스 제공을 확인해 주세요.');
      if(!visitAssigneeIds.includes(body.assigneeId)||!current.assignees.some(person=>person.id===body.assigneeId))throw workError(400,'라운딩 담당 사회복지사를 선택해 주세요.');
      if(typeof body.recipientId!=='string')throw workError(400,'수급자를 선택해 주세요.');
      return transaction(async q=>{
        const person=(await q(`SELECT * FROM recipients WHERE id=$1${q.forUpdate??''}`,[body.recipientId])).rows[0];
        if(!person)throw workError(404,'수급자를 찾을 수 없습니다.');
        const existing=(await q('SELECT t.* FROM work_visit_tasks v JOIN work_tasks t ON t.id=v.task_id WHERE v.month=$1 AND v.recipient_id=$2',[month,person.id])).rows[0];
        if(existing)return task(existing);
        if(!person.enabled||!eligible(person,from,to))throw workError(409,'계약·서비스 기간 또는 종료 상태가 변경되었습니다. 명단을 다시 확인해 주세요.');
        const now=new Date().toISOString(),id=newWorkId();
        const row=(await q("INSERT INTO work_tasks(id,requester_id,roster_assignee_id,title,description,category,due_date,related,status,version,created_at,updated_at,updated_by) VALUES($1,$2,$3,$4,$5,'service',$6,$7,'open',1,$8,$8,$2) RETURNING *",[id,current.me.id,body.assigneeId,`${month} ${person.name} 라운딩`,'라운딩 관리에서 서비스 제공 여부를 확인하고 생성한 라운딩업무입니다.',to,JSON.stringify([{id:person.id,type:'recipient',name:person.name,info:person.operational_name||''}]),now])).rows[0];
        await q('INSERT INTO work_visit_tasks(month,recipient_id,task_id) VALUES($1,$2,$3) RETURNING task_id',[month,person.id,id]);
        await event(q,row,'created',current.me.id);
        return task(row);
      });
    }
  };
}
