import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, X } from 'lucide-react';
import DateInput from './DateInput';
import { saveEmploymentDraftRows, saveRecipientDraftRows } from './storage';
import {
  cancelWorkPlan, createWorkPlan, updateWorkTask, workCategoryLabels, workPeriods, workToday,
  type WorkContext, type WorkDay, type WorkPeriod, type WorkPlan, type WorkReference, type WorkTask, type WorkTaskInput
} from './lib/work-tasks';

type Field = 'title' | 'assigneeId' | 'dueDate' | 'category' | 'description' | 'related';
type Props = {
  task: WorkTask; context: WorkContext; date: string; activity: WorkDay | null; disabled: boolean;
  onSaved: (task: WorkTask) => void; onPlansChanged: () => void;
  onReferenceCreated: (reference: WorkReference) => void;
  onBusy: (busy: boolean) => void; onEditing: (editing: boolean) => void;
};
const labels: Record<Field, string> = { title: '업무 제목', assigneeId: '담당자', dueDate: '마감일', category: '분류', description: '상세 내용', related: '수급자·근로자 연결' };
const inputFor = (task: WorkTask): WorkTaskInput => ({ title: task.title, assigneeId: task.assigneeId ?? '', dueDate: task.dueDate ?? '', category: task.category, description: task.description, related: task.related.map(({ id, type }) => ({ id, type })) });
const errorText = (error: unknown) => error instanceof Error ? error.message : '저장하지 못했습니다.';

