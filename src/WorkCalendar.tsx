import { useEffect, useState } from 'react';
import { workAssigneeInitial, workCalendarRange, weeklyWorkRecords } from '../shared/work-calendar.mjs';
import { loadWorkCalendar, workCategoryLabels, workPeriods, workToday, type WorkCalendarData, type WorkContext } from './lib/work-tasks';

type Props = {
  context: WorkContext; date: string; view: 'week' | 'month'; assignee: string; revision: number;
  onOpenDay: (date: string, assignee: string) => void;
};
type Entry = { key: string; kind: 'plan' | 'execution' | 'deadline'; title: string; owner: string | null; detail: string };
const labels = { plan: '계획', execution: '수행', deadline: '마감' };
const weekdays = ['월', '화', '수', '목', '금', '토', '일'];

export default function WorkCalendar({ context, date, view, assignee, revision, onOpenDay }: Props) {
  const { from, to, dates } = workCalendarRange(date, view);
  const [result, setResult] = useState<WorkCalendarData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setResult(null);
    void loadWorkCalendar(from, to, assignee).then(data => { if (active) setResult(data); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '기간별 업무를 불러오지 못했습니다.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, assignee, revision, attempt]);
  // Do not paint the previous person's records during a filter/date transition.
  const data = result?.from === from && result.to === to && result.assignee === assignee ? result : null;
  const records = data && (view === 'week' ? weeklyWorkRecords(data) : data);
  const name = (id: string | null) => !id ? '담당자 미정' : context.assignees.find(m => m.id === id)?.name ?? context.members.find(m => m.id === id)?.name ?? '이전 구성원';
  const open = (day: string, owner: string | null) => onOpenDay(day, !owner ? 'unassigned' : context.assignees.some(m => m.id === owner) ? owner : 'all');
  const sticker = (owner: string | null) => assignee === 'all' && <span className="work-owner-sticker" title={name(owner)} aria-label={`담당 ${name(owner)}`}>{owner ? workAssigneeInitial(name(owner)) : '?'}</span>;
  const today = workToday();
  const inPeriod = (day: string) => view === 'week' || day.slice(0,7) === date.slice(0,7);
  return <section className={`work-calendar work-calendar-${view}`} aria-label={view === 'week' ? '주간 업무' : '월간 업무'}>
    <div className="work-calendar-heading"><div><h2>{view === 'week' ? '한 주의 흐름' : '한 달의 흐름'}</h2><p>{view === 'week' ? '이번 주에 수행 기록이 있으면 초록, 계획만 있으면 보라, 둘 다 없으면 마감일에 노랑으로 표시합니다. 담당자가 다르면 각자의 진행 상태를 보여줍니다.' : '마감은 기한, 계획은 예정, 수행은 실제 기록입니다.'} 날짜나 업무를 누르면 일간 화면으로 이동합니다.</p></div></div>
    {error && <div className="work-day-error" role="alert">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>다시 불러오기</button></div>}
    {loading && <p role="status">기간별 업무를 불러오는 중입니다.</p>}
    {data && records && <>
      <div className="work-calendar-summary" aria-label="기간별 표시 기록 수"><span className="is-plan">계획 <strong>{records.plans.filter(p => inPeriod(p.date)).length}</strong></span><span className="is-execution">수행 <strong>{records.executions.filter(e => inPeriod(e.date)).length}</strong></span><span className="is-deadline">마감 예정 <strong>{records.deadlines.filter(t => t.dueDate && inPeriod(t.dueDate)).length}</strong></span><small>{view === 'month' ? '선택한 달 기준입니다. 같은 업무의 계획·수행·마감은 각각 집계합니다.' : '이번 주에 표시된 기록 수입니다. 수행 기록이 업무 전체 완료를 뜻하지는 않습니다.'}</small></div>
      <div className="work-calendar-scroll"><div className="work-calendar-grid">
        {weekdays.map(day => <div key={day} className="work-calendar-weekday">{day}</div>)}
        {dates.map((day, index) => {
          const weekday = (new Date(day+'T12:00:00Z').getUTCDay()+6)%7;
          const entries: Entry[] = [
            ...records.deadlines.filter(t => t.dueDate === day).map(t => ({ key: `deadline:${t.id}`, kind: 'deadline' as const, title: t.title, owner: t.assigneeId, detail: workCategoryLabels[t.category] })),
            ...records.plans.filter(p => p.date === day).map(p => ({ key: `plan:${p.id}`, kind: 'plan' as const, title: p.snapshot.title, owner: p.assigneeId, detail: workPeriods[p.period] })),
            ...records.executions.filter(e => e.date === day).map(e => ({ key: `execution:${e.id}`, kind: 'execution' as const, title: e.content, owner: e.assigneeId, detail: workPeriods[e.period] }))
          ];
          return <div key={day} style={index === 0 ? { gridColumnStart: weekday+1 } : undefined} className={`work-calendar-cell ${day.slice(0,7) !== date.slice(0,7) && view === 'month' ? 'is-outside' : ''} ${day === today ? 'is-today' : ''}`}>
            <button type="button" className="work-calendar-date" aria-label={`${day} 일간 업무 열기`} onClick={() => onOpenDay(day, assignee)}><time dateTime={day}>{Number(day.slice(5,7))}/{Number(day.slice(8))}</time>{day === today && <small>오늘</small>}<span className="work-weekday-mobile">{weekdays[weekday]}</span></button>
            <div className="work-calendar-entries">{entries.map(entry => <button key={entry.key} type="button" className={`work-calendar-card is-${entry.kind}`} onClick={() => open(day, entry.owner)} aria-label={`${day} ${name(entry.owner)} ${labels[entry.kind]}: ${entry.title}. 일간에서 열기`}>
              {sticker(entry.owner)}<span className="work-calendar-card-meta">{labels[entry.kind]} · {entry.detail}</span><strong>{entry.title}</strong><small>{name(entry.owner)}</small>
            </button>)}{!entries.length && <span className="work-calendar-empty">등록된 기록 없음</span>}</div>
          </div>;
        })}
      </div></div>
      <section className="work-calendar-backlog"><h3>날짜를 정할 업무 <small>{data.unplanned.length}건</small></h3><p>진행 중이며 활성 계획이 없는 업무입니다. 다른 날짜에 계획된 업무는 여기에 나오지 않습니다.</p><div className="work-calendar-backlog-list">{data.unplanned.map(task => <button key={task.id} type="button" className="work-calendar-card is-plan" onClick={() => open(date, task.assigneeId)}>
        {sticker(task.assigneeId)}<span className="work-calendar-card-meta">{workCategoryLabels[task.category]}{task.dueDate ? ` · 기한 ${task.dueDate}` : ' · 기한 미정'}</span><strong>{task.title}</strong><small>{name(task.assigneeId)} · 일간에서 계획하기</small>
      </button>)}</div>{!data.unplanned.length && <p>계획이 없는 진행 업무가 없습니다.</p>}</section>
    </>}
  </section>;
}
