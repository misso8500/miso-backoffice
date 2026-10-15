import {useEffect,useState} from 'react';
import {Pencil,Trash2,ChevronDown,ChevronUp} from 'lucide-react';
import {loadRecipientPeriodEvents,type RecipientPeriodEvent} from './storage';
import {recognitionPeriods,currentRecognition,recognitionStatus,renewalDate,previousPeriod,institutionStatus} from '../shared/recipient-validity.mjs';
import type {Recipient} from './types';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const range=(start?:string|null,end?:string|null)=>`${start||'시작일 미등록'} ~ ${end||'종료일 미등록'}`;
const eventNames:Record<string,string>={service_renewal:'계약 갱신됨',service_correction:'계약 날짜 정정',recontracted:'재계약',restored:'서비스 재개',deactivated:'비활성화',terminated:'계약 종료 처리',created:'최초 등록'};
function ValidityRow({r,status,open,edit,remove}:{r:Recipient;status:string;open:()=>void;edit:()=>void;remove:()=>void}) {
 const [expanded,setExpanded]=useState(false),[events,setEvents]=useState<RecipientPeriodEvent[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const date=today(),periods=recognitionPeriods(r),recognition=currentRecognition(periods,date),renewal=recognition?renewalDate(recognition.endDate):null;
 const plans=r.planSummary?.plans??[],running=r.planSummary?.executionCurrent,requirement=r.planSummary?.regularRequirement;
 useEffect(()=>{
  if(!expanded)return;let active=true;setBusy(true);setError('');
  void loadRecipientPeriodEvents(r.id).then(data=>{if(active)setEvents(data);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'이력을 불러오지 못했습니다.');}).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[expanded,r.id,r.updatedAt,retry]);
 const contractLabel=institutionStatus(r,date);
 const warn=r.enabled!==false&&(contractLabel==='계약 만료'||Boolean(recognition?.endDate&&recognition.endDate<date));
 return <li className={`validity-person ${expanded?'is-expanded':''}`}>
  <div className={`recipient-row ${warn?'needs-attention':''} ${r.enabled===false?'is-disabled':''}`}>
   <div><button type="button" className="validity-name" onClick={open}>{r.name}</button><small>{r.longTermCareNumber||'인정번호 미등록'}</small></div>
   <span><em className={`contract-status status-${status}`}>{contractLabel}</em>{r.recontractCount>0&&<small>재개·재계약 기록 {r.recontractCount}건</small>}</span>
   <span><strong>{r.serviceStartDate||'시작일 미등록'}</strong><small>~ {r.serviceEndDate||'만료일 미등록'}</small><small>현재 기관 이용계약</small></span>
   <span>{r.careGrade||'등급 미등록'}<small>현재 등록 등급</small></span>
   <span><strong>{recognition?.startDate||'인정기간 미등록'}</strong>{recognition&&<small>~ {recognition.endDate}</small>}<small>{recognitionStatus(recognition,date)}</small></span>
   <span><strong>{renewal||'인정 종료일 필요'}</strong><small>{renewal?(periods.some(p=>recognition&&p.startDate>recognition.startDate)?'후속 인정기간 등록됨':date>=renewal?'갱신 확인 필요':'인정 종료 한 달 전'):'인정기간을 먼저 등록해 주세요'}</small></span>
   <span>{running?<><strong>{running.effectiveDate}</strong><small>~ {running.executionEndDate} · 실행 중</small></>:<strong>{plans.some(p=>p.schedule?.status==='draft')?'작성 중인 계획 있음':'실행 중인 계획 없음'}</strong>}{requirement&&<small className={requirement.deadlinePassed&&requirement.status!=='completed'?'validity-warning':''}>작성·통보 마감 {requirement.deadline}<br/>{requirement.status==='completed'?'완료':requirement.deadlinePassed?'목표 마감 지남':requirement.status==='draft'?'작성 중':'정기 작성 필요'}</small>}</span>
   <div className="row-actions"><button type="button" className="row-icon-button" aria-label={`${r.name} 수정`} onClick={edit}><Pencil size={17}/></button><button type="button" className="row-icon-button is-danger" aria-label={`${r.name} 삭제`} onClick={remove}><Trash2 size={17}/></button></div>
  </div>
  <div className="validity-toggle-row"><button type="button" className="secondary-button" aria-expanded={expanded} aria-controls={`validity-${r.id}`} onClick={()=>setExpanded(v=>!v)}>{expanded?<ChevronUp size={16}/>:<ChevronDown size={16}/>}기간·변경 이력 {expanded?'접기':`보기 · 인정 ${periods.length}건 / 계획 ${plans.length}건`}</button></div>
  {expanded&&<div id={`validity-${r.id}`} className="validity-history">
   <section><h4>장기요양 인정기간별 계획</h4><p className="validity-help">인정기간은 서비스를 이용할 수 있는 자격 기간입니다. 기관 이용계약·계획 실행기간과 구분해서 확인하세요.</p>
    {!periods.length&&<p>등록된 인정기간이 없습니다. 수급자 상세의 인정서류 연결 또는 계획 작성에서 인정기간을 등록해 주세요.</p>}
    {periods.map(p=>{const related=plans.filter(plan=>plan.schedule?.recognitionPeriod?.startDate===p.startDate&&plan.schedule.recognitionPeriod.endDate===p.endDate);return <article key={`${p.startDate}/${p.endDate}`} className="validity-period-card"><header><strong>{range(p.startDate,p.endDate)}</strong><span>{recognitionStatus(p,date)}{p.careGrade?` · 계획 기록 ${p.careGrade}`:''}</span></header><p>갱신예정일 {renewalDate(p.endDate)}</p>{related.length?related.map(plan=><div key={plan.id} className="validity-plan-line"><strong>계획 {range(plan.effectiveDate,plan.executionEndDate)}</strong><span>{plan.executionStatus} · {plan.deadlineStatus}</span><small>기관 이용계약 {range(plan.schedule?.institutionPeriod.startDate,plan.schedule?.institutionPeriod.endDate)}<br/>작성 {plan.schedule?.writtenDate||'미입력'} · 통보 {plan.schedule?.notifiedDate||'미입력'}{plan.schedule?.deadline&&` · 목표 마감 ${plan.schedule.deadline}`}</small></div>):<p>이 인정기간에 연결된 계획이 없습니다.</p>}</article>;})}
    {plans.filter(p=>!p.schedule?.recognitionPeriod).map(p=><article className="validity-period-card" key={p.id}><strong>인정기간 미연결 · 계획 {range(p.effectiveDate,p.executionEndDate)}</strong><p>{p.executionStatus} · {p.deadlineStatus}</p></article>)}
   </section>
   <section><h4>기관 이용계약 변경 이력</h4><p className="validity-help">갱신된 이전 계약은 ‘계약 갱신됨’으로 구분합니다. 날짜 정정은 새로운 계약으로 세지 않습니다.</p>
    {busy&&<p role="status">이력 불러오는 중…</p>}{error&&<><p role="alert" className="form-error">{error}</p><button type="button" className="secondary-button" onClick={()=>setRetry(v=>v+1)}>다시 불러오기</button></>}
    {!busy&&!error&&!events.length&&<p>저장된 변경 이력이 없습니다. 현재 기관 이용계약은 {range(r.serviceStartDate,r.serviceEndDate)}입니다.</p>}
    {!busy&&!error&&events.map(e=>{const before=previousPeriod(e);return <article className="validity-period-card" key={e.id}><header><strong>{eventNames[e.type]||'계약 상태 변경'}</strong><span>{new Date(e.createdAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}</span></header>{(before.startDate||before.endDate)&&<p>변경 전 {range(before.startDate,before.endDate)}</p>}{(e.serviceStartDate||e.serviceEndDate)&&<p>{before.startDate||before.endDate?'변경 후':'기록된 이용기간'} {range(e.serviceStartDate,e.serviceEndDate)}</p>}{e.type==='terminated'&&<p>계약 종료일 {e.contractExpiredDate||'기록 없음'}</p>}{e.type==='recontracted'&&<small>이전 계약이 끝난 뒤 새로 체결한 계약 기록입니다.</small>}</article>;})}
   </section>
   <button type="button" className="secondary-button" onClick={open}>상세 정보·서류 확인</button>
  </div>}
 </li>;
}
export default function RecipientValidityList({recipients,status,open,edit,remove}:{recipients:Recipient[];status:(r:Recipient)=>string;open:(r:Recipient)=>void;edit:(r:Recipient)=>void;remove:(r:Recipient)=>void}) {
 return <div className="recipient-table recipient-focus-table view-validity"><p className="validity-legend">기관 이용계약 → 장기요양 인정기간 → 급여제공계획 실행기간 순서로 확인합니다. 갱신예정일은 인정 종료일 한 달 전입니다.</p><div className="table-head">{['수급자','계약 상태','기관 이용기간','등급','장기요양 인정기간','갱신예정일','급여제공계획','관리'].map(label=><span key={label}>{label}</span>)}</div><ul>{recipients.map(r=><ValidityRow key={r.id} r={r} status={status(r)} open={()=>open(r)} edit={()=>edit(r)} remove={()=>remove(r)}/>)}</ul></div>;
}
