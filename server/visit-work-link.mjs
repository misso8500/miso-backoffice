import {newWorkId} from './work-tasks.mjs';
import {journalEvent} from './work-journal.mjs';

export const visitDesignId='system:social-worker-visits';
export const visitDesignTitle='사회복지사 방문 업무';
export async function syncVisitPlan(q,{task,payload,date,assignee,start,end,actor,now,active}) {
 let old=payload.planId?(await q(`SELECT * FROM work_plans WHERE id=$1${q.forUpdate??''}`,[payload.planId])).rows[0]:null;
 if(!active){if(old?.status==='planned'){const cancelled=(await q("UPDATE work_plans SET status='cancelled',version=version+1,updated_by=$1,updated_at=$2 WHERE id=$3 RETURNING *",[actor,now,old.id])).rows[0];await journalEvent(q,'plan',cancelled,'cancelled',actor);}return null;}
 const target=(await q("SELECT * FROM work_plans WHERE task_id=$1 AND assignee_id=$2 AND work_date=$3 AND status='planned'",[task.id,assignee,date])).rows[0];
 if(target&&old&&target.id!==old.id){if(old.status==='planned'){const cancelled=(await q("UPDATE work_plans SET status='cancelled',version=version+1,updated_by=$1,updated_at=$2 WHERE id=$3 RETURNING *",[actor,now,old.id])).rows[0];await journalEvent(q,'plan',cancelled,'cancelled',actor);}old=target;}
 else old??=target;
 const period=start&&end?(end<='12:00'?'morning':start>='12:00'?'afternoon':'unknown'):'unknown';
 const snapshot=JSON.stringify({title:task.title,category:'service',related:JSON.parse(task.related),plannedStartTime:start,plannedEndTime:end});
 if(old&&old.status==='planned'&&old.assignee_id===assignee&&old.work_date===date&&old.period===period&&old.snapshot===snapshot){payload.planId=old.id;return old;}
 const row=old?(await q("UPDATE work_plans SET assignee_id=$1,work_date=$2,period=$3,snapshot=$4,status='planned',version=version+1,updated_by=$5,updated_at=$6 WHERE id=$7 RETURNING *",[assignee,date,period,snapshot,actor,now,old.id])).rows[0]:(await q("INSERT INTO work_plans(id,task_id,assignee_id,work_date,period,snapshot,status,version,created_by,updated_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,'planned',1,$7,$7,$8,$8) RETURNING *",[newWorkId(),task.id,assignee,date,period,snapshot,actor,now])).rows[0];
 payload.planId=row.id;await journalEvent(q,'plan',row,old?'updated':'created',actor);return row;
}
export async function syncVisitMap(q,{month,person,task,payload,date,assignee,actor,now,active}) {
 const runId=payload.visitRunId||`visit:${month}:${person.id}`;
 if(!active){await q('DELETE FROM work_map_runs WHERE id=$1',[runId]);delete payload.visitRunId;return;}
 const template={title:visitDesignTitle,kind:'event',category:'service',source:'rounding',createdAt:now,steps:[{id:'visit',title:'수급자 라운딩',guide:'라운딩에서 방문일·담당자·계획 시간대를 관리합니다.'}]};
 await q('INSERT INTO work_map_templates(id,payload,version) VALUES($1,$2,1) ON CONFLICT(id) DO NOTHING RETURNING id',[visitDesignId,JSON.stringify(template)]);
 const related=JSON.parse(task.related),completed=payload.status==='visited';
 const guide=payload.plannedStartTime?`방문 계획 ${payload.plannedStartTime}–${payload.plannedEndTime}`:'방문 계획 시간 미정';
 const run={templateId:visitDesignId,templateVersion:1,source:'rounding',sourceMonth:month,sourceRecipientId:person.id,taskId:task.id,title:visitDesignTitle,kind:'event',category:'service',date,dueDate:date,assigneeId:assignee,related,createdAt:now,steps:[{id:'visit',title:`${person.name} 라운딩`,guide,assigneeId:assignee,dueDate:date,completedAt:completed?task.completed_at:null,completedBy:completed?actor.name:null,completedById:completed?actor.id:null,executionId:completed?payload.executionId:null}]};
 const old=(await q(`SELECT * FROM work_map_runs WHERE id=$1${q.forUpdate??''}`,[runId])).rows[0];
 if(old){const previous=JSON.parse(old.payload);run.createdAt=previous.createdAt;if(completed&&previous.steps[0]?.completedAt){run.steps[0].completedBy=previous.steps[0].completedBy;run.steps[0].completedById=previous.steps[0].completedById;}}
 if(!old||old.payload!==JSON.stringify(run))await q('INSERT INTO work_map_runs(id,run_key,work_date,payload,version) VALUES($1,$2,$3,$4,1) ON CONFLICT(id) DO UPDATE SET work_date=excluded.work_date,payload=excluded.payload,version=work_map_runs.version+1 RETURNING id',[runId,JSON.stringify([visitDesignId,month,[`recipient:${person.id}`]]),date,JSON.stringify(run)]);
 payload.visitRunId=runId;
}
