import WorkVisits from './WorkVisits';
import WorkTaskMap from './WorkTaskMap';
import WorkBauChecklist from './WorkBauChecklist';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ClipboardList, Plus, RefreshCw, Search, X } from 'lucide-react';
import DateInput from './DateInput';
import WorkCalendar from './WorkCalendar';
import WorkRecurrenceSettings from './WorkRecurrenceSettings';
import WorkTaskDetails from './WorkTaskDetails';
import WorkOperationStatus from './WorkOperationStatus';
import { groupDayTasks } from '../shared/work-day-tasks.mjs';
import { moveWorkCalendar, workCalendarRange, type WorkCalendarMode } from '../shared/work-calendar.mjs';
import WorkDayPanel, { type WorkDayHandle } from './WorkDayPanel';
import { saveEmploymentDraftRows, saveRecipientDraftRows } from './storage';
import {
  cancelWorkTask, completeWorkTask, createWorkTask, loadWorkContext, loadWorkTasks, loadWorkTaskHistory, workCategoryLabels, workToday,
  type WorkCategory, type WorkContext, type WorkReference, type WorkTask, type WorkTaskInput, type WorkTaskEvent, type WorkDay
} from './lib/work-tasks';
import './WorkHub.css';
import './CenterWork.css';

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
    {open && <>{error ? <p role="alert">{error} <button type="button" className="secondary-button" onClick={() => setAttempt(value => value + 1)}>다시 불러오기</button></p> : events ? events.map(event => <div key={event.version}><strong>{(event.kind === 'updated' && event.task.status === 'done' ? '업무 전체 완료' : ({ created: '등록', updated: '수정·재개', cancelled: '취소' })[event.kind])} · 버전 {event.version}</strong><small>{event.actorName} · {formatTime(event.createdAt)}</small><p>{event.task.title}<br/>상태: {event.task.status === 'done' ? '완료됨' : event.task.status === 'cancelled' ? '취소됨' : '진행할 업무'}<br/>담당: {memberName(event.task.assigneeId)} · 기한: {event.task.dueDate || '미정'}<br/>{workCategoryLabels[event.task.category]}{event.task.related.length ? ' · '+event.task.related.map(r => r.name).join(', ') : ''}</p>{event.task.description && <p>{event.task.description}</p>}</div>) : <p role="status">이력을 불러오는 중입니다.</p>}</>}
  </details>;
}

