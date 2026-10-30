import { createWorkQueryCache } from '../../shared/work-query-cache.mjs';
import { trafficBoard } from '../../shared/work-traffic.mjs';
export const workCache = createWorkQueryCache();
let identity: string | undefined;
export function useWorkCacheIdentity(next: string) { if(identity !== next) { identity=next; workCache.clear(); } }
export function invalidateWorkData() { workCache.invalidate(()=>true); }
export function applyWorkMutation(path:string,value:any) {
  const base=path.split('?')[0];
  if(base==='/api/work/service-rounding' && value?.rounding) {
    workCache.update(key=>key===`/api/work/service-month?month=${value.month}`,data=>({...data,rows:data.rows.map((r:any)=>r.id===value.recipientId?{...r,rounding:value.rounding}:r)}));
    if(value.task)applyWorkMutation(`/api/work/tasks/${value.task.id}`,value.task);
    return;
  }
  if(base==='/api/work/service-month' && value?.month) {
    workCache.update(key=>key===`/api/work/service-month?month=${value.month}`,()=>value);
    return;
  }
  if(base.includes('/recurrences') && value?.rule?.id) {
    workCache.update(key=>key==='/api/work/recurrences',data=>({...data,rules:[...data.rules.filter((r:any)=>r.id!==value.rule.id),value.rule]}));
    workCache.invalidate(key=>key.includes('/tasks?')||key.includes('/calendar?'));
    return;
  }
  if(base.includes('/categories') && value?.id) {
    workCache.update(key=>key==='/api/work/categories',data=>({...data,categories:[...data.categories.filter((r:any)=>r.id!==value.id),value]}));
    workCache.invalidate(key=>key.includes('/context'));
    return;
  }
  if(base.startsWith('/api/work/task-maps') && value?.id) {
    const run=Boolean(value.templateId);
    workCache.update(key=>key.startsWith('/api/work/task-maps?'),data=>{
      const field=run?'runs':'templates';
      const next={...data,[field]:[...data[field].filter((row:any)=>row.id!==value.id),value]};
      return {...next,nodes:trafficBoard(next.templates,next.runs,next.month ?? next.today.slice(0,7),next.today)};
    });
    if(run && base.endsWith('/check')) workCache.invalidate(key=>key.startsWith('/api/work/day?')||key.startsWith('/api/work/calendar?'));
    return;
  }
  if(base.startsWith('/api/work/tasks') && value?.id && value?.status) {
    workCache.update(key=>key.startsWith('/api/work/service-month?'),data=>({...data,rows:data.rows.map((row:any)=>row.rounding?.taskId===value.id?{...row,rounding:{...row.rounding,taskVersion:value.version,assigneeId:value.assigneeId||'',status:value.status==='done'?'visited':row.rounding.status==='visited'?'coordinating':row.rounding.status}}:row)}));
    workCache.update(key=>key.startsWith('/api/work/tasks?'),(rows,key)=>{
      const params=new URLSearchParams(key.split('?')[1]);const status=params.get('status'),owner=params.get('assignee');
      const matches=(!status||status==='all'||status===value.status)&&(!owner||owner==='all'||(owner==='unassigned'?!value.assigneeId:owner===value.assigneeId));
      return [...rows.filter((row:any)=>row.id!==value.id),...(matches?[value]:[])];
    });
    workCache.invalidate(key=>key.startsWith('/api/work/calendar?')||key.startsWith('/api/work/day?')||key.includes('/history'));
    return;
  }
  if((base.includes('/plans') || base.includes('/executions')) && value?.id && value?.date) {
    const execution='content' in value;
    workCache.update(key=>key.startsWith('/api/work/day?'),data=>{
      const matches=data.date===value.date && (data.assignee==='all'||data.assignee===value.assigneeId);
      const field=execution?'executions':'plans';
      const next={...data,[field]:[...data[field].filter((row:any)=>row.id!==value.id),...(matches?[value]:[])]};
      if(execution) next.linkedExecutions=[...(data.linkedExecutions ?? []).filter((row:any)=>row.id!==value.id),...(value.status==='recorded'&&value.planId&&data.plans.some((p:any)=>p.id===value.planId)?[value]:[])];
      return next;
    });
    workCache.invalidate(key=>key.includes('/calendar?')||key.includes('/history'));
    return;
  }
  // Copay data has its own monthly snapshot and does not change task/calendar data.
  if(base.startsWith('/api/work/copay'))return;
  // Related records are revalidated; never fabricate a successful write.
  workCache.invalidate(key=>base.includes('/recurrences')?key.includes('/recurrences')||key.includes('/tasks?')||key.includes('/calendar?'):base.includes('/categories')?key.includes('/categories')||key.includes('/context'):key.includes('/day?')||key.includes('/calendar?')||key.includes('/history')||key.startsWith(base));
}