function ReferencePicker({ task, context, value, onChange, onCreated, onBusy }: {
  task: WorkTask; context: WorkContext; value: WorkTaskInput['related'];
  onChange: (value: WorkTaskInput['related']) => void; onCreated: (reference: WorkReference) => void; onBusy: (busy: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'recipient' | 'worker'>('recipient');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef({ key: '', id: crypto.randomUUID() });
  const lock = useRef(false);
  const candidates = context.references.filter(r => r.type === kind && query.trim() && `${r.name} ${r.info}`.toLowerCase().includes(query.trim().toLowerCase()));
  const references = [...task.related, ...context.references];
  async function create() {
    const name = query.trim(); if (!name || lock.current) return;
    const key = JSON.stringify([kind, name, phone.trim()]);
    if (request.current.key !== key) request.current = { key, id: crypto.randomUUID() };
    lock.current = true; setBusy(true); onBusy(true); setError('');
    try {
      const id = request.current.id;
      if (kind === 'recipient') await saveRecipientDraftRows([{ id, name, phone: phone.trim(), birthDate: '', longTermCareNumber: '', careGrade: '', address: '' }]);
      else await saveEmploymentDraftRows([{ id, workerName: name, workerPhone: phone.trim(), residentRegistrationNumber: '', primaryBank: '', bankAccountNumber: '', contractStartDate: '', contractEndDate: '' }]);
      const reference: WorkReference = { id, type: kind, name, info: '상세 정보 입력 중', isDraft: true };
      onCreated(reference);
      onChange(value.some(link => link.id === id && link.type === kind) ? value : [...value, { id, type: kind }]);
      request.current = { key: '', id: crypto.randomUUID() }; setQuery(''); setPhone('');
    } catch (cause) { setError(errorText(cause)); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  return <>
    <div className="work-reference-search"><select aria-label="연결 대상 종류" value={kind} onChange={event => { setKind(event.target.value as 'recipient' | 'worker'); setError(''); }}><option value="recipient">수급자</option><option value="worker">근로자</option></select><input type="search" aria-label="연결할 수급자·근로자 검색" placeholder="이름 검색 또는 새 이름 입력" value={query} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} onChange={event => { setQuery(event.target.value); setError(''); }}/></div>
    <div className="work-inline-references">{candidates.slice(0, 8).map(r => <label key={`${r.type}:${r.id}`}><input type="checkbox" checked={value.some(link => link.type === r.type && link.id === r.id)} onChange={event => onChange(event.target.checked ? [...value, { id: r.id, type: r.type }] : value.filter(link => link.type !== r.type || link.id !== r.id))}/>{r.name} {r.info}</label>)}</div>
    {query.trim() && !candidates.length && <div className="work-reference-create"><p>검색 결과가 없습니다. 새 {kind === 'recipient' ? '수급자' : '근로자'}를 등록해 연결할 수 있습니다.</p><input aria-label="새 연결 대상 연락처" placeholder="연락처 (선택)" maxLength={30} value={phone} onChange={event => setPhone(event.target.value)}/><button type="button" className="secondary-button" disabled={busy || query.trim().length > 60} onClick={() => void create()}>{busy ? '등록 중…' : `‘${query.trim()}’ 등록 후 연결`}</button><small>명부에 초안으로 저장됩니다. 업무와의 연결은 아래 변경사항 저장으로 확정합니다.</small></div>}
    {error && <p role="alert" className="work-day-error">{error} 입력 내용은 유지됩니다.</p>}
    <div className="work-selected">{value.map(link => <button type="button" key={`${link.type}:${link.id}`} aria-label={`${references.find(r => r.type === link.type && r.id === link.id)?.name ?? '관련자'} 연결 해제`} onClick={() => onChange(value.filter(r => r.type !== link.type || r.id !== link.id))}>{references.find(r => r.type === link.type && r.id === link.id)?.name ?? '기존 연결'} <X size={12}/></button>)}</div>
  </>;
}

export default function WorkTaskDetails({ task, context, date, activity, disabled, onSaved, onPlansChanged, onReferenceCreated, onBusy, onEditing }: Props) {
  const [field, setField] = useState<Field | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [draft, setDraft] = useState(() => inputFor(task));
  const [base, setBase] = useState(task);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [planDate, setPlanDate] = useState(date);
  const [planOwner, setPlanOwner] = useState(task.assigneeId ?? '');
  const [planPeriod, setPlanPeriod] = useState<WorkPeriod>('unknown');
  const [planError, setPlanError] = useState('');
  const [planDirty, setPlanDirty] = useState(false);
  const [extraPlans, setExtraPlans] = useState<WorkPlan[]>([]);
  const lock = useRef(false);
  const request = useRef(crypto.randomUUID());
  const requestKey = useRef('');
  const editor = useRef<HTMLFormElement>(null);
  const errorBox = useRef<HTMLParagraphElement>(null);
  const editable = task.canEdit && task.status !== 'cancelled';
  const blocked = disabled || busy;
  const name = (id: string | null) => context.assignees.find(p => p.id === id)?.name ?? context.members.find(p => p.id === id)?.name ?? (id ? '이전 담당자' : '담당자 미정');
  useEffect(() => { onEditing(Boolean(field) || planDirty); return () => onEditing(false); }, [field, planDirty, onEditing]);
  useEffect(() => { if (field) editor.current?.querySelector<HTMLElement>('[data-field="' + field + '"] input,[data-field="' + field + '"] select,[data-field="' + field + '"] textarea')?.focus(); }, [field]);
  useEffect(() => { if (error) errorBox.current?.focus(); }, [error]);
  useEffect(() => { if (!planDirty) { setPlanDate(date); setPlanOwner(task.assigneeId ?? ''); } }, [date, task.assigneeId, planDirty]);

  function begin(key: Field) {
    if (!field) { setDraft(inputFor(task)); setBase(task); }
    setFields(previous => previous.includes(key) ? previous : [...previous, key]);
    setField(key); setError(''); setNotice('');
  }
  function closeEditor() { setField(null); setFields([]); setError(''); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!field || lock.current || disabled) return;
    lock.current = true; setBusy(true); onBusy(true); setError('');
    try {
      // Keep the version captured when editing began so concurrent changes cannot be overwritten.
      const saved = await updateWorkTask(base.id, draft, base.version);
      onSaved(saved); closeEditor(); setNotice('수정한 내용을 모두 저장했습니다.');
    } catch (cause) { setError(errorText(cause)); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  async function plan(targetDate = planDate) {
    if (lock.current || disabled || !editable || task.status !== 'open') return;
    if (!planOwner) { setPlanError('계획을 수행할 담당자를 선택해 주세요.'); return; }
    const key = `${targetDate}:${planOwner}:${planPeriod}`;
    if (requestKey.current !== key) { requestKey.current = key; request.current = crypto.randomUUID(); }
    lock.current = true; setBusy(true); onBusy(true); setPlanError(''); setNotice('');
    try {
      const saved = await createWorkPlan({ taskId: task.id, assigneeId: planOwner, date: targetDate, period: planPeriod, requestId: request.current });
      setExtraPlans(rows => [...rows.filter(row => row.id !== saved.id), saved]);
      request.current = crypto.randomUUID(); setPlanDirty(false); onPlansChanged();
      setNotice(`${saved.date} · ${name(saved.assigneeId)} 계획에 배치했습니다.`);
    } catch (cause) { setPlanError(errorText(cause)); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  async function removePlan(row: WorkPlan) {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); onBusy(true); setPlanError('');
    try {
      const saved = await cancelWorkPlan(row);
      setExtraPlans(rows => [...rows.filter(p => p.id !== saved.id), saved]); onPlansChanged();
      setNotice('계획을 취소했습니다. 기존 수행 기록은 유지됩니다.');
    } catch (cause) { setPlanError(errorText(cause)); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  const plans = new Map((activity?.plans ?? []).filter(row => row.taskId === task.id).map(row => [row.id, row]));
  for (const row of extraPlans) { const loaded = plans.get(row.id); if (!loaded || loaded.version <= row.version) plans.set(row.id, row); }
  const activePlans = [...plans.values()].filter(row => row.status === 'planned');
  function pencil(key: Field) {
    return editable && <button type="button" className="work-field-pencil" aria-label={`${labels[key]} 수정`} disabled={blocked} onClick={() => begin(key)}><Pencil size={13}/></button>;
  }
  function fieldEditor(key: Field) {
    if (!fields.includes(key)) return null;
    return <div className="work-inline-editor" data-field={key}>
      <fieldset disabled={blocked}>
        {key === 'title' && <input aria-label="업무 제목 수정" required maxLength={500} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })}/>}
        {key === 'description' && <textarea aria-label="상세 내용 수정" maxLength={5000} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })}/>}
        {key === 'assigneeId' && <select aria-label="담당자 수정" value={draft.assigneeId} onChange={event => setDraft({ ...draft, assigneeId: event.target.value })}><option value="">담당자 미정</option>{draft.assigneeId && !context.assignees.some(p => p.id === draft.assigneeId) && <option value={draft.assigneeId}>{name(draft.assigneeId)} (기존)</option>}{context.assignees.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        {key === 'category' && <select aria-label="분류 수정" value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value as WorkTaskInput['category'] })}>{Object.entries(workCategoryLabels).filter(([id]) => !context.categories || context.categories.includes(id)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
        {key === 'dueDate' && <DateInput aria-label="마감일 수정" value={draft.dueDate} onChange={event => setDraft({ ...draft, dueDate: event.target.value })}/>}
        {key === 'related' && <ReferencePicker task={task} context={context} value={draft.related} onChange={related => setDraft(previous => ({ ...previous, related }))} onCreated={onReferenceCreated} onBusy={value => { setBusy(value); onBusy(value); }}/>}

      </fieldset>
    </div>;
  }
  return <>
    <form ref={editor} className="work-detail-edit-form" onSubmit={event => void save(event)}>
    <div className="work-field-title">{fields.includes('title') ? fieldEditor('title') : <><h3>{task.title}</h3>{pencil('title')}</>}</div>
    <dl className="work-detail-fields">
      {(['assigneeId', 'dueDate', 'category'] as const).map(key => <div className="work-detail-field" key={key}><dt>{labels[key]}</dt><dd>{fields.includes(key) ? fieldEditor(key) : <div className="work-field-value"><span>{key === 'assigneeId' ? name(task.assigneeId) : key === 'dueDate' ? task.dueDate || '기한 미정' : workCategoryLabels[task.category]}</span>{pencil(key)}</div>}</dd></div>)}
      <div className="work-detail-field"><dt>요청자</dt><dd>{name(task.requesterId)}</dd></div>
      <div className="work-detail-field"><dt>등록일</dt><dd>{new Date(task.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</dd></div>
      {task.completedAt && <div className="work-detail-field"><dt>완료일</dt><dd>{new Date(task.completedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</dd></div>}
    </dl>
    <section className="work-detail-section"><div className="work-field-value"><h4>상세 내용</h4>{pencil('description')}</div>{fields.includes('description') ? fieldEditor('description') : <p className="work-inline-description">{task.description || '추가된 내용이 없습니다.'}</p>}</section>
    <section className="work-detail-section"><div className="work-field-value"><h4>수급자·근로자 연결</h4>{pencil('related')}</div>{fields.includes('related') ? fieldEditor('related') : <div className="work-linked">{task.related.length ? task.related.map(r => <span key={`${r.type}:${r.id}`}>{r.name}{r.info && <small>{r.info}</small>}</span>) : <small>연결 없음</small>}</div>}</section>
    {field && <div className="work-detail-savebar"><span>수정 중 · {fields.length}개 항목</span><div className="work-inline-buttons"><button type="submit" className="primary-button" disabled={blocked}>{busy ? '저장 중…' : '변경사항 저장'}</button><button type="button" className="secondary-button" disabled={blocked} onClick={closeEditor}>전체 취소</button></div></div>}
    {error && <p ref={errorBox} tabIndex={-1} role="alert" className="work-day-error">{error} 입력 내용은 유지됩니다. 최신 목록을 확인한 뒤 다시 편집해 주세요.</p>}
    </form>
    <section className="work-detail-section" aria-label="할 날짜 지정"><h4>할 날짜</h4>
      {activePlans.map(row => <div className="work-inline-plan" key={row.id}><span>{row.date} · {name(row.assigneeId)}<small>{workPeriods[row.period]}</small></span>{editable && <button type="button" className="work-field-pencil" aria-label={`${row.date} ${name(row.assigneeId)} 계획 취소`} disabled={blocked || Boolean(field)} onClick={() => void removePlan(row)}><X size={13}/></button>}</div>)}
      {!activePlans.length && <p className="work-inline-description">선택일에 등록된 계획이 없습니다.</p>}
      {editable && task.status === 'open' && <form className="work-inline-schedule" onSubmit={event => { event.preventDefault(); void plan(); }}><fieldset disabled={blocked || Boolean(field)}>
        <label>할 날짜<DateInput required value={planDate} onChange={event => { setPlanDate(event.target.value); setPlanDirty(true); request.current = crypto.randomUUID(); }}/></label>
        <label>계획 담당자<select required value={planOwner} onChange={event => { setPlanOwner(event.target.value); setPlanDirty(true); request.current = crypto.randomUUID(); }}><option value="">담당자 선택</option>{context.assignees.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>시간대<select value={planPeriod} onChange={event => { setPlanPeriod(event.target.value as WorkPeriod); setPlanDirty(true); request.current = crypto.randomUUID(); }}>{Object.entries(workPeriods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="work-inline-buttons"><button type="submit" className="primary-button">계획에 배치</button><button type="button" className="secondary-button" onClick={() => void plan(workToday())}>오늘에 배치</button>{planDirty && <button type="button" className="secondary-button" onClick={() => { setPlanDirty(false); setPlanPeriod('unknown'); setPlanError(''); request.current = crypto.randomUUID(); }}>입력 취소</button>}</div>
      </fieldset></form>}
      {planError && <p className="work-day-error" role="alert">{planError}</p>}
    </section>
    {notice && <p className="work-day-notice" role="status">{notice}</p>}
  </>;
}
