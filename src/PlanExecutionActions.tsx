import { useState } from 'react';
import DateInput from './DateInput';
import { workToday, workPeriods, type WorkPlan, type WorkExecution, type WorkPeriod } from './lib/work-tasks';

export default function PlanExecutionActions({ plan, recorded, busy, onExecute, onEdit }: {
  plan: WorkPlan; recorded?: WorkExecution; busy: boolean;
  onExecute: (period: WorkPeriod, date: string) => void; onEdit: (execution: WorkExecution) => void;
}) {
  const today = workToday();
  const [mode, setMode] = useState<'today' | 'plan' | 'custom' | null>(null);
  const [date, setDate] = useState(today);
  const target = mode === 'plan' ? plan.date : mode === 'custom' ? date : today;
  return <div className="work-plan-execute">
    {recorded ? <><small className="work-recorded-date">✓ {recorded.date} · {workPeriods[recorded.period]} 수행</small><button type="button" disabled={busy} onClick={() => onEdit(recorded)}>수행일·처리자 수정</button></> : <>
      {plan.date === today ? <div className="work-day-actions">{(['morning', 'afternoon'] as const).map(period => <button key={period} type="button" disabled={busy} onClick={() => onExecute(period, today)}>오늘 {workPeriods[period]} 수행</button>)}</div> : <div className="work-day-actions"><button type="button" className="work-today-execute" disabled={busy} aria-expanded={mode === 'today'} onClick={() => setMode(mode === 'today' ? null : 'today')}>오늘 수행</button><button type="button" disabled={busy || plan.date > today} aria-expanded={mode === 'plan'} onClick={() => setMode(mode === 'plan' ? null : 'plan')}>{plan.date.slice(5).replace('-', '/')}에 수행</button></div>}
      <button type="button" disabled={busy} aria-expanded={mode === 'custom'} onClick={() => setMode(mode === 'custom' ? null : 'custom')}>다른 날짜</button>
      {mode && <div className="work-plan-date-entry"><label>실제 수행일{mode === 'custom' ? <DateInput required aria-label="실제 수행일" value={date} max={today} onChange={event => setDate(event.target.value)}/> : <strong>{target}</strong>}</label><div className="work-day-actions">{(['morning', 'afternoon'] as const).map(period => <button key={period} type="button" disabled={busy || !target || target > today} onClick={() => onExecute(period, target)}>{workPeriods[period]} 수행 저장</button>)}<button type="button" disabled={busy} onClick={() => setMode(null)}>닫기</button></div></div>}
    </>}
  </div>;
}
