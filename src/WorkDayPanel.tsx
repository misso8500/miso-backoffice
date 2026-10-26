import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type FormEvent } from 'react';
import { RefreshCw, X } from 'lucide-react';
import DateInput from './DateInput';
import {
  cancelWorkExecution, cancelWorkPlan, createWorkExecution, createWorkPlan, executeWorkPlan, loadWorkDay, updateWorkExecution,
  workCategoryLabels, workPeriods, workToday, type WorkCategory, type WorkContext, type WorkDay, type WorkExecution, type WorkPeriod, type WorkPlan, type WorkTask
} from './lib/work-tasks';

export type WorkDayHandle = { plan: (task: WorkTask) => void; execution: (task?: WorkTask) => void; refresh: () => void };
type Props = { context: WorkContext; date: string; assignee: string; onActivity: (day: WorkDay | null) => void; onBusy: (busy: boolean) => void; onReady: (ready: boolean) => void };
type Editor = { kind: 'plan' | 'manual' | 'edit'; task?: WorkTask; execution?: WorkExecution; date: string; assigneeId: string; period: WorkPeriod; content: string; category: WorkCategory; related: { id: string; type: 'recipient' | 'worker' }[]; requestId: string };
const errorText = (error: unknown) => error instanceof Error ? error.message : '기록을 저장하지 못했습니다.';

