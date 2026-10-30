import { useEffect, useRef, useState } from 'react';
import { workCache } from './lib/work-cache';
import { useWorkCacheUpdates } from './lib/use-work-cache';
import { workCalendarRange } from '../shared/work-calendar.mjs';
import { calendarDayEntries, type CalendarEntry } from '../shared/work-calendar-entries.mjs';
import { loadWorkCalendar, workToday, type WorkCalendarData, type WorkContext, type WorkTask } from './lib/work-tasks';

type Props = {
  context: WorkContext; tasks: WorkTask[]; date: string; view: 'week' | 'month'; assignee: string; revision: number; busy: boolean; editing: boolean; selectedId: string;
  onOpenTask: (task: WorkTask, date: string) => void; onComplete: (task: WorkTask) => void; onOpenDay: (date: string, assignee: string) => void;
  onSelectDate: (date: string) => void;
};
const labels = { plan: '계획', execution: '수행', deadline: '마감' };
const weekdays = ['월', '화', '수', '목', '금', '토', '일'];
export default function WorkCalendar({ context, tasks, date, view, assignee, revision, busy, editing, selectedId, onOpenTask, onComplete, onOpenDay, onSelectDate }: Props) {
  const { from, to, dates } = workCalendarRange(date, view);
  const cachePath=`/api/work/calendar?${new URLSearchParams({from,to,assignee})}`;
  const [result, setResult] = useState<WorkCalendarData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [expandedDay, setExpandedDay] = useState('');
  const [query, setQuery] = useState('');
  const agenda = useRef<HTMLElement>(null);
  useWorkCacheUpdates<WorkCalendarData>(cachePath,setResult);
  useEffect(() => {
    if (expandedDay) requestAnimationFrame(() => agenda.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  }, [expandedDay]);
  useEffect(() => {
    const cached=workCache.peek<WorkCalendarData>(cachePath);
    let active = true; setLoading(!cached); setError(''); setResult(cached ?? null);
    void loadWorkCalendar(from, to, assignee).then(data => { if (active) setResult(data); }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '업무를 불러오지 못했습니다.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, assignee, revision, attempt]);
  useEffect(() => { setExpandedDay(''); }, [from, to, view, assignee]);
  const data = result?.from === from && result.to === to && result.assignee === assignee ? result : null;
  const name = (id: string | null) => !id ? '담당자 미정' : context.assignees.find(m => m.id === id)?.name ?? context.members.find(m => m.id === id)?.name ?? '이전 구성원';
  const matches = (title: string, owner: string | null, task?: WorkTask | null) => `${title} ${name(owner)} ${task?.related.map(r => r.name).join(' ') ?? ''}`.toLowerCase().includes(query.trim().toLowerCase());
  const entriesOn = (day: string) => data ? calendarDayEntries(data, tasks, day).filter(e => matches(e.title, e.owner, e.task)) : [];
  const inPeriod = (day: string) => view === 'week' || day.slice(0, 7) === date.slice(0, 7);
  function expand(day: string) { setExpandedDay(day); onSelectDate(day); }
  function renderEntry(entry: CalendarEntry, day: string) {
    const kind = entry.kinds.includes('execution') ? 'execution' : entry.kinds.includes('plan') ? 'plan' : entry.kinds.includes('deadline') ? 'deadline' : 'unplanned', task = entry.task;
    return <div key={entry.key} className={`work-calendar-item is-${kind} ${selectedId && selectedId === entry.taskId ? 'is-selected' : ''} ${task?.status === 'done' ? 'is-done' : ''}`}>
      {task && <input type="checkbox" aria-label={`${task.title} ${task.status === 'done' ? '완료 되돌리기' : '완료하기'}`} checked={task.status === 'done'} disabled={Boolean(task.onHold) || busy || editing || !task.canEdit || task.status === 'cancelled'} onChange={() => onComplete(task)}/>}
      <button type="button" className="work-calendar-item-title" disabled={busy} onClick={() => task ? onOpenTask(task, day) : onOpenDay(day, context.assignees.some(p => p.id === entry.owner) ? entry.owner! : 'all')} aria-label={`${day} ${entry.title} ${task ? '상세 열기' : '수행 기록 열기'}`}><strong>{entry.title}</strong><span className="work-calendar-item-meta">{entry.kinds.map(k => <small key={k} className={`is-${k}`}>{labels[k]}</small>)}<span>{name(entry.owner)}</span>{task?.status === 'done' && <span>완료</span>}</span></button>
    </div>;
  }
  return <section className={`work-calendar work-calendar-${view} work-calendar-compact`} aria-label={view === 'week' ? '주간 업무' : '월간 업무'}>
    <div className="work-calendar-heading"><h2>{view === 'week' ? '한 주의 할 일' : '한 달의 할 일'}</h2><p>업무를 눌러 상세를 확인하고 체크해서 완료하세요. 계획·수행·마감은 각각의 날짜에 표시됩니다.</p></div>
    <input type="search" className="work-calendar-search" aria-label="달력 업무 검색" placeholder="업무·담당자·관련자 검색" value={query} onChange={event => setQuery(event.target.value)}/>
    {error && <div className="work-day-error" role="alert">{error} <button type="button" onClick={() => setAttempt(v => v + 1)}>다시 불러오기</button></div>}
    {loading && <p role="status">기간별 업무를 불러오는 중입니다.</p>}
    {data && <>
      <div className="work-calendar-summary"><span className="is-plan">계획 {data.plans.filter(p => p.status === 'planned' && inPeriod(p.date)).length}</span><span className="is-execution">수행 {data.executions.filter(e => e.status === 'recorded' && inPeriod(e.date)).length}</span><span className="is-deadline">마감 {data.deadlines.filter(t => t.dueDate && inPeriod(t.dueDate)).length}</span><small>수행 기록과 업무 전체 완료는 구분됩니다.</small></div>
      <div className="work-calendar-scroll"><div className="work-calendar-grid">{weekdays.map(day => <div key={day} className="work-calendar-weekday">{day}</div>)}{dates.map((day, index) => {
        const weekday = (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7, entries = entriesOn(day), limit = view === 'month' ? 3 : 6;
        return <div key={day} style={index === 0 ? { gridColumnStart: weekday + 1 } : undefined} className={`work-calendar-cell ${!inPeriod(day) ? 'is-outside' : ''} ${day === workToday() ? 'is-today' : ''} ${expandedDay === day ? 'is-expanded-day' : ''}`}><button type="button" className="work-calendar-date" aria-label={`${day} 업무 모아보기`} aria-pressed={expandedDay === day} onClick={() => expand(day)}><time dateTime={day}>{Number(day.slice(5, 7))}/{Number(day.slice(8))}</time><span className="work-weekday-mobile">{weekdays[weekday]}</span><small>{day === workToday() ? '오늘' : ''} {entries.length ? `${entries.length}건` : ''}</small></button><div className="work-calendar-entries">{entries.slice(0, limit).map(e => renderEntry(e, day))}{!entries.length && <span className="work-calendar-empty">—</span>}</div>{entries.length > limit && <button type="button" className="work-calendar-more" onClick={() => expand(day)}>{entries.length - limit}개 더 보기</button>}</div>;
      })}</div></div>
      {expandedDay && <section ref={agenda} className="work-calendar-agenda" aria-label={`${expandedDay} 업무 모아보기`}><div className="section-title-row"><h3>{expandedDay} <small>{entriesOn(expandedDay).length}건</small></h3><button type="button" className="secondary-button" onClick={() => onOpenDay(expandedDay, assignee)}>일간에서 보기</button><button type="button" className="secondary-button" onClick={() => setExpandedDay('')}>접기</button></div>{entriesOn(expandedDay).map(e => renderEntry(e, expandedDay))}{!entriesOn(expandedDay).length && <p>등록된 업무가 없습니다.</p>}</section>}
      <section className="work-calendar-backlog"><h3>날짜를 정할 업무</h3><div className="work-calendar-backlog-list">{data.unplanned.filter(row => matches(row.title, row.assigneeId, tasks.find(t => t.id === row.id))).map(row => renderEntry({ key: row.id, taskId: row.id, owner: row.assigneeId, title: row.title, kinds: [], task: tasks.find(t => t.id === row.id) ?? null }, date))}</div>{!data.unplanned.length && <p>날짜를 정하지 않은 업무가 없습니다.</p>}</section>
    </>}
  </section>;
}
