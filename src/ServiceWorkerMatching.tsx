import {useEffect,useRef,useState} from 'react';
import { Check, Plus, Search, UserRound, X } from 'lucide-react';
export type ServiceWorker={id:string;name:string;birthDate:string;jobTitle:string;profileOnly?:boolean;enabled:boolean;isDraft:boolean;contractStartDate?:string;contractEndDate?:string};
export type WorkerMatch={workerId:string;workerName?:string;birthDate?:string;serviceType:'방문'|'가족'};
export const matchKey=(items:WorkerMatch[])=>JSON.stringify(items.map(({workerId,serviceType})=>({workerId,serviceType})));
type MatchFields = {
 name: string; selected: boolean; value: WorkerMatch[]; workers: ServiceWorker[]; busy: boolean; available: boolean;
 onChange: (value: WorkerMatch[]) => void;
};

const linkedName = (match: WorkerMatch, worker?: ServiceWorker) => worker?.name || match.workerName || '명부 확인 필요';

export function CompactServiceWorkerCell(props: MatchFields) {
 const { name, selected, value, workers, busy, available, onChange } = props;
 const [editing, setEditing] = useState<WorkerMatch[] | null>(null);
 const linked = selected ? value.filter(item => item.workerId) : [];
 const remaining = linked.length - 2;
 return <td>
  <div className="service-assignment-summary">
   <div className="service-assignment-preview">
    {!linked.length && <span className="service-assignment-empty">{selected ? '미연결' : '배정 제외'}</span>}
    {linked.slice(0, 2).map(item => {
     const display = linkedName(item, workers.find(worker => worker.id === item.workerId));
     return <span className="service-assignment-person" key={item.workerId}>
      <strong title={display}>{display}</strong>
      <span className={`service-worker-type ${item.serviceType === '가족' ? 'is-family' : 'is-visit'}`}>{item.serviceType}요양</span>
     </span>;
    })}
    {remaining > 0 && <span className="service-assignment-more service-assignment-more-wide">외 {remaining}명</span>}
    {linked.length > 1 && <span className="service-assignment-more service-assignment-more-narrow">외 {linked.length - 1}명</span>}
   </div>
   {selected && <button type="button" className="secondary-button service-assignment-edit" aria-haspopup="dialog"
    aria-label={`${name} ${linked.length ? '연결 관리' : '요양보호사 연결'}`}
    title={linked.length ? '요양보호사 연결 관리' : '요양보호사 검색'}
    disabled={busy || (!available && !linked.length)}
    onClick={() => setEditing(linked)}><UserRound size={17} fill="currentColor" aria-hidden="true" /></button>}
  </div>
  {editing && <StaffMatchDialog name={name} workers={workers} available={available} busy={busy}
   selected={editing} onChange={setEditing} onClose={() => setEditing(null)} onApply={() => {
    onChange(editing);
    setEditing(null);
   }} />}
 </td>;
}

function StaffMatchDialog({ name, workers, available, busy, selected, onChange, onClose, onApply }: {
 name: string; workers: ServiceWorker[]; available: boolean; busy: boolean; selected: WorkerMatch[];
 onChange: (matches: WorkerMatch[]) => void; onClose: () => void; onApply: () => void;
}) {
 const [query, setQuery] = useState('');
 const dialog = useRef<HTMLDialogElement>(null);
 const search = useRef<HTMLInputElement>(null);
 const selectedIds = new Set(selected.map(item => item.workerId));
 const normalize = (value: string) => value.normalize('NFC').toLowerCase().replace(/[\s-]/g, '');
 const searchTerm = normalize(query);
 const results = workers.filter(worker => !searchTerm ||
  [worker.name, worker.birthDate, worker.jobTitle].some(value => normalize(value || '').includes(searchTerm)));
 useEffect(() => {
  const node = dialog.current;
  if (node && !node.open) node.showModal();
  search.current?.focus();
  return () => { if (node?.open) node.close(); };
 }, []);

 return <dialog ref={dialog} className="service-new-worker-dialog service-assignment-dialog" aria-label={`${name} 직원 검색`}
  onCancel={event => { event.preventDefault(); onClose(); }}>
  <header className="staff-match-dialog-header">
   <div><h2>직원 검색</h2><p>{name} 수급자에게 연결할 직원을 선택하세요.</p></div>
   <button type="button" className="icon-button" aria-label="직원 검색 닫기" onClick={onClose}><X size={18} aria-hidden="true" /></button>
  </header>
  <label className="staff-match-search"><Search size={17} aria-hidden="true" />
   <input ref={search} type="search" aria-label="직원 검색" placeholder="이름·생년월일·직종 검색"
    value={query} onChange={event => setQuery(event.target.value)} />
  </label>
  <ul className="staff-match-results" aria-label="직원 검색 결과">
   {available && results.map(worker => {
    const added = selectedIds.has(worker.id);
    const disabled = busy || added || selected.length >= 30;
    return <li key={worker.id}><button type="button" className="staff-match-result" aria-disabled={disabled} onClick={() => {
     if (!disabled) onChange([...selected, { workerId: worker.id, workerName: worker.name, birthDate: worker.birthDate, serviceType: '방문' }]);
    }}>
     <span><strong>{worker.name}</strong>
      <span className="staff-match-meta">{worker.birthDate || '생년월일 미입력'} · {worker.jobTitle || '직종 미입력'}
       {worker.contractStartDate && ` · 계약 ${worker.contractStartDate} ~ ${worker.contractEndDate || '종료일 미입력'}`}
       {worker.profileOnly && ' · 직원 기초정보'}{worker.isDraft && ' · 정보 입력 중'}{!worker.enabled && ' · 비활성'}</span>
     </span>
     {added ? <span className="staff-match-added"><Check size={15} aria-hidden="true" /> 선택됨</span> : <Plus size={16} aria-hidden="true" />}
    </button></li>;
   })}
   {(!available || !results.length) && <li className="staff-match-no-results">{available ? '검색 결과가 없습니다.' : '직원 명부를 사용할 수 없습니다.'}</li>}
  </ul>
  {selected.length > 0 && <section className="staff-match-selected" aria-label="선택한 직원">
   <h3>선택한 직원 <span>{selected.length}명</span></h3>
   <ul>{selected.map(item => {
    const display = linkedName(item, workers.find(worker => worker.id === item.workerId));
    return <li key={item.workerId}>
     <strong>{display}</strong>
     <select aria-label={`${display} 서비스 구분`} value={item.serviceType} disabled={busy}
      onChange={event => onChange(selected.map(match => match.workerId === item.workerId
       ? { ...match, serviceType: event.target.value as WorkerMatch['serviceType'] } : match))}>
      <option value="방문">방문요양</option><option value="가족">가족요양</option>
     </select>
     <button type="button" className="secondary-button" aria-label={`${display} 연결 해제`} disabled={busy}
      onClick={() => onChange(selected.filter(match => match.workerId !== item.workerId))}>해제</button>
    </li>;
   })}</ul>
  </section>}
  <footer className="service-assignment-dialog-actions">
   <button type="button" className="secondary-button" onClick={onClose}>취소</button>
   <button type="button" className="primary-button" disabled={busy} onClick={onApply}>반영</button>
  </footer>
 </dialog>;
}
