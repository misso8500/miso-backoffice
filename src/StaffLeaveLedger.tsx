import { useEffect, useRef, useState } from 'react';
import { requestJson } from './storage';
import { recurrenceToday } from '../shared/work-recurrence.mjs';
import type { StaffProfile, LeaveLedger, LeavePlan } from './lib/staff-records';
import { LeaveLedgerPaper, LeavePaper, downloadStaffPaper, printStaffPaper } from './StaffRecordPrint';

const blank = (year = recurrenceToday().slice(0,4)): LeavePlan => ({ dates:[{date:year===recurrenceToday().slice(0,4)?recurrenceToday():year+'-01-01',days:1}],leaveReason:'',contact:'',substitute:'',applicationDate:recurrenceToday(),status:'draft',version:0 });
const stateName={draft:'초안',confirmed:'계획 확정',used:'사용 완료',cancelled:'취소'};
export default function StaffLeaveLedger({profile,onDirty,onBusy}:{profile:StaffProfile;onDirty:(value:boolean)=>void;onBusy:(value:boolean)=>void}) {
  const [year,setYear]=useState(recurrenceToday().slice(0,4)),[ledger,setLedger]=useState<LeaveLedger|null>(null),[plan,setPlan]=useState<LeavePlan>(()=>blank()),[grant,setGrant]=useState(0),[opening,setOpening]=useState(0);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[dirty,setDirty]=useState(false),[preview,setPreview]=useState(false);
  const [accountDirty,setAccountDirty]=useState(false);
  const lock=useRef(false),generation=useRef(0);
  useEffect(()=>{onDirty(dirty||accountDirty);return()=>onDirty(false);},[dirty,accountDirty,onDirty]);useEffect(()=>{onBusy(busy);return()=>onBusy(false);},[busy,onBusy]);
  const recordRequest=<T,>(path:string,options?:RequestInit)=>requestJson<T>(path+'?staffId='+encodeURIComponent(profile.staffId),options);
  async function load(reset=false){const run=++generation.current;setError('');try{const value=await recordRequest<LeaveLedger>(`/api/work/records/leave/${year}`);if(run===generation.current){setLedger(value);if(reset||!accountDirty){setGrant(value.account.granted);setOpening(value.account.opening_used);}if(reset){setPlan(value.plans.find(row=>row.id===plan.id)??blank(year));setDirty(false);setAccountDirty(false);setPreview(false);setNotice('연차대장을 다시 불러왔습니다.');}}}catch(cause){if(run===generation.current)setError(cause instanceof Error?cause.message:'불러오지 못했습니다.');}}
  useEffect(()=>{setLedger(null);setPlan(blank(year));setDirty(false);void load();return()=>{generation.current++;};},[year]);
  async function act(action:()=>Promise<void>,clearPlan=true){if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await action();await load();if(clearPlan)setDirty(false);}catch(cause){setError(cause instanceof Error?cause.message:'저장하지 못했습니다.');}finally{lock.current=false;setBusy(false);}}
  async function reload(){if(lock.current)return;if((dirty||accountDirty)&&!window.confirm('입력 내용을 버리고 다시 불러올까요?'))return;lock.current=true;setBusy(true);setNotice('');try{await load(true);}finally{lock.current=false;setBusy(false);}}
  async function savePlan(status:LeavePlan['status'],reason=''){await act(async()=>{const saved=await recordRequest<LeavePlan>(`/api/work/records/leave-plans${plan.id?`/${plan.id}`:''}`,{method:plan.id?'PUT':'POST',body:JSON.stringify({...plan,status,reason})});setPlan(saved);setNotice('연차 계획을 저장했습니다.');});}
  const filePath=plan.id? `/api/work/records/leave-plans/${encodeURIComponent(plan.id)}/signed-file` : '';
  async function uploadSignedFile(file:File) {
    await act(async()=>{
      if(file.size>2097152)throw new Error('2MB 이하의 PDF, PNG 또는 JPEG 파일을 선택해 주세요.');
      const bytes=new Uint8Array(await file.arrayBuffer());
      let binary='';
      for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
      const saved=await recordRequest<LeavePlan>(filePath,{method:'PUT',body:JSON.stringify({name:file.name,mime:file.type,data:btoa(binary),version:plan.version})});
      setPlan(saved);setNotice('서명본을 저장했습니다.');
    },false);
  }
  async function downloadSignedFile() {
    setError('');
    try {
      const file=await recordRequest<{name:string;mime:string;data:string}>(filePath);
      const bytes=Uint8Array.from(atob(file.data),character=>character.charCodeAt(0));
      const url=URL.createObjectURL(new Blob([bytes],{type:file.mime}));
      const link=document.createElement('a');link.href=url;link.download=file.name;link.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(cause){setError(cause instanceof Error?cause.message:'서명본을 불러오지 못했습니다.');}
  }
  const today=recurrenceToday();
  const hiredOn=profile.employment?.hiredOn;
  const tenure=hiredOn&&hiredOn<=today ? Number(today.slice(0,4))-Number(hiredOn.slice(0,4))+(today.slice(5)>=hiredOn.slice(5)?1:0) : null;
  const editable=plan.status==='draft';
  return <section className="staff-leave"><div className="staff-toolbar"><label>연도<input aria-label="연차 조회 연도" type="number" min={1000} max={9999} defaultValue={year} key={year} disabled={busy} onBlur={event=>{if(event.target.value.length===4&&(!(dirty||accountDirty)||window.confirm('저장하지 않은 입력을 닫을까요?'))){setAccountDirty(false);setYear(event.target.value);}else event.target.value=year;}}/></label><button type="button" className="secondary-button" disabled={busy} onClick={()=>void reload()}>다시 불러오기</button><button type="button" className="primary-button" disabled={!ledger||busy||dirty||accountDirty} onClick={()=>ledger&&printStaffPaper(<LeaveLedgerPaper ledger={ledger} year={year} profile={profile}/>)}>연차대장 인쇄</button></div>
    {error&&<p role="alert" className="work-day-error">{error} 입력 내용은 유지됩니다.</p>}{notice&&<p role="status" className="work-notice">{notice}</p>}
    {ledger&&<><div className="staff-card">
      <strong>{profile.name}</strong> · {tenure? `${tenure}년차` : '근속연차 확인 필요'}{hiredOn&&` · 입사 ${hiredOn}`}
      {ledger.automatic&&<p className="staff-help">회계연도 자동 산정 {ledger.automatic.granted}일{ledger.override?' · 직접 등록값 적용 중':''}{ledger.automatic.incomplete?' · 확정 근태가 부족한 기간은 산정 대기 중':''}</p>}
    </div><div className="staff-metrics">{[['부여',ledger.totals.granted],['사용',ledger.totals.used],['잔여',ledger.totals.remaining],['사용 예정',ledger.totals.planned],['가용',ledger.totals.available]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}일</strong></div>)}</div>
    {ledger.account.version===0&&!ledger.automatic&&<p className="staff-warning">{year}년 부여 일수가 아직 등록되지 않았습니다. 연차를 포함한 월 기록이나 계획을 확정하기 전에 아래에서 부여 일수를 저장해 주세요.</p>}
    <details className="staff-card" open={ledger.account.version===0&&!ledger.automatic?true:undefined}><summary>연차 일수 직접 등록</summary><p className="staff-help">직접 등록한 부여 일수를 우선 적용합니다. 기존 사용분에는 이 시스템에 별도로 등록하지 않은 사용분만 입력하세요.</p><form onSubmit={event=>{event.preventDefault();void act(async()=>{await recordRequest(`/api/work/records/leave/${year}/account`,{method:'PUT',body:JSON.stringify({granted:grant,openingUsed:opening,version:ledger.account.version})});setAccountDirty(false);setNotice('연차 일수를 저장했습니다.');},false);}}><fieldset disabled={busy} className="staff-toolbar"><label>부여 일수<input required type="number" min={0} max={366} step={0.5} value={grant} onChange={event=>{setGrant(Number(event.target.value));setAccountDirty(true);}}/></label><label>기존 사용분<input required type="number" min={0} max={366} step={0.5} value={opening} onChange={event=>{setOpening(Number(event.target.value));setAccountDirty(true);}}/></label><button className="primary-button" type="submit">일수 저장</button><button type="button" className="secondary-button" onClick={()=>{setGrant(ledger.account.granted);setOpening(ledger.account.opening_used);setAccountDirty(false);}}>일수 입력 취소</button></fieldset></form></details>
    <div className="staff-workspace"><section className="staff-card"><div className="section-title-row"><h3>연차 계획 목록</h3><button className="secondary-button" type="button" disabled={busy} onClick={()=>{if(!dirty||window.confirm('현재 입력을 닫고 새 계획을 작성할까요?')){setPlan(blank(year));setDirty(false);setPreview(false);}}}>새 계획</button></div><p className="staff-help">계획 확정은 연차를 예약합니다. 사용 완료 또는 확정 출근부의 연차는 실제 사용으로 집계합니다.</p>{ledger.plans.length>0?<div className="staff-table-scroll"><table className="staff-month-table">
    <thead><tr><th>회차</th><th>연차 날짜</th><th>일수</th><th>계획 확정</th><th>사용 완료</th><th>서명본</th></tr></thead>
    <tbody>{[...ledger.plans].sort((a,b)=>a.dates[0].date.localeCompare(b.dates[0].date)||String(a.id).localeCompare(String(b.id))).map((row,index)=><tr key={row.id} className={row.id===plan.id?'is-selected':''}>
      <td><button type="button" disabled={busy} onClick={()=>{if(!dirty||window.confirm('현재 입력을 닫고 다른 회차를 볼까요?')){setPlan(row);setDirty(false);setPreview(true);}}}>{index+1}회차 열기</button></td>
      <td>{row.dates.map(date=>date.date).join(', ')}</td><td>{row.dates.reduce((sum,date)=>sum+date.days,0)}일</td>
      <td>{row.status==='confirmed'||row.status==='used'?'완료':stateName[row.status]}</td><td>{row.status==='used'||row.status==='confirmed'&&row.dates.every(date=>ledger.attendanceUses?.some(use=>use.date===date.date&&use.days>=date.days))?'완료':'—'}</td><td>{row.signedFile?(row.signedFile.previous?'이전 서명본':'첨부됨'):'—'}</td>
    </tr>)}</tbody>
  </table></div>:<p>등록한 연차 계획이 없습니다.</p>}{Boolean(ledger.attendanceUses?.length)&&<><h3>출근부에서 확정한 연차</h3>{ledger.attendanceUses?.map(value=><button type="button" key={value.date} className="staff-leave-row" disabled={busy} onClick={()=>{if(dirty&&!window.confirm('현재 입력을 닫고 서류를 작성할까요?'))return;const existing=ledger.plans.find(row=>row.status!=='cancelled'&&row.dates.some(date=>date.date===value.date));setPlan(existing??{...blank(year),dates:[value]});setDirty(false);setPreview(false);}}><strong>{value.date} · {value.days}일</strong><span>사용계획서 작성·확인</span></button>)}</>}</section>
    <section className="staff-card"><h3>연차사용계획서</h3><form onSubmit={event=>{event.preventDefault();void savePlan('draft');}}><fieldset disabled={busy||!editable}>
      {plan.dates.map((date,index)=><div className="staff-toolbar" key={index}><label>연차 날짜<input required type="date" min={`${year}-01-01`} max={`${year}-12-31`} value={date.date} onChange={event=>{setPlan({...plan,dates:plan.dates.map((row,i)=>i===index?{...row,date:event.target.value}:row)});setDirty(true);}}/></label><label>사용 일수<select value={date.days} onChange={event=>{setPlan({...plan,dates:plan.dates.map((row,i)=>i===index?{...row,days:Number(event.target.value)}:row)});setDirty(true);}}><option value={1}>1일</option><option value={0.5}>0.5일</option></select></label>{plan.dates.length>1&&<button className="secondary-button" type="button" onClick={()=>{setPlan({...plan,dates:plan.dates.filter((_,i)=>i!==index)});setDirty(true);}}>날짜 삭제</button>}</div>)}
      <button type="button" className="secondary-button" onClick={()=>{setPlan({...plan,dates:[...plan.dates,{date:`${year}-01-01`,days:1}]});setDirty(true);}}>날짜 추가</button>
      {([['leaveReason','휴가 사유'],['contact','비상 연락처'],['substitute','업무 대행자']] as const).map(([key,label])=><label key={key}>{label}<input value={plan[key]} maxLength={key==='leaveReason'?1000:100} onChange={event=>{setPlan({...plan,[key]:event.target.value});setDirty(true);}}/></label>)}<label>신청일<input required type="date" value={plan.applicationDate} onChange={event=>{setPlan({...plan,applicationDate:event.target.value});setDirty(true);}}/></label>
    </fieldset><div className="staff-toolbar">{editable?<><button type="submit" className="secondary-button" disabled={busy}>초안 저장</button><button type="button" className="primary-button" disabled={busy} onClick={()=>void savePlan('confirmed')}>계획 확정</button></>:<><button type="button" className="secondary-button" disabled={busy} onClick={()=>{const reason=window.prompt('다시 수정하는 사유를 입력해 주세요.');if(reason?.trim())void savePlan('draft',reason);}}>수정 사유 남기고 다시 열기</button>{plan.status==='confirmed'&&<button type="button" className="primary-button" disabled={busy||plan.dates.some(row=>row.date>recurrenceToday())} onClick={()=>void savePlan('used')}>사용 완료</button>}{plan.status!=='cancelled'&&<button type="button" className="danger-button" disabled={busy} onClick={()=>{if(window.confirm('연차 계획을 취소할까요? 확정 출근부의 사용 기록은 별도로 정정해야 합니다.'))void savePlan('cancelled');}}>계획 취소</button>}</>}
    <button type="button" className="secondary-button" disabled={busy||dirty||!['confirmed','used'].includes(plan.status)} onClick={()=>printStaffPaper(<LeavePaper plan={plan}/>)}>확정 서류 인쇄</button><button type="button" className="secondary-button" onClick={()=>setPreview(!preview)}>서식 미리보기</button></div></form>{plan.id&&<div className="staff-toolbar">
      {['confirmed','used'].includes(plan.status)&&<label>서명본 첨부 <small>PDF·PNG·JPEG, 2MB 이하</small><input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void uploadSignedFile(file);event.target.value='';}}/></label>}
      {['confirmed','used'].includes(plan.status)&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void downloadStaffPaper(<LeavePaper plan={plan}/>,`${plan.dates[0].date} ${profile.name} 연차사용계획서`)}>계획서 파일 다운로드</button>}
      {plan.signedFile&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void downloadSignedFile()}>{plan.signedFile.previous?'이전 ':''}서명본 다운로드 · {plan.signedFile.name}</button>}
    </div>}{preview&&<div className="staff-paper-preview"><LeavePaper plan={{...plan,profile:plan.profile??profile}}/></div>}</section></div></>}
  </section>;
}