const WorkDayPanel = forwardRef<WorkDayHandle, Props>(function WorkDayPanel({ context, date, assignee, onActivity, onBusy, onReady }, ref) {
  const [day, setDay] = useState<WorkDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [formError, setFormError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const savingRef = useRef(false);
  const quickRequests = useRef(new Map<string, string>());
  const dialog = useRef<HTMLDialogElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const scope = assignee === 'unassigned' ? 'all' : assignee;
  const performer = (id: string) => context.assignees.find(p => p.id === id)?.name ?? '이전 담당자';
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true); setError(''); setNotice(''); setDay(null); quickRequests.current.clear();
    void loadWorkDay(date, scope).then(value => { if (generation.current === current) setDay(value); }).catch(cause => { if (generation.current === current) setError(errorText(cause)); }).finally(() => { if (generation.current === current) setLoading(false); });
    return () => { generation.current++; };
  }, [date, scope, attempt]);
  useEffect(() => { onActivity(day); }, [day, onActivity]);
  useEffect(() => { onBusy(busy || Boolean(editor)); return () => onBusy(false); }, [busy, editor, onBusy]);
  useEffect(() => {
    if (editor && !dialog.current?.open) dialog.current?.showModal();
    if (!editor && dialog.current?.open) dialog.current?.close();
  }, [editor]);
  useEffect(() => { if (formError) errorRef.current?.focus(); }, [formError]);
  function openEditor(kind: 'plan' | 'manual', task?: WorkTask) {
    if (loading || busy || !scopedDay) { setError(previous => previous || '일간 기록을 불러온 뒤 다시 시도해 주세요.'); return; }
    const owner = context.assignees.some(p => p.id === task?.assigneeId) ? task!.assigneeId! : scope === 'all' ? '' : scope;
    setFormError(''); setEditor({ kind, task, date, assigneeId: owner, period: 'unknown', content: task?.title ?? '', category: task?.category ?? 'unclassified', related: [], requestId: crypto.randomUUID() });
  }
  useImperativeHandle(ref, () => ({ plan: task => openEditor('plan', task), execution: task => openEditor('manual', task), refresh: () => setAttempt(v => v+1) }));
  const scopedDay = day?.date === date && day.assignee === scope ? day : null;
  useEffect(() => { onReady(Boolean(scopedDay) && !loading); return () => onReady(false); }, [scopedDay, loading, onReady]);
  const plans = scopedDay?.plans.filter(p => p.status === 'planned') ?? [], executions = scopedDay?.executions.filter(e => e.status === 'recorded') ?? [];
  const cancelledPlans = scopedDay?.plans.filter(p => p.status === 'cancelled') ?? [], voidedExecutions = scopedDay?.executions.filter(e => e.status === 'voided') ?? [];
  function retainPlan(row: WorkPlan) { generation.current++; setLoading(false); setDay(old => old ? { ...old, plans: [...old.plans.filter(p => p.id !== row.id), row] } : old); }
  function retainExecution(row: WorkExecution) { generation.current++; setLoading(false); setDay(old => old ? { ...old, executions: [...old.executions.filter(e => e.id !== row.id), ...(row.date === date && (scope === 'all' || row.assigneeId === scope) ? [row] : [])] } : old); }
  async function act(action: () => Promise<void>) {
    if (savingRef.current) return;
    savingRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (cause) { setError(errorText(cause)); }
    finally { savingRef.current = false; setBusy(false); }
  }
  async function quickExecute(plan: WorkPlan, period: WorkPeriod) {
    const previous = executions.find(e => e.planId === plan.id), key = `${plan.id}:${period}`;
    const requestId = quickRequests.current.get(key) ?? crypto.randomUUID(); quickRequests.current.set(key, requestId);
    await act(async () => {
      const saved = await executeWorkPlan(plan, period, previous?.version ?? 0, requestId); retainExecution(saved); quickRequests.current.delete(key);
      setNotice(`${performer(saved.assigneeId)} · ${workPeriods[period]} 수행을 저장했습니다. 업무 전체 상태는 유지됩니다.`);
    });
  }
  async function saveEditor(event: FormEvent) {
    event.preventDefault(); if (!editor || savingRef.current) return;
    savingRef.current = true; setBusy(true); setFormError('');
    try {
      if (editor.kind === 'plan') {
        const row = await createWorkPlan({ taskId: editor.task!.id, assigneeId: editor.assigneeId, date: editor.date, period: editor.period, requestId: editor.requestId });
        if (row.date === date && (scope === 'all' || row.assigneeId === scope)) retainPlan(row);
        setNotice(`${row.date} · ${performer(row.assigneeId)} 계획을 저장했습니다.`);
      } else if (editor.kind === 'edit') {
        const saved = await updateWorkExecution(editor.execution!, { content: editor.content, period: editor.period, assigneeId: editor.assigneeId });
        retainExecution(saved);
        setNotice(`${performer(saved.assigneeId)}의 수행 결과로 저장했습니다.${scope !== 'all' && saved.assigneeId !== scope ? ' 변경한 수행자의 목록에서 확인할 수 있습니다.' : ''}`);
      } else {
        const row = await createWorkExecution({ taskId: editor.task?.id, date: editor.date, assigneeId: editor.assigneeId, period: editor.period, content: editor.content, category: editor.category, related: editor.related, requestId: editor.requestId });
        if (row.date === date && (scope === 'all' || row.assigneeId === scope)) retainExecution(row);
        setNotice(`${row.date} · ${performer(row.assigneeId)} 수행을 저장했습니다.`);
      }
      setEditor(null);
    } catch (cause) { setFormError(errorText(cause)); }
    finally { savingRef.current = false; setBusy(false); }
  }
  function editExecution(execution: WorkExecution) {
    setFormError(''); setEditor({ kind: 'edit', execution, date: execution.date, assigneeId: execution.assigneeId, period: execution.period, content: execution.content, category: execution.snapshot.category, related: [], requestId: crypto.randomUUID() });
  }

  return <section className="work-day-panel" aria-label="선택일 계획과 실제 수행">
    <header className="work-day-heading"><div><h2>계획과 실제 수행</h2><p>{date} · {scope === 'all' ? '전체 담당자' : performer(scope)}</p></div><button type="button" className="secondary-button" disabled={busy || loading} onClick={() => setAttempt(v => v+1)} aria-label="일간 기록 새로고침"><RefreshCw size={16}/></button></header>
    {assignee === 'unassigned' && <p className="work-help">담당자 미정 업무 보기입니다. 오른쪽 계획·수행은 전체 담당자를 표시합니다.</p>}
    {error && <p className="work-day-error" role="alert">{error} <button type="button" disabled={busy || loading} onClick={() => setAttempt(v => v+1)}>최신 기록 불러오기</button></p>}
    {notice && <p className="work-day-notice" role="status">{notice}</p>}
    {loading ? <p role="status" className="work-day-empty">일간 기록을 불러오는 중입니다.</p> : !scopedDay ? <p className="work-day-empty">일간 기록을 확인할 수 없어 계획·수행 입력을 잠시 사용할 수 없습니다. 위 오류 원인을 해결한 뒤 최신 기록을 불러와 주세요.</p> : <>
      <div className="work-day-legend"><span>보라 · 계획</span><span>초록 · 실제 수행</span></div>
      <div className="work-day-column-head"><span/><strong>계획 {plans.length}건</strong><strong>실제 수행 {executions.length}건</strong></div>
      {(['morning', 'afternoon', 'unknown'] as const).map(period => <div className="work-day-row" key={period}><span className="work-day-period">{workPeriods[period]}</span><div className="work-day-cell">{plans.filter(p => p.period === period).map(plan => {
        const recorded = executions.find(e => e.planId === plan.id);
        return <article key={plan.id} className="work-plan"><strong>{plan.snapshot.title}</strong><small>{performer(plan.assigneeId)} · {workCategoryLabels[plan.snapshot.category]}</small><div className="work-day-actions">{(['morning','afternoon'] as const).map(p => <button type="button" key={p} className={recorded?.period === p ? 'is-recorded' : ''} aria-pressed={recorded?.period === p} disabled={busy || plan.date > workToday()} onClick={() => void quickExecute(plan, p)}>{recorded?.period === p ? '✓ ' : ''}{workPeriods[p]}</button>)}<button type="button" disabled={busy} className="work-cancel" onClick={() => void act(async () => { retainPlan(await cancelWorkPlan(plan)); setNotice('계획을 취소했습니다. 기존 수행은 유지됩니다.'); })}>취소</button></div></article>;
      })}{!plans.some(p => p.period === period) && <small className="work-day-placeholder">계획 없음</small>}</div><div className="work-day-cell">{executions.filter(e => e.period === period).map(execution => <article key={execution.id} className="work-execution"><p>{execution.content}</p><small>{performer(execution.assigneeId)} · {execution.planId ? '계획에서 수행' : '직접 기록'}{execution.period === 'unknown' ? ' · 시간대 확인 필요' : ''}</small><div className="work-day-actions"><button type="button" disabled={busy} onClick={() => editExecution(execution)}>수행자·내용 수정</button><button type="button" disabled={busy} className="work-cancel" onClick={() => void act(async () => { retainExecution(await cancelWorkExecution(execution)); setNotice('수행을 취소했습니다. 계획과 업무 전체 상태는 유지됩니다.'); })}>취소</button></div></article>)}{!executions.some(e => e.period === period) && <small className="work-day-placeholder">수행 기록 없음</small>}</div></div>)}
      <div className="work-day-bottom"><button type="button" className="secondary-button" disabled={busy || !day} onClick={() => openEditor('manual')}>계획 없이 수행 남기기</button><p>수행 기록은 출근·근로시간이나 업무 전체 완료를 자동 확정하지 않습니다.</p></div>
      {(cancelledPlans.length > 0 || voidedExecutions.length > 0) && <details className="work-day-cancelled"><summary>취소된 기록 · 계획 {cancelledPlans.length}건 / 수행 {voidedExecutions.length}건</summary>{cancelledPlans.map(p => <p key={p.id}>계획 취소 · {performer(p.assigneeId)} · {p.snapshot.title}</p>)}{voidedExecutions.map(e => <p key={e.id}>수행 취소 · {performer(e.assigneeId)} · {e.content}</p>)}</details>}
    </>}
    <dialog ref={dialog} className="work-entry-dialog" onCancel={event => { if (busy) event.preventDefault(); else setEditor(null); }} onClose={() => { if (!busy) setEditor(null); }}>
      {editor && <form onSubmit={event => void saveEditor(event)}><div className="section-title-row"><h2>{editor.kind === 'plan' ? '계획에 넣기' : editor.kind === 'edit' ? '수행 내용 수정' : '실제로 한 일 남기기'}</h2><button type="button" className="icon-button" aria-label="기록 입력 닫기" disabled={busy} onClick={() => setEditor(null)}><X size={18}/></button></div><fieldset disabled={busy}><label>날짜<DateInput required max={editor.kind === 'plan' ? undefined : workToday()} disabled={editor.kind === 'edit'} value={editor.date} onChange={event => setEditor({ ...editor, date: event.target.value })}/></label><label>실제 수행자<select required value={editor.assigneeId} onChange={event => setEditor({ ...editor, assigneeId: event.target.value })}><option value="">담당자 선택</option>{context.assignees.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>시간대<select value={editor.period} onChange={event => setEditor({ ...editor, period: event.target.value as WorkPeriod })}>{Object.entries(workPeriods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{editor.kind !== 'plan' && <label>실제로 한 일<textarea required maxLength={5000} value={editor.content} onChange={event => setEditor({ ...editor, content: event.target.value })}/></label>}{editor.kind === 'manual' && !editor.task && <><label>센터 업무 분류<select value={editor.category} onChange={event => setEditor({ ...editor, category: event.target.value as WorkCategory })}>{Object.entries(workCategoryLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>관련자 (선택)<select multiple aria-label="직접 수행 관련자" value={editor.related.map(r => `${r.type}:${r.id}`)} onChange={event => setEditor({ ...editor, related: Array.from(event.target.selectedOptions).map(option => { const [type,...id] = option.value.split(':'); return { type: type as 'recipient' | 'worker', id: id.join(':') }; }) })}>{context.references.map(r => <option key={`${r.type}:${r.id}`} value={`${r.type}:${r.id}`}>{r.type === 'recipient' ? '수급자' : '근로자'} · {r.name} {r.info}</option>)}</select></label></>}</fieldset><p className="work-help">입력한 시각이 아닌 실제 수행일·시간대를 선택합니다. 수정에서는 날짜를 유지하며 실제 처리한 사람으로 수행자를 변경할 수 있습니다. 기록 작성자와 수정자는 별도로 보존됩니다.</p>{formError && <p ref={errorRef} tabIndex={-1} className="work-day-error" role="alert">{formError} 입력 내용은 유지됩니다.</p>}<div className="work-day-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setEditor(null)}>닫기</button><button type="submit" className="primary-button" disabled={busy}>{busy ? '저장 중…' : '저장'}</button></div></form>}
    </dialog>
  </section>;
});
export default WorkDayPanel;
