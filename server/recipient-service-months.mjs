import {workError} from './work-tasks.mjs';
import {roundingValue} from './recipient-service-rounding.mjs';
import {visitAssigneeIds} from '../shared/work-visits.mjs';
const validMonth=value=>typeof value==='string' && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
export function createRecipientServiceMonthStore(transaction) {
  const people=async q=>(await q('SELECT id,name,operational_name,service_start_date,service_end_date,enabled,is_draft FROM recipients ORDER BY name,id',[])).rows;
  async function result(q,month,row,rows) {
    const ids=new Set(row?JSON.parse(row.recipient_ids):[]);
    const rounding=(await q('SELECT * FROM recipient_service_rounding WHERE month=$1',[month])).rows;
    const tasks=(await q('SELECT v.recipient_id,t.* FROM work_visit_tasks v JOIN work_tasks t ON t.id=v.task_id WHERE v.month=$1',[month])).rows;
    const assignees=(await q('SELECT id,name FROM work_assignees ORDER BY sort_order',[])).rows.filter(a=>visitAssigneeIds.includes(a.id));
    return {month,assignees,version:Number(row?.version ?? 0),updatedAt:row?.updated_at ?? null,rows:rows.map(r=>({id:r.id,name:r.name,operationalName:r.operational_name||'',serviceStartDate:r.service_start_date||'',serviceEndDate:r.service_end_date||'',enabled:Boolean(r.enabled),isDraft:Boolean(r.is_draft),checked:ids.has(r.id),rounding:roundingValue(rounding.find(item=>item.recipient_id===r.id),tasks.find(item=>item.recipient_id===r.id))}))};
  }
  return {
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
        const saved=(await q('UPDATE recipient_service_months SET recipient_ids=$1,version=version+1,updated_by=$2,updated_at=$3 WHERE month=$4 AND version=$5 RETURNING *',[JSON.stringify(ids),current.me.id,new Date().toISOString(),month,body.version])).rows[0];
        if(!saved)throw workError(409,'목록이 변경되었습니다. 새로고침해 주세요.');
        return result(q,month,saved,rows);
      });
    }
  };
}
