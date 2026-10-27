import {useState} from 'react';
import {workToday} from './lib/work-tasks';

export type ServicePause={id:string;recipientId:string;startDate:string;expectedReturnDate:string|null;reason:string;returnedDate:string|null;version:number};
export default function ServicePauseControls({name,pause,last,disabled,canChange,onSave}:{name:string;pause:ServicePause|null;last:ServicePause|null;disabled:boolean;canChange:boolean;onSave:(action:'pause'|'resume',body:Record<string,unknown>)=>Promise<boolean>}){
 const [open,setOpen]=useState(false),[start,setStart]=useState(workToday()),[expected,setExpected]=useState(''),[reason,setReason]=useState(''),[returned,setReturned]=useState(workToday());
 const late=Boolean(pause?.expectedReturnDate&&pause.expectedReturnDate<workToday());
 return <div className="work-service-pause">
  {pause?<div className="work-service-pause-note"><strong>현재 서비스 일시정지</strong><small>정지일 {pause.startDate} · 사유 {pause.reason}</small><small className={late||!pause.expectedReturnDate?'work-visit-attention':''}>{!pause.expectedReturnDate?'복귀일 미정 · 확인 필요':late?`복귀 예정일 경과 (${pause.expectedReturnDate}) · 확인 필요`:`복귀 예정 ${pause.expectedReturnDate}`}</small></div>:last?.returnedDate?<small>최근 복귀 {last.returnedDate} · 정지 사유 {last.reason}</small>:null}
  {canChange&&<button type="button" className="secondary-button" disabled={disabled} onClick={()=>setOpen(value=>!value)} aria-expanded={open}>{open?'입력 닫기':pause?'복귀 처리':'서비스 일시정지'}</button>}
  {open&&canChange&&<form aria-label={`${name} ${pause?'복귀':'일시정지'} 입력`} onSubmit={async event=>{event.preventDefault();const saved=await onSave(pause?'resume':'pause',pause?{pauseId:pause.id,version:pause.version,returnedDate:returned}:{startDate:start,expectedReturnDate:expected||null,reason});if(saved)setOpen(false);}}><fieldset disabled={disabled}>{pause?<label>실제 복귀일<input aria-label={`${name} 실제 복귀일`} required type="date" min={pause.startDate} max={workToday()} value={returned} onChange={event=>setReturned(event.target.value)}/></label>:<><label>정지 시작일<input aria-label={`${name} 정지 시작일`} required type="date" max={workToday()} value={start} onChange={event=>setStart(event.target.value)}/></label><label>정지 사유<textarea aria-label={`${name} 정지 사유`} required maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)}/></label><label>복귀 예정일 (미정이면 비워두기)<input aria-label={`${name} 복귀 예정일`} type="date" min={start} value={expected} onChange={event=>setExpected(event.target.value)}/></label></>}
   <p>예정일만으로 자동 복귀하지 않습니다. 실제 복귀를 처리하면 같은 달의 미완료 라운딩을 재개합니다.</p><button type="submit" className="primary-button">{pause?'복귀 확정':'일시정지 등록'}</button>
  </fieldset></form>}
 </div>;
}
