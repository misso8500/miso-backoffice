import {workError} from './work-tasks.mjs';
import {recipientNotDeleted} from './recipient-deletions.mjs';
import {roundingValue} from './recipient-service-rounding.mjs';
import {visitAssigneeIds} from '../shared/work-visits.mjs';
const validMonth=value=>typeof value==='string' && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
export function createRecipientServiceMonthStore(transaction) {
  const people=async q=>(await q(`SELECT id,name,operational_name,service_start_date,service_end_date,enabled,is_draft FROM recipients WHERE ${recipientNotDeleted()} ORDER BY name,id`,[])).rows;
  async function result(q,month,row,rows) {
    const ids=new Set(row?JSON.parse(row.recipient_ids):[]);
    const workerRows=(await q('SELECT recipient_id,payload FROM recipient_service_workers WHERE month=$1',[month])).rows;
    const workerMap=new Map(workerRows.map(item=>[item.recipient_id,JSON.parse(item.payload)]));
    const rounding=(await q('SELECT * FROM recipient_service_rounding WHERE month=$1',[month])).rows;
    const tasks=(await q('SELECT v.recipient_id,t.* FROM work_visit_tasks v JOIN work_tasks t ON t.id=v.task_id WHERE v.month=$1',[month])).rows;
    const assignees=(await q('SELECT id,name FROM work_assignees ORDER BY sort_order',[])).rows.filter(a=>visitAssigneeIds.includes(a.id));
    return {month,assignees,version:Number(row?.version ?? 0),updatedAt:row?.updated_at ?? null,rows:rows.map(r=>({id:r.id,name:r.name,operationalName:r.operational_name||'',serviceStartDate:r.service_start_date||'',serviceEndDate:r.service_end_date||'',enabled:Boolean(r.enabled),isDraft:Boolean(r.is_draft),checked:ids.has(r.id),workers:workerMap.get(r.id)||[],rounding:roundingValue(rounding.find(item=>item.recipient_id===r.id),tasks.find(item=>item.recipient_id===r.id))}))};
  }
  return {
    serviceWorkers() {return transaction(async q=>({workers:(await q('SELECT id,worker_name,worker_birth_date,job_title,enabled,is_draft FROM employment_contracts ORDER BY worker_name,worker_birth_date,id',[])).rows.map(row=>({id:row.id,name:row.worker_name,birthDate:row.worker_birth_date||'',jobTitle:row.job_title||'',enabled:Boolean(row.enabled),isDraft:Boolean(row.is_draft)}))}));},
    recipientServiceMonth(month) {
      if(!validMonth(month))throw workError(400,'연도와 월을 확인해 주세요.');
      return transaction(async q=>result(q,month,(await q('SELECT * FROM recipient_service_months WHERE month=$1',[month])).rows[0],await people(q)));
    },
    saveRecipientServiceMonth(month,body,current) {
      if(!validMonth(month)||!Number.isInteger(body.version)||body.version<0||!Array.isArray(body.recipientIds)||body.recipientIds.length>10000||body.recipientIds.some(id=>typeof id!=='string'||!id||id.length>100))throw workError(400,'적용할 수급자 목록과 조회 버전을 확인해 주세요.');
      return transaction(async q=>{
        await q("INSERT INTO recipient_service_months(month,recipient_ids,version,updated_by,updated_at) VALUES($1,'[]',0,$2,$3) ON CONFLICT(month) DO NOTHING RETURNING month",[month,current.me.id,new Date().toISOString()]);
        const old=(await q(`SELECT * FROM recipient_service_months WHERE month=$1${q.forUpdate ?? ''}`,[month])).rows[0];
        if(Number(old.version)!==body.version)throw workError(409,'다른 사용자가 이 달의 목록을 변경했습니다. 변경 내용은 유지됩니다. 새로고침 후 다시 확인해 주세요.');
        const rows=await people(q),available=new Set(rows.map(r=>r.id)),ids=[...new Set(body.recipientIds)].sort();
        if(ids.some(id=>!available.has(id)))throw workError(400,'목록에 없는 수급자가 포함되어 있습니다. 새로고침해 주세요.');
        // Older clients can update the roster without replacing any worker links.
        if(body.workerAssignments!==undefined){
          if(!Array.isArray(body.workerAssignments)||body.workerAssignments.length>10000)throw workError(400,'요양보호사 매칭 목록을 확인해 주세요.');
          const seen=new Set(),workers=body.workerAssignments.length?(await q('SELECT id,worker_name,worker_birth_date FROM employment_contracts',[])).rows:[],byId=new Map(workers.map(row=>[row.id,row]));
          for(const assignment of body.workerAssignments){
            if(!assignment||!ids.includes(assignment.recipientId)||seen.has(assignment.recipientId)||!Array.isArray(assignment.workers)||assignment.workers.length>30)throw workError(400,'이 달에 선택한 수급자에게 요양보호사를 연결해 주세요.');
            seen.add(assignment.recipientId);const linked=new Set(),payload=[];
            for(const item of assignment.workers){
              const worker=item&&byId.get(item.workerId);
              if(!worker||!['방문','가족'].includes(item.serviceType)||linked.has(item.workerId))throw workError(400,'근로자 명부의 요양보호사와 방문요양·가족요양 구분을 확인해 주세요. 같은 근로자를 중복 연결할 수 없습니다.');
              linked.add(item.workerId);payload.push({workerId:worker.id,workerName:worker.worker_name,birthDate:worker.worker_birth_date||'',serviceType:item.serviceType});
            }
            await q('INSERT INTO recipient_service_workers(month,recipient_id,payload,updated_by,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(month,recipient_id) DO UPDATE SET payload=excluded.payload,updated_by=excluded.updated_by,updated_at=excluded.updated_at RETURNING recipient_id',[month,assignment.recipientId,JSON.stringify(payload),current.me.id,new Date().toISOString()]);
          }
        }
        const saved=(await q('UPDATE recipient_service_months SET recipient_ids=$1,version=version+1,updated_by=$2,updated_at=$3 WHERE month=$4 AND version=$5 RETURNING *',[JSON.stringify(ids),current.me.id,new Date().toISOString(),month,body.version])).rows[0];
        if(!saved)throw workError(409,'목록이 변경되었습니다. 새로고침해 주세요.');
        return result(q,month,saved,rows);
      });
    }
  };
}
