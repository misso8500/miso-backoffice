import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ClipboardList, Plus, RefreshCw, Search, X } from 'lucide-react';
import DateInput from './DateInput';
import { saveEmploymentDraftRows, saveRecipientDraftRows } from './storage';
import {
  cancelWorkTask, createWorkTask, loadWorkContext, loadWorkTasks, loadWorkTaskHistory, updateWorkTask, workCategoryLabels,
  type WorkCategory, type WorkContext, type WorkReference, type WorkTask, type WorkTaskInput, type WorkTaskEvent
} from './lib/work-tasks';
import './WorkHub.css';

const emptyForm = (): WorkTaskInput => ({ title: '', description: '', assigneeId: '', category: 'unclassified', dueDate: '', related: [] });
const message = (error: unknown) => error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
const sameLink = (a: Pick<WorkReference, 'id' | 'type'>, b: Pick<WorkReference, 'id' | 'type'>) => a.id === b.id && a.type === b.type;
const formatTime = (value: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

function WorkHistory({ task, memberName }: { task: WorkTask; memberName: (id: string | null) => string }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<WorkTaskEvent[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    let active = true; setError(''); setEvents(null);
    void loadWorkTaskHistory(task.id).then(value => { if (active) setEvents(value); }).catch(cause => { if (active) setError(message(cause)); });
    return () => { active = false; };
  }, [open, task.id, task.version, attempt]);
  return <details className="work-history" open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary>변경 이력</summary>
    {open && <>{error ? <p role="alert">{error} <button type="button" className="secondary-button" onClick={() => setAttempt(value => value + 1)}>다시 불러오기</button></p> : events ? events.map(event => <div key={event.version}><strong>{({ created: '등록', updated: '수정', cancelled: '취소' })[event.kind]} · 버전 {event.version}</strong><small>{event.actorName} · {formatTime(event.createdAt)}</small><p>{event.task.title}<br/>담당: {memberName(event.task.assigneeId)} · 기한: {event.task.dueDate || '미정'}<br/>{workCategoryLabels[event.task.category]}{event.task.related.length ? ' · '+event.task.related.map(r => r.name).join(', ') : ''}</p>{event.task.description && <p>{event.task.description}</p>}</div>) : <p role="status">이력을 불러오는 중입니다.</p>}</>}
  </details>;
}

