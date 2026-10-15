import { useEffect, useState } from 'react';
import DateInput from './DateInput';
import type { Recipient } from './types';
import { loadRecipientPeriodEvents, updateRecipientServicePeriod, type RecipientPeriodEvent } from './storage';

export default function RecipientServicePeriod({ recipient, onSaved }: { recipient: Recipient; onSaved: (recipient: Recipient) => void }) {
  const [editing,setEditing]=useState(false), [start,setStart]=useState(recipient.serviceStartDate), [end,setEnd]=useState(recipient.serviceEndDate);
  const [reason,setReason]=useState<'renewal'|'correction'>('renewal'), [busy,setBusy]=useState(false), [error,setError]=useState(''), [notice,setNotice]=useState('');
  const [showHistory,setShowHistory]=useState(false), [events,setEvents]=useState<RecipientPeriodEvent[]>([]), [historyError,setHistoryError]=useState('');
  useEffect(()=>{
    if(!showHistory)return;let active=true;
    void loadRecipientPeriodEvents(recipient.id).then(data=>{if(active){setEvents(data.filter(e=>e.type==='service_renewal'||e.type==='service_correction'));setHistoryError('');}}).catch(e=>{if(active)setHistoryError(e.message);});
    return()=>{active=false;};
  },[showHistory,recipient.id,recipient.updatedAt]);
  return <section className="service-period-editor"><div className="section-title-row"><h3>장기요양이용계약 기간</h3><button type="button" className="secondary-button" disabled={busy} onClick={()=>{setEditing(!editing);setStart(recipient.serviceStartDate);setEnd(recipient.serviceEndDate);setError('');setNotice('');}}>{editing?'편집 취소':'계약 기간 수정·갱신'}</button></div>
    {!editing && <p>{recipient.serviceStartDate || '시작일 미등록'} ~ {recipient.serviceEndDate || '만료일 미등록'}</p>}
    {notice && <p role="status">{notice}</p>}
    {editing && <form onInvalidCapture={()=>setError('연도·월·일과 필수 입력을 확인해 주세요.')} onSubmit={async e=>{
      e.preventDefault();setError('');if(start>end){setError('만료일은 시작일과 같거나 이후여야 합니다.');return;}
      setBusy(true);try{const saved=await updateRecipientServicePeriod(recipient.id,{serviceStartDate:start,serviceEndDate:end,reason,updatedAt:recipient.updatedAt});onSaved(saved);setEditing(false);setNotice(start===recipient.serviceStartDate&&end===recipient.serviceEndDate?'변경된 날짜가 없습니다. 기존 기간을 유지했습니다.':'계약 기간을 저장했습니다. 이전 기간은 변경 이력으로 보관했습니다.');}catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');}finally{setBusy(false);}
    }}>
      <p>갱신했다면 새 계약서에 적힌 시작일과 만료일을 함께 입력합니다. 오탈자라면 잘못된 날짜만 고치면 됩니다. 인정서의 유효기간과는 별개입니다.</p>
      <label>변경 사유<select value={reason} disabled={busy} onChange={e=>setReason(e.target.value as 'renewal'|'correction')}><option value="renewal">계약 갱신</option><option value="correction">날짜 정정 (오탈자)</option></select></label>
      <div className="recognition-preview-dates"><label>이용계약 시작일<DateInput required disabled={busy} value={start} onChange={e=>{setStart(e.target.value);setError('');}} /></label><label>이용계약 만료일<DateInput required disabled={busy} value={end} min={/^\d{4}-\d{2}-\d{2}$/.test(start)?start:undefined} onChange={e=>{setEnd(e.target.value);setError('');}} /></label></div>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button type="submit" className="primary-button" disabled={busy}>{busy?'저장 중…':'계약 기간 저장'}</button>
    </form>}
    <button type="button" className="secondary-button" onClick={()=>setShowHistory(!showHistory)}>{showHistory?'변경 이력 접기':'계약 기간 변경 이력 보기'}</button>
    {showHistory&&<div>{historyError&&<p role="alert">{historyError}</p>}{!events.length&&!historyError&&<p>저장된 기간 변경 이력이 없습니다.</p>}{events.map(event=>{
      let previous:{previousStartDate?:string;previousEndDate?:string}={};try{previous=JSON.parse(event.memo||'{}');}catch{/* Legacy event text is not a period snapshot. */}
      return <div className="recognition-preview-history" key={event.id}><strong>{event.type==='service_renewal'?'계약 갱신':'날짜 정정'}</strong><p>변경 전: {previous.previousStartDate||'미등록'} ~ {previous.previousEndDate||'미등록'}<br/>변경 후: {event.serviceStartDate} ~ {event.serviceEndDate}</p><small>{new Date(event.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</small></div>;
    })}</div>}
  </section>;
}
