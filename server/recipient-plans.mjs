import {executionPlans,regularRequirement,normalizePlanSchedule,planContext} from './care-plan-schedule.mjs';
import { randomUUID } from 'node:crypto';
export const planFields = ['medicalHistory','caregiverRequirements','familyNotes','hospitalNotes','servicePlanNotes'];
export const planToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const legacyPlanNotes = recipient => Object.fromEntries(planFields.map(key=>[key,recipient[key] ?? '']));
export const planFromRow = row => ({ id:row.id, version:Number(row.revision), notes:typeof row.payload==='string'?JSON.parse(row.payload):row.payload,
  effectiveDate:row.effective_date, changeReason:row.change_reason, changeKind:row.change_kind, sourceVersion:row.source_revision,
  authorName:row.author_name, createdAt:row.created_at, planId:row.plan_id||row.id, schedule:row.schedule?(typeof row.schedule==='string'?JSON.parse(row.schedule):row.schedule):null });
export function buildPlanState(recipient, versions, today=planToday(), recognitionPeriods=[]) {
  const ordered=[...versions].sort((a,b)=>b.version-a.version);
  const plans=executionPlans(ordered,today);
  const executionCurrent=[...plans].reverse().find(p=>p.active)??null;
  const latestIds=new Set(plans.map(p=>p.id));
  const reference=ordered.filter(p=>(!p.schedule||latestIds.has(p.id))&&p.effectiveDate&&p.effectiveDate<=today&&(!p.schedule||p.schedule.status==='completed')).sort((a,b)=>b.effectiveDate.localeCompare(a.effectiveDate)||b.version-a.version)[0]??null;
  const current=executionCurrent??reference;
  return {context:planContext(recipient,recognitionPeriods),plans,executionCurrent,regularRequirement:regularRequirement(recipient,plans,today),nextEffectiveDate:ordered.filter(p=>(!p.schedule||p.schedule.status==='completed')&&p.effectiveDate>today&&(!p.schedule||latestIds.has(p.id))).map(p=>p.effectiveDate).sort()[0]??null,version:ordered[0]?.version??0,current,latest:ordered[0]??null,history:ordered,legacyNotes:legacyPlanNotes(recipient)};
}
export function attachRecipientPlan(recipient, rows, today=planToday()) {
  const state=buildPlanState(recipient,rows.map(planFromRow),today);
  const meta=p=>p?{id:p.id,planId:p.planId,version:p.version,effectiveDate:p.effectiveDate,authorName:p.authorName,schedule:p.schedule??null,executionEndDate:p.executionEndDate??null,executionStatus:p.executionStatus??'기간 확인 필요'}:null;
  return {...recipient,...(state.current?.notes??{}),planSummary:{version:state.version,current:meta(state.current),nextEffectiveDate:state.nextEffectiveDate,executionCurrent:meta(state.executionCurrent),regularRequirement:state.regularRequirement,plans:state.plans.map(p=>({...meta(p),deadlineStatus:p.deadlineStatus}))}};
}
export function preparePlanVersions(body, recipient, versions, user, today=planToday()) {
  const state=buildPlanState(recipient,versions,today);
  if(!Number.isInteger(body?.version)||body.version!==state.version)throw Object.assign(new Error('다른 사용자가 계획을 변경했습니다. 최신 계획을 다시 불러와 주세요.'),{status:409});
  if(!body.notes || typeof body.notes!=='object' || Array.isArray(body.notes))throw Object.assign(new Error('계획 내용을 확인해 주세요.'),{status:400});
  const notes={};
  for(const key of planFields){if(typeof body.notes[key]!=='string'||body.notes[key].length>5000)throw Object.assign(new Error('각 메모는 5,000자 이내로 입력해 주세요.'),{status:400});notes[key]=body.notes[key].trim();}
  const date=body.effectiveDate;
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<'1000-01-01'||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Object.assign(new Error('계획 적용일을 올바르게 입력해 주세요.'),{status:400});
  if(!['change','correction','progress'].includes(body.changeKind)||typeof body.changeReason!=='string'||!body.changeReason.trim()||body.changeReason.length>1000)throw Object.assign(new Error('변경 구분과 사유를 입력해 주세요.'),{status:400});
  if(!user?.id||!user?.name)throw Object.assign(new Error('작성자를 확인할 수 없습니다. 다시 로그인해 주세요.'),{status:401});
  let sourceVersion=null,source=null;
  if(body.changeKind==='correction'||body.changeKind==='progress'){
    source=versions.find(v=>v.version===body.sourceVersion&&v.changeKind!=='legacy');
    if(!source||source.effectiveDate!==date)throw Object.assign(new Error('수정할 계획을 선택하고 기존 시작일을 유지해 주세요.'),{status:400});
    if(source.schedule&&versions.some(p=>(p.planId||p.id)===(source.planId||source.id)&&p.version>source.version))throw Object.assign(new Error('이 계획에 더 최신 기록이 있습니다. 최신 계획을 다시 불러와 주세요.'),{status:409});
    sourceVersion=source.version;
  }
  const schedule=(body.schedule||body.changeKind!=='correction'||source?.schedule)?normalizePlanSchedule(body,recipient,versions,source,today):null;
  const last=state.latest;
  if(last&&last.effectiveDate===date&&planFields.every(k=>last.notes[k]===notes[k])&&JSON.stringify(last.schedule??null)===JSON.stringify(schedule))return [];
  const now=new Date().toISOString(), next=[];
  if(!versions.length&&Object.values(state.legacyNotes).some(Boolean))next.push({id:randomUUID(),version:1,notes:state.legacyNotes,effectiveDate:null,changeReason:'계획 관리 시작 전 입력 정보 보관',changeKind:'legacy',sourceVersion:null,authorName:'작성자 기록 없음',authorId:null,createdAt:now,planId:null,schedule:null});
  next.push({id:randomUUID(),version:state.version+next.length+1,notes,effectiveDate:date,changeReason:body.changeReason.trim(),changeKind:body.changeKind,sourceVersion,authorName:user.name,authorId:user.id,createdAt:now,planId:source?.planId||source?.id||randomUUID(),schedule});
  return next;
}
export async function handleRecipientPlans(request,response,sendJson,store,user) {
  const match=/^\/api\/recipients\/([^/]+)\/plan$/.exec(new URL(request.url??'/','http://localhost').pathname);
  if(!match)return false;
  response.setHeader('Cache-Control','private, no-store');
  try{
    const id=decodeURIComponent(match[1]);
    if(request.method==='GET')sendJson(response,200,await store.get(id));
    else if(request.method==='PUT'){
      let raw='';for await(const chunk of request){raw+=chunk.toString();if(Buffer.byteLength(raw)>150000)throw Object.assign(new Error('입력 내용이 너무 큽니다.'),{status:413});}
      let body;try{body=JSON.parse(raw);}catch{throw Object.assign(new Error('입력 내용을 확인해 주세요.'),{status:400});}
      sendJson(response,200,await store.save(id,body,user));
    }else sendJson(response,405,{error:'지원하지 않는 요청입니다.'});
  }catch(error){const status=[400,401,404,409,413].includes(error.status)?error.status:500;sendJson(response,status,{error:status===500?'계획을 저장하거나 불러오지 못했습니다.':error.message});}
  return true;
}

export function guardProfilePlanFields(body, existing) {
  if(!existing?.planSummary?.version)return;
  for(const key of ['medicalHistory','caregiverRequirements']) {
    if(body[key]!==undefined && (typeof body[key]!=='string'||body[key].trim()!==(existing[key]??'').trim()))throw Object.assign(new Error('병력과 구인조건은 계획 보기에서 변경해 주세요. 이전 계획을 이력으로 보관합니다.'),{status:400});
  }
}