export default function WorkHub({ onDirectoryChanged }: { onDirectoryChanged: () => void }) {
  const [context, setContext] = useState<WorkContext | null>(null);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [form, setForm] = useState<WorkTaskInput>(emptyForm);
  const [editing, setEditing] = useState<WorkTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [assignee, setAssignee] = useState('all');
  const [status, setStatus] = useState('open');
  const [query, setQuery] = useState('');
  const [referenceType, setReferenceType] = useState<'recipient' | 'worker'>('recipient');
  const [referenceQuery, setReferenceQuery] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickError, setQuickError] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const generation = useRef(0);
  const titleInput = useRef<HTMLInputElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const quickId = useRef(crypto.randomUUID());
  const createRequestId = useRef(crypto.randomUUID());

  async function reload() {
    const current = ++generation.current;
    setLoading(true); setError('');
    try {
      const [nextContext, nextTasks] = await Promise.all([loadWorkContext(), loadWorkTasks('all', 'all')]);
      if (current !== generation.current) return;
      setContext(nextContext); setTasks(nextTasks);
    } catch (cause) { if (current === generation.current) setError(message(cause)); }
    finally { if (current === generation.current) setLoading(false); }
  }
  useEffect(() => { void reload(); return () => { generation.current++; }; }, []);
  useEffect(() => { if (formError) errorBox.current?.focus(); }, [formError]);

  const memberName = (id: string | null) => !id ? '담당자 미정' : context?.assignees.find(m => m.id === id)?.name ?? context?.members.find(m => m.id === id)?.name ?? '이전 구성원';
  const references = [...(context?.references ?? [])];
  for (const item of tasks.flatMap(t => t.related)) if (!references.some(r => sameLink(r, item))) references.push(item);
  const available = (context?.references ?? []).filter(r => r.type === referenceType && `${r.name} ${r.info}`.toLowerCase().includes(referenceQuery.toLowerCase()));
  const visible = tasks.filter(t => (status === 'all' || t.status === status)
    && (assignee === 'all' || (assignee === 'unassigned' ? !t.assigneeId : t.assigneeId === assignee))
    && `${t.title} ${t.description} ${t.related.map(r => r.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const updateForm = <K extends keyof WorkTaskInput>(key: K, value: WorkTaskInput[K]) => setForm(previous => ({ ...previous, [key]: value }));
  function toggleReference(reference: WorkReference) {
    setForm(previous => ({ ...previous, related: previous.related.some(r => sameLink(r, reference))
      ? previous.related.filter(r => !sameLink(r, reference)) : [...previous.related, { id: reference.id, type: reference.type }] }));
  }
  function startEdit(task: WorkTask) {
    if ((editing || form.title || form.description || form.related.length) && !window.confirm('입력 중인 내용을 바꾸고 이 업무를 편집할까요?')) return;
    setEditing(task); setForm({ title: task.title, description: task.description, assigneeId: task.assigneeId ?? '', category: task.category, dueDate: task.dueDate ?? '', related: task.related.map(({ id, type }) => ({ id, type })) });
    setFormError(''); setNotice(''); titleInput.current?.focus(); titleInput.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function resetForm() { setEditing(null); setForm(emptyForm()); setFormError(''); createRequestId.current = crypto.randomUUID(); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving || !context) return;
    setSaving(true); setFormError(''); setNotice('');
    try {
      const saved = editing ? await updateWorkTask(editing.id, form, editing.version) : await createWorkTask({ ...form, requestId: createRequestId.current });
      // Invalidate any older refresh before updating the visible list.
      generation.current++; setLoading(false);
      setTasks(previous => editing ? previous.map(t => t.id === saved.id ? saved : t) : [saved, ...previous.filter(t => t.id !== saved.id)]);
      resetForm(); setNotice(editing ? '업무 수정 내용을 서버에 저장했습니다.' : '업무를 서버에 등록했습니다.');
    } catch (cause) { setFormError(message(cause)); }
    finally { setSaving(false); }
  }
  async function cancel(task: WorkTask) {
    if (busyId || !window.confirm(`‘${task.title}’ 업무를 취소할까요? 취소 내역은 보존됩니다.`)) return;
    setBusyId(task.id); setError(''); setNotice('');
    try {
      const saved = await cancelWorkTask(task);
      generation.current++; setLoading(false);
      setTasks(previous => previous.map(t => t.id === saved.id ? saved : t));
      if (editing?.id === saved.id) resetForm();
      setNotice('업무를 취소했습니다. 취소됨 필터에서 확인할 수 있습니다.');
    } catch (cause) { setError(message(cause)); }
    finally { setBusyId(''); }
  }
  async function quickCreate() {
    if (quickBusy || !quickName.trim()) return;
    const kind = referenceType, name = quickName.trim(), phone = quickPhone.trim();
    const matches = (context?.references ?? []).filter(r => r.type === kind && r.name === name);
    if (matches.length && !window.confirm(`동일한 이름의 기록이 ${matches.length}건 있습니다. 기존 검색 결과를 확인하셨나요? 별도 인물의 초안을 새로 만들까요?`)) return;
    setQuickBusy(true); setQuickError('');
    try {
      const id = quickId.current;
      if (kind === 'recipient') await saveRecipientDraftRows([{ id, name, phone, birthDate: '', longTermCareNumber: '', careGrade: '', address: '' }]);
      else await saveEmploymentDraftRows([{ id, workerName: name, workerPhone: phone, residentRegistrationNumber: '', primaryBank: '', bankAccountNumber: '', contractStartDate: '', contractEndDate: '' }]);
      // The draft is already durable even if the subsequent directory refresh fails.
      const added: WorkReference = { id, type: kind, name, info: '상세 정보 입력 중', isDraft: true };
      setContext(previous => previous ? { ...previous, references: [...previous.references.filter(r => !sameLink(r, added)), added] } : previous);
      setForm(previous => ({ ...previous, related: previous.related.some(r => sameLink(r, added)) ? previous.related : [...previous.related, { id, type: kind }] }));
      quickId.current = crypto.randomUUID(); setQuickOpen(false); setQuickName(''); setQuickPhone('');
      setNotice(`${kind === 'recipient' ? '수급자' : '근로계약'} 초안을 명부에 저장하고 연결했습니다. 업무 저장 전에도 명부 초안은 유지됩니다.`);
      onDirectoryChanged();
    } catch (cause) { setQuickError(message(cause)); }
    finally { setQuickBusy(false); }
  }

  return <section className="work-hub" aria-label="공동 업무">
    <header className="page-heading"><div><span className="eyebrow">Shared workspace</span><h1>공동 업무</h1><p>요청을 한곳에 모으고, 담당자와 기한을 함께 확인합니다.</p></div><button type="button" className="secondary-button" disabled={loading || saving || quickBusy || Boolean(busyId)} onClick={() => void reload()}><RefreshCw size={16} className={loading ? 'spin' : ''}/>목록 새로고침</button></header>
    {error && <div className="error-banner" role="alert">{error}<button type="button" className="secondary-button" onClick={() => void reload()} disabled={loading}>다시 불러오기</button></div>}
    {notice && <p className="work-notice" role="status">{notice}</p>}
    {!context ? <div className="empty-state"><ClipboardList size={28}/><p>{loading ? '업무 공간을 준비하고 있습니다.' : '구성원을 불러온 뒤 업무를 등록할 수 있습니다.'}</p></div> : <>
      <form className="work-capture" onSubmit={event => void submit(event)} aria-labelledby="work-capture-title">
        <div className="section-title-row"><h2 id="work-capture-title">{editing ? '업무 수정' : '떠오른 일부터, 한 줄로'}</h2><small>요청자: {editing ? memberName(editing.requesterId) : context.me.name}</small></div>
        <fieldset disabled={saving || quickBusy}>
          <div className="work-capture-line"><input ref={titleInput} aria-label="업무 제목" required maxLength={500} placeholder="예: 이번 주까지 10월 급여계산" value={form.title} onChange={event => updateForm('title', event.target.value)}/><label className="sr-only" htmlFor="work-assignee">업무 담당자</label><select id="work-assignee" value={form.assigneeId} onChange={event => updateForm('assigneeId', event.target.value)}><option value="">담당자 미정</option>{editing && form.assigneeId && !context.assignees.some(m => m.id === form.assigneeId) && <option value={form.assigneeId}>기존 배정: {memberName(form.assigneeId)}</option>}{context.assignees.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><button className="primary-button" type="submit"><Plus size={16}/>{saving ? '저장 중…' : editing ? '수정 저장' : '업무 추가'}</button>{editing && <button type="button" className="secondary-button" onClick={resetForm}>편집 취소</button>}</div>
          <div className="work-meta"><label>센터 업무 분류<select value={form.category} onChange={event => updateForm('category', event.target.value as WorkCategory)}>{Object.entries(workCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>기한 (선택)<DateInput value={form.dueDate} onChange={event => updateForm('dueDate', event.target.value)}/></label></div>
          <details open={Boolean(form.description)}><summary>상세 내용 (선택)</summary><textarea aria-label="업무 상세 내용" maxLength={5000} value={form.description} onChange={event => updateForm('description', event.target.value)} placeholder="요청 배경과 필요한 결과를 적어 주세요."/></details>
          <div className="work-relations"><div className="work-reference-search"><select aria-label="관련자 종류" value={referenceType} onChange={event => { setReferenceType(event.target.value as 'recipient' | 'worker'); quickId.current = crypto.randomUUID(); setQuickOpen(false); setQuickError(''); }}><option value="recipient">수급자</option><option value="worker">근로자</option></select><input type="search" aria-label="관련자 검색" placeholder="이름·구분 정보 검색" value={referenceQuery} onChange={event => setReferenceQuery(event.target.value)}/><button type="button" className="secondary-button" onClick={() => { setQuickOpen(!quickOpen); setQuickName(referenceQuery); setQuickError(''); }}>＋ 간단 등록</button></div>
            <div className="work-reference-results">{available.slice(0, 8).map(r => <button key={`${r.type}:${r.id}`} type="button" className={`work-reference ${form.related.some(x => sameLink(x, r)) ? 'is-selected' : ''}`} aria-pressed={form.related.some(x => sameLink(x, r))} onClick={() => toggleReference(r)}>{form.related.some(x => sameLink(x, r)) ? '✓ ' : '＋ '}{r.name}{r.info && <small>{r.info}</small>}{r.isDraft && <small>정보 입력 중</small>}</button>)}{!available.length && <small>검색 결과가 없습니다. 간단 등록으로 초안을 먼저 남길 수 있습니다.</small>}{available.length > 8 && <small>외 {available.length - 8}건 · 이름으로 검색해 주세요.</small>}</div>
            <div className="work-selected" aria-label="선택한 관련자">{form.related.map(link => { const r = references.find(r => sameLink(r, link)); return <button key={`${link.type}:${link.id}`} type="button" onClick={() => toggleReference(r ?? { ...link, name: '', info: '' })} aria-label={`${r?.name ?? '관련자'} 연결 해제`}>✓ {r?.name ?? link.id}<X size={12}/></button>; })}</div>
            {quickOpen && <div className="work-quick-create" onKeyDown={event => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); void quickCreate(); } }}><strong>{referenceType === 'recipient' ? '수급자' : '근로계약'} 초안 등록</strong><input aria-label="간단 등록 이름" placeholder="이름" maxLength={60} value={quickName} onChange={event => setQuickName(event.target.value)}/><input aria-label="간단 등록 연락처" placeholder="연락처 (선택)" maxLength={30} value={quickPhone} onChange={event => setQuickPhone(event.target.value)}/><button type="button" className="secondary-button" disabled={!quickName.trim()} onClick={() => void quickCreate()}>등록 후 연결</button><p>기존 명부에 실제 초안으로 저장됩니다. 상세 정보는 수급자·근로계약 화면에서 보완합니다.</p>{quickError && <p role="alert">{quickError}</p>}</div>}
          </div>
        </fieldset>
        <small className="work-help">담당자는 일을 할 구성원, 관련자는 업무의 대상입니다. 분류는 센터 업무용 초안이며 공단 평가 지표와의 연결은 별도입니다.</small>
        {formError && <div ref={errorBox} tabIndex={-1} className="form-error" role="alert">{formError} 입력 내용은 유지됩니다. 상단 새로고침 후 최신 업무를 선택해 비교할 수 있습니다.</div>}
      </form>
      <div className="work-list-heading"><div><h2>함께 보는 업무 <small>{visible.length}건</small></h2><p>허용된 구성원 모두가 조회·수정·취소할 수 있습니다.</p></div><div className="work-filters"><label className="search-box"><Search size={16}/><input type="search" aria-label="업무 검색" placeholder="업무·관련자 검색" value={query} onChange={event => setQuery(event.target.value)}/></label><select className="filter-select" aria-label="담당자 필터" value={assignee} onChange={event => setAssignee(event.target.value)}><option value="all">전체 구성원</option><option value="unassigned">담당자 미정</option>{context.assignees.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><select className="filter-select" aria-label="업무 상태 필터" value={status} onChange={event => setStatus(event.target.value)}><option value="open">진행할 업무</option><option value="cancelled">취소됨</option><option value="all">전체 상태</option></select></div></div>
      {loading && <p role="status">최신 목록을 불러오는 중입니다.</p>}
      <div className="work-task-list">{visible.map(t => <article key={t.id} className={`work-task-card ${t.status === 'cancelled' ? 'is-cancelled' : ''}`}><div className="work-task-top"><span className="work-category">{workCategoryLabels[t.category]}</span><span className="work-task-status">{t.status === 'cancelled' ? '취소됨' : '진행할 업무'}</span>{t.dueDate && <span className="work-due">기한 {t.dueDate}</span>}</div><h3>{t.title}</h3>{t.description && <p className="work-description">{t.description}</p>}<p>{memberName(t.requesterId)} 요청 → <strong>{memberName(t.assigneeId)}</strong></p><div className="work-linked">{t.related.map(r => <span key={`${r.type}:${r.id}`}>{r.type === 'recipient' ? '수급자' : '근로자'} · {r.name}{r.info && <small>{r.info}</small>}</span>)}</div><footer><small>마지막 변경: {memberName(t.updatedBy)} · {formatTime(t.updatedAt)} · 버전 {t.version}</small>{t.canEdit && <div><button className="secondary-button" type="button" disabled={saving || quickBusy || Boolean(busyId)} onClick={() => startEdit(t)}>수정</button><button className="danger-button" type="button" disabled={saving || quickBusy || Boolean(busyId)} onClick={() => void cancel(t)}>{busyId === t.id ? '취소 중…' : '취소'}</button></div>}</footer><WorkHistory task={t} memberName={memberName}/></article>)}</div>
      {!loading && !visible.length && <div className="empty-state"><ClipboardList size={28}/><p>{tasks.length ? '조건에 맞는 업무가 없습니다.' : '아직 등록된 업무가 없습니다. 첫 업무를 남겨보세요.'}</p></div>}
    </>}
  </section>;
}