export default function WorkHub({ onDirectoryChanged }: { onDirectoryChanged: () => void }) {
  const [context, setContext] = useState<WorkContext | null>(null);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [date, setDate] = useState(workToday);
  const [detailDate, setDetailDate] = useState(workToday);
  const [view, setView] = useState<WorkCalendarMode>('day');
  const [systemOpen, setSystemOpen] = useState(false);
  const [visitOpen,setVisitOpen]=useState(false);
  const [mapOpen, setMapOpen] = useState(true);
  const [designSection, setDesignSection] = useState<'map' | 'repeat' | 'legacy'>('map');
  const [systemDirty, setSystemDirty] = useState(false);
  const [calendarRevision, setCalendarRevision] = useState(0);
  const [activity, setActivity] = useState<WorkDay | null>(null);
  useEffect(() => { if (activity) setCalendarRevision(value => value + 1); }, [activity]);
  const [journalBusy, setJournalBusy] = useState(false);
  const [journalReady, setJournalReady] = useState(false);
  const dayPanel = useRef<WorkDayHandle>(null);
  const [form, setForm] = useState<WorkTaskInput>(emptyForm);
  const [detailEditing, setDetailEditing] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [relationsOpen, setRelationsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [lastResolvedId, setLastResolvedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [assignee, setAssignee] = useState('all');
  const [status, setStatus] = useState('all');
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
  const detailPanel = useRef<HTMLElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const quickId = useRef(crypto.randomUUID());
  const createRequestId = useRef(crypto.randomUUID());

  async function reload() {
    const current = ++generation.current;
    setLoading(true); setError('');
    try {
      const [nextContext, nextTasks] = await Promise.all([loadWorkContext(), loadWorkTasks('all', 'all')]);
      if (current !== generation.current) return;
      setContext(nextContext); setTasks(nextTasks); dayPanel.current?.refresh(); setCalendarRevision(value => value + 1);
    } catch (cause) { if (current === generation.current) setError(message(cause)); }
    finally { if (current === generation.current) setLoading(false); }
  }
  useEffect(() => { void reload(); return () => { generation.current++; }; }, []);
  useEffect(() => { if (formError) errorBox.current?.focus(); }, [formError]);

  const memberName = (id: string | null) => !id ? '담당자 미정' : context?.assignees.find(m => m.id === id)?.name ?? context?.members.find(m => m.id === id)?.name ?? '이전 구성원';
  const references = [...(context?.references ?? [])];
  for (const item of tasks.flatMap(t => t.related)) if (!references.some(r => sameLink(r, item))) references.push(item);
  const available = referenceQuery.trim() ? (context?.references ?? []).filter(r => r.type === referenceType && `${r.name} ${r.info}`.toLowerCase().includes(referenceQuery.trim().toLowerCase())) : [];
  const selectedTask = tasks.find(task => task.id === selectedId);
  useEffect(() => { if (detailPanel.current) detailPanel.current.scrollTop = 0; }, [selectedId]);
  const lastResolved = tasks.find(task => task.id === lastResolvedId);
  const focusDate = view === 'day' ? date : detailDate;
  const selectedActivity = activity?.date === focusDate && activity.assignee === (assignee === 'unassigned' ? 'all' : assignee) ? activity : null;
  const visible = tasks.filter(t => (status === 'all' || t.status === status)
    && (assignee === 'all' || (assignee === 'unassigned' ? !t.assigneeId : t.assigneeId === assignee))
    && `${t.title} ${t.description} ${t.related.map(r => r.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const dayGroups = groupDayTasks(visible, date, selectedActivity);
  const updateForm = <K extends keyof WorkTaskInput>(key: K, value: WorkTaskInput[K]) => setForm(previous => ({ ...previous, [key]: value }));
  function selectTask(task: WorkTask, day = date) {
    if (detailEditing && selectedId !== task.id && !window.confirm('수정 중인 내용을 닫고 다른 업무를 볼까요?')) return;
    setSelectedId(task.id); setDetailDate(day);
  }
  function openRecord(kind: 'plan' | 'execution', task: WorkTask) {
    if (kind === 'plan') dayPanel.current?.plan(task);
    else dayPanel.current?.execution(task);
  }
  function toggleReference(reference: WorkReference) {
    setForm(previous => ({ ...previous, related: previous.related.some(r => sameLink(r, reference))
      ? previous.related.filter(r => !sameLink(r, reference)) : [...previous.related, { id: reference.id, type: reference.type }] }));
  }
  function resetForm() {
    setForm(emptyForm()); setFormError('');
    setDescriptionOpen(false); setRelationsOpen(false);
    setQuickOpen(false); setQuickError(''); setReferenceQuery('');
    createRequestId.current = crypto.randomUUID();
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving || !context) return;
    setSaving(true); setFormError(''); setNotice(''); setLastResolvedId('');
    try {
      const saved = await createWorkTask({ ...form, requestId: createRequestId.current });
      // Invalidate any older refresh before updating the visible list.
      generation.current++; setLoading(false);
      setTasks(previous => [saved, ...previous.filter(t => t.id !== saved.id)]);
      setSelectedId(saved.id); setDetailDate(date); setCalendarRevision(value => value + 1); resetForm(); setNotice('업무를 등록했습니다.');
    } catch (cause) { setFormError(message(cause)); }
    finally { setSaving(false); }
  }
  async function cancel(task: WorkTask) {
    if (busyId || !window.confirm(`‘${task.title}’ 업무를 취소할까요? 취소 내역은 보존됩니다.`)) return;
    setBusyId(task.id); setError(''); setNotice(''); setLastResolvedId('');
    try {
      const saved = await cancelWorkTask(task);
      generation.current++; setLoading(false);
      setTasks(previous => previous.map(t => t.id === saved.id ? saved : t));
      dayPanel.current?.refresh(); setCalendarRevision(value => value + 1); setNotice('업무와 남은 계획을 취소했습니다. 기존 수행과 이력은 보존됩니다.');
    } catch (cause) { setError(message(cause)); }
    finally { setBusyId(''); }
  }
  async function resolveTask(task: WorkTask) {
    if (busyId || task.onHold || task.status === 'cancelled') return;
    setBusyId(task.id); setError(''); setNotice(''); setLastResolvedId('');
    try {
      const saved = await completeWorkTask(task, task.status === 'done');
      generation.current++; setLoading(false); setTasks(previous => previous.map(t => t.id === saved.id ? saved : t));
      setLastResolvedId(saved.id); setCalendarRevision(value => value + 1);
      setNotice(saved.status === 'done' ? '업무를 완료했습니다. 기존 계획·수행 기록은 유지됩니다.' : '업무를 다시 진행 상태로 바꿨습니다.');
    } catch (cause) { setError(message(cause)); }
    finally { setBusyId(''); }
  }
  async function quickCreate() {
    if (quickBusy || !quickName.trim()) return;
    const kind = referenceType, name = quickName.trim(), phone = quickPhone.trim();
    const matches = (context?.references ?? []).filter(r => r.type === kind && r.name === name);
    if (matches.length && !window.confirm(`동일한 이름의 기록이 ${matches.length}건 있습니다. 기존 검색 결과를 확인하셨나요? 별도 인물의 초안을 새로 만들까요?`)) return;
    setQuickBusy(true); setQuickError(''); setLastResolvedId('');
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

  const capture = context && (
        <form className="work-capture" onSubmit={event => void submit(event)} aria-labelledby="work-capture-title">
        <div className="section-title-row"><h2 id="work-capture-title">떠오른 일부터, 한 줄로</h2><small>요청자: {context.me.name}</small></div>
        <fieldset disabled={detailEditing || saving || quickBusy || journalBusy}>
          <div className="work-capture-fields">
            <input ref={titleInput} aria-label="업무 제목" required maxLength={500} placeholder="예: 이번 주까지 10월 급여계산" value={form.title} onChange={event => updateForm('title', event.target.value)}/>
            <details className="work-capture-options"><summary>담당자·분류·기한</summary><div className="work-capture-options-fields">
            <select aria-label="업무 담당자" value={form.assigneeId} onChange={event => updateForm('assigneeId', event.target.value)}><option value="">담당자 미정</option>{context.assignees.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <select aria-label="센터 업무 분류" value={form.category} onChange={event => updateForm('category', event.target.value as WorkCategory)}>{Object.entries(workCategoryLabels).filter(([id]) => !context.categories || context.categories.includes(id)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <DateInput aria-label="기한 (선택)" title="기한 (선택)" value={form.dueDate} onChange={event => updateForm('dueDate', event.target.value)}/>
            </div></details>
          </div>
          <div className="work-capture-actions">
            <button type="button" className="secondary-button work-expand-button" aria-expanded={descriptionOpen} aria-controls="work-description-panel" onClick={() => setDescriptionOpen(open => !open)}><span aria-hidden="true">⌄</span>내용 추가{form.description && ' · 작성됨'}</button>
            <button type="button" className="secondary-button work-expand-button" aria-expanded={relationsOpen} aria-controls="work-relations-panel" onClick={() => setRelationsOpen(open => !open)}><span aria-hidden="true">⌄</span>수급자·근로자 연결{form.related.length > 0 && ` · ${form.related.length}`}</button>
            <button className="primary-button work-capture-submit" type="submit"><Plus size={16}/>{saving ? '저장 중…' : '업무 추가'}</button>
          </div>
          <div id="work-description-panel" className={`work-slide-panel ${descriptionOpen ? 'is-open' : ''}`} inert={!descriptionOpen} role="region" aria-label="상세 내용 입력"><div className="work-slide-clip"><div className="work-slide-content"><textarea aria-label="업무 상세 내용" maxLength={5000} value={form.description} onChange={event => updateForm('description', event.target.value)} placeholder="요청 배경과 필요한 결과를 적어 주세요."/></div></div></div>
          <div id="work-relations-panel" className={`work-slide-panel ${relationsOpen ? 'is-open' : ''}`} inert={!relationsOpen} role="region" aria-label="수급자·근로자 연결"><div className="work-slide-clip"><div className="work-slide-content work-relations"><div className="work-reference-search"><select aria-label="관련자 종류" value={referenceType} onChange={event => { setReferenceType(event.target.value as 'recipient' | 'worker'); quickId.current = crypto.randomUUID(); setQuickOpen(false); setQuickError(''); }}><option value="recipient">수급자</option><option value="worker">근로자</option></select><input type="search" aria-label="관련자 검색" placeholder="이름·구분 정보 검색" value={referenceQuery} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} onChange={event => setReferenceQuery(event.target.value)}/><button type="button" className="secondary-button" onClick={() => { setQuickOpen(!quickOpen); setQuickName(referenceQuery); setQuickError(''); }}>＋ 간단 등록</button></div>
            <div className="work-reference-results">{!referenceQuery.trim() && <small>이름을 검색하면 일치하는 대상만 표시합니다.</small>}{available.slice(0, 8).map(r => <button key={`${r.type}:${r.id}`} type="button" className={`work-reference ${form.related.some(x => sameLink(x, r)) ? 'is-selected' : ''}`} aria-pressed={form.related.some(x => sameLink(x, r))} onClick={() => toggleReference(r)}>{form.related.some(x => sameLink(x, r)) ? '✓ ' : '＋ '}{r.name}{r.info && <small>{r.info}</small>}{r.isDraft && <small>정보 입력 중</small>}</button>)}{referenceQuery.trim() && !available.length && <small>검색 결과가 없습니다. 간단 등록으로 초안을 먼저 남길 수 있습니다.</small>}{available.length > 8 && <small>외 {available.length - 8}건 · 이름으로 검색해 주세요.</small>}</div>
            <div className="work-selected" aria-label="선택한 관련자">{form.related.map(link => { const r = references.find(r => sameLink(r, link)); return <button key={`${link.type}:${link.id}`} type="button" onClick={() => toggleReference(r ?? { ...link, name: '', info: '' })} aria-label={`${r?.name ?? '관련자'} 연결 해제`}>✓ {r?.name ?? link.id}<X size={12}/></button>; })}</div>
            {quickOpen && <div className="work-quick-create" onKeyDown={event => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); void quickCreate(); } }}><strong>{referenceType === 'recipient' ? '수급자' : '근로계약'} 초안 등록</strong><input aria-label="간단 등록 이름" placeholder="이름" maxLength={60} value={quickName} onChange={event => setQuickName(event.target.value)}/><input aria-label="간단 등록 연락처" placeholder="연락처 (선택)" maxLength={30} value={quickPhone} onChange={event => setQuickPhone(event.target.value)}/><button type="button" className="secondary-button" disabled={!quickName.trim()} onClick={() => void quickCreate()}>등록 후 연결</button><p>기존 명부에 실제 초안으로 저장됩니다. 상세 정보는 수급자·근로계약 화면에서 보완합니다.</p>{quickError && <p role="alert">{quickError}</p>}</div>}
          </div></div></div>
        </fieldset>
        {formError && <div ref={errorBox} tabIndex={-1} className="form-error" role="alert">{formError} 입력 내용은 유지됩니다. 상단 새로고침 후 최신 업무를 선택해 비교할 수 있습니다.</div>}
      </form>
  );

  const navigationBusy = detailEditing || journalBusy || saving || quickBusy || Boolean(busyId);
  const designWorkspace = context && <><nav className="work-secondary-tabs" aria-label="설계 종류"><button type="button" disabled={navigationBusy || systemDirty} aria-current={designSection === 'map' ? 'page' : undefined} onClick={() => setDesignSection('map')}>월간·사건형 업무 설계</button><button type="button" disabled={navigationBusy || systemDirty} aria-current={designSection === 'repeat' ? 'page' : undefined} onClick={() => setDesignSection('repeat')}>매일 반복업무</button><button type="button" disabled={navigationBusy || systemDirty} aria-current={designSection === 'legacy' ? 'page' : undefined} onClick={() => setDesignSection('legacy')}>기존 반복 규칙</button></nav>{designSection !== 'legacy' ? <WorkTaskMap key={designSection} initialKind={designSection === 'repeat' ? 'daily' : 'monthly'} mode="design" onBusy={setSaving} onDirty={setSystemDirty} context={context} date={date} onChanged={() => void reload()}/> : <WorkRecurrenceSettings context={context} onChanged={() => void reload()} onBusy={setSaving} onDirty={setSystemDirty}/>}</>;
  function switchSection(section: 'map' | 'design' | 'todo') {
    if (systemDirty && !window.confirm('작성 중인 설정을 닫고 이동할까요?')) return;
    if (visitOpen) void reload();
    setVisitOpen(false); setMapOpen(section === 'map'); setSystemOpen(section === 'design');
  }
  const workspaceNavigation = <nav className="work-view-tabs work-primary-tabs" aria-label="센터 업무">{([['map','업무전체지도'],['design','업무연관설계(태스크맵)'],['todo','일일 업무 관리(투두)']] as const).map(([key,label]) => <button key={key} type="button" disabled={navigationBusy} aria-current={(key === 'map' ? mapOpen : key === 'design' ? systemOpen : !mapOpen && !systemOpen) ? 'page' : undefined} onClick={() => switchSection(key)}>{label}</button>)}</nav>;
  const todoNavigation = <nav className="work-secondary-tabs" aria-label="투두 보기">{(['day','week','month'] as const).map(mode => <button key={mode} type="button" disabled={navigationBusy} aria-current={!visitOpen && view === mode ? 'page' : undefined} onClick={() => { if(visitOpen) void reload(); setVisitOpen(false); setView(mode); }}>{({day:'일간',week:'주간',month:'월간'})[mode]}</button>)}<button type="button" disabled={navigationBusy} aria-current={visitOpen ? 'page' : undefined} onClick={() => setVisitOpen(true)}>라운딩</button></nav>;
  if(visitOpen)return <section className="work-hub is-system"><WorkOperationStatus/><div className="work-day-navigation">{workspaceNavigation}{todoNavigation}</div><WorkVisits onBusy={setQuickBusy}/></section>;
  return <section className={`work-hub ${systemOpen ? 'is-system' : ''}`} aria-label="공동 업무">
    <WorkOperationStatus/>
    <div className="work-day-navigation" role="region" aria-label="업무 기간 탐색">
      {workspaceNavigation}
      {!mapOpen && !systemOpen && todoNavigation}
      <div className="work-period-controls" style={systemOpen || mapOpen ? { display: 'none' } : undefined}><div className="work-date-step"><button type="button" disabled={journalBusy || date === '1000-01-01'} onClick={() => setDate(moveWorkCalendar(date,view,-1))} aria-label={`이전 ${view === 'day' ? '날' : view === 'week' ? '주' : '달'}`}>←</button><strong>{view === 'week' ? `${workCalendarRange(date,view).from} ~ ${workCalendarRange(date,view).to}` : view === 'month' ? date.slice(0,7).replace('-', '년 ')+'월' : date.replaceAll('-', '.')}<small>{view === 'day' ? '할 일을 확인하고 바로 완료하세요' : view === 'week' ? '월요일부터 일요일까지' : '한 달의 계획과 실제 수행'}</small></strong><button type="button" disabled={journalBusy || date === '9999-12-31'} onClick={() => setDate(moveWorkCalendar(date,view,1))} aria-label={`다음 ${view === 'day' ? '날' : view === 'week' ? '주' : '달'}`}>→</button></div><div className="work-date-picker"><label className="sr-only" htmlFor="work-date">기준 날짜</label><DateInput id="work-date" required disabled={journalBusy} value={date} onChange={event => { if(event.target.value >= '1000-01-01' && event.target.value <= '9999-12-31') setDate(event.target.value); }}/><button type="button" disabled={journalBusy} onClick={() => setDate(workToday())}>오늘로</button></div></div>
    </div>
    <header className="page-heading"><div><span className="eyebrow">Center workspace</span><h1>센터 업무</h1><p>업무의 흐름을 확인하고, 필요한 일을 차근차근 처리합니다.</p></div><button type="button" className="secondary-button" disabled={loading || saving || quickBusy || journalBusy || Boolean(busyId)} onClick={() => void reload()}><RefreshCw size={16} className={loading ? 'spin' : ''}/>목록 새로고침</button></header>
    {error && <div className="error-banner" role="alert">{error}<button type="button" className="secondary-button" onClick={() => void reload()} disabled={loading}>다시 불러오기</button></div>}
    {notice && <div className="work-notice" role="status">{notice}{lastResolved && <button type="button" className="secondary-button" disabled={saving || quickBusy || journalBusy || Boolean(busyId)} onClick={() => void resolveTask(lastResolved)}>{lastResolved.status === 'done' ? '완료 되돌리기' : '다시 완료'}</button>}</div>}
    {!context ? <div className="empty-state"><ClipboardList size={28}/><p>{loading ? '업무 공간을 준비하고 있습니다.' : '구성원을 불러온 뒤 업무를 등록할 수 있습니다.'}</p></div> : <>
      {mapOpen ? <WorkTaskMap onBusy={setSaving} context={context} date={date} onChanged={() => void reload()}/> : systemOpen ? designWorkspace : <>
      {capture}

      {<div className={`work-day-columns ${view !== 'day' ? 'is-period' : ''} ${selectedTask ? 'has-detail' : ''}`}><section className="work-task-section">{view === 'day' ? <><div className="work-list-heading"><div><h2>하루 할 일 <small>{visible.length}건</small></h2><p>체크하면 완료, 업무를 선택하면 상세 보기</p></div><div className="work-filters"><label className="search-box"><Search size={16}/><input type="search" aria-label="업무 검색" placeholder="업무·관련자 검색" value={query} onChange={event => setQuery(event.target.value)}/></label><select className="filter-select" aria-label="담당자 필터" value={assignee} disabled={journalBusy} onChange={event => setAssignee(event.target.value)}><option value="all">전체 구성원</option><option value="unassigned">담당자 미정</option>{context.assignees.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><select className="filter-select" aria-label="업무 상태 필터" value={status} onChange={event => setStatus(event.target.value)}><option value="open">진행할 업무</option><option value="done">완료됨</option><option value="cancelled">취소됨</option><option value="all">전체 상태</option></select></div></div>
      {loading && <p role="status">최신 목록을 불러오는 중입니다.</p>}
      <div className="work-todo-totals">{dayGroups.map(group => <span key={group.title}>{group.title} <strong>{group.rows.length}</strong></span>)}</div><WorkBauChecklist refresh={calendarRevision} status={status} query={query} date={date} assignee={assignee} context={context} onChanged={() => void reload()}/><div className="work-task-list work-compact-list">{dayGroups.map((group, index) => <details open={index < 2 && !group.rows.every(t => t.status !== 'open')} key={group.title} className="work-task-group" aria-label={group.title}><summary>{group.title} <small>{group.rows.length}</small></summary>{group.rows.map(t => <article key={t.id} className={`work-task-row ${selectedId === t.id ? 'is-selected' : ''} ${t.status === 'cancelled' ? 'is-cancelled' : ''}`}>
        <input type="checkbox" checked={t.status === 'done'} aria-label={`${t.title} ${t.status === 'done' ? '완료 되돌리기' : '완료하기'}`} disabled={Boolean(t.onHold) || detailEditing || !t.canEdit || t.status === 'cancelled' || saving || quickBusy || journalBusy || Boolean(busyId)} onChange={() => void resolveTask(t)}/>
        <button type="button" className="work-row-title" aria-pressed={selectedId === t.id} disabled={saving || quickBusy || journalBusy || Boolean(busyId)} onClick={() => selectTask(t)}><span className={`work-task-title ${selectedActivity?.executions.some(e => e.taskId === t.id && e.status === 'recorded') ? 'has-execution' : selectedActivity?.plans.some(p => p.taskId === t.id && p.status === 'planned') ? 'has-plan' : ''}`}>{t.title}</span><small>{t.onHold ? '서비스 일시정지 · 라운딩 보류' : t.status === 'cancelled' ? '취소됨' : t.status === 'done' ? '완료됨' : selectedActivity?.executions.some(e => e.taskId === t.id && e.status === 'recorded') ? '선택일 수행 기록 있음' : selectedActivity?.plans.some(p => p.taskId === t.id && p.status === 'planned') ? '선택일 계획됨' : ''}{t.related.length > 0 && ` · ${t.related.map(r => r.name).join(', ')}`}</small></button>
        <span className="work-row-assignee">{memberName(t.assigneeId)}</span><span className="work-row-due">{t.dueDate ? t.dueDate === date ? '선택일 마감' : t.dueDate : '기한 미정'}</span>
      </article>)}</details>)}</div>
      {!loading && !visible.length && <div className="empty-state"><ClipboardList size={28}/><p>{tasks.length ? '조건에 맞는 업무가 없습니다.' : '아직 등록된 업무가 없습니다. 첫 업무를 남겨보세요.'}</p></div>}</> : <><div className="work-calendar-filters"><label htmlFor="work-calendar-assignee">담당자</label><select id="work-calendar-assignee" className="filter-select" value={assignee} onChange={event => setAssignee(event.target.value)}><option value="all">전체 구성원</option><option value="unassigned">담당자 미정</option>{context.assignees.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div><WorkCalendar onSelectDate={setDetailDate} tasks={tasks} selectedId={selectedId} editing={detailEditing} busy={saving || quickBusy || journalBusy || Boolean(busyId)} onOpenTask={(task, day) => selectTask(task, day)} onComplete={task => void resolveTask(task)} context={context} date={date} view={view} assignee={assignee} revision={calendarRevision} onOpenDay={(day, owner) => { setDate(day); setAssignee(owner); setView('day'); setStatus('all'); setQuery(''); void reload(); }}/></>}</section>
      <div className="work-detail-slot" inert={!selectedTask}><aside ref={detailPanel} className="work-task-detail work-detail-sidebar" aria-label="선택한 업무 상세"><header className="work-detail-heading"><h2>업무 상세</h2>{selectedTask && <button type="button" className="icon-button" aria-label="업무 상세 닫기" disabled={saving || quickBusy || journalBusy || Boolean(busyId)} onClick={() => { if (detailEditing && !window.confirm('수정 중인 내용을 닫을까요?')) return; setSelectedId(''); }}><X size={18}/></button>}</header>
        {selectedTask ? <div className="work-detail-content"><span className="work-category">{selectedTask.onHold ? '라운딩 보류' : selectedTask.status === 'done' ? '완료됨' : selectedTask.status === 'cancelled' ? '취소됨' : '미완료'}</span>
          <WorkTaskDetails onReferenceCreated={reference => { setContext(previous => previous ? { ...previous, references: [...previous.references.filter(r => !sameLink(r, reference)), reference] } : previous); onDirectoryChanged(); }} key={`detail:${selectedTask.id}`} task={selectedTask} context={context} date={focusDate} activity={selectedActivity} disabled={saving || quickBusy || journalBusy || Boolean(busyId)} onBusy={setSaving} onEditing={setDetailEditing} onSaved={saved => { setCalendarRevision(value => value + 1); generation.current++; setLoading(false); setTasks(previous => previous.map(task => task.id === saved.id ? saved : task)); }} onPlansChanged={() => { dayPanel.current?.refresh(); setCalendarRevision(value => value + 1); }}/>
          {selectedTask.canEdit && selectedTask.status !== 'cancelled' && <div className="work-detail-actions"><><button type="button" className="primary-button" disabled={Boolean(selectedTask.onHold) || detailEditing || saving || quickBusy || journalBusy || Boolean(busyId)} onClick={() => void resolveTask(selectedTask)}>{selectedTask.status === 'done' ? '다시 진행' : '✓ 완료하기'}</button><button type="button" className="secondary-button" disabled={Boolean(selectedTask.onHold) || detailEditing || !journalReady || saving || quickBusy || journalBusy || Boolean(busyId)} onClick={() => openRecord('execution', selectedTask)}>수행 내용 남기기</button><button type="button" className="danger-button" disabled={detailEditing || saving || quickBusy || journalBusy || Boolean(busyId)} onClick={() => void cancel(selectedTask)}>업무 취소</button></></div>}
          <small className="work-help">완료 체크는 업무 상태를 바꿉니다. 실제 수행일·내용이 필요하면 수행 기록을 남겨주세요.</small><WorkHistory key={`history:${selectedTask.id}`} task={selectedTask} memberName={memberName}/>
        </div> : <div className="work-detail-empty"><ClipboardList size={26}/><p>업무를 선택하면<br/>담당자·일정·상세 내용을 볼 수 있어요.</p></div>}
      </aside></div></div>}
      <div className="work-records-section"><WorkDayPanel ref={dayPanel} context={context} date={focusDate} assignee={assignee} onActivity={setActivity} onBusy={setJournalBusy} onReady={setJournalReady}/></div>
      </>}
    </>}
  </section>;
}
