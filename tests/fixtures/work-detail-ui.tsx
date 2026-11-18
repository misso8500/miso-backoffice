import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WorkHub from '../../src/WorkHub';
import WorkDayPanel from '../../src/WorkDayPanel';
import WorkCalendar from '../../src/WorkCalendar';
import WorkTaskDetails from '../../src/WorkTaskDetails';
import WorkOperationStatus from '../../src/WorkOperationStatus';
import { completeWorkTask, loadWorkContext, loadWorkTasks, type WorkContext, type WorkTask } from '../../src/lib/work-tasks';
import '../../src/styles.css';
import '../../src/dev-workspace.css';

function RecordFixture({ calendar }: { calendar: boolean }) {
  const [context, setContext] = useState<WorkContext | null>(null);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [date, setDate] = useState('2026-10-26');
  const [view, setView] = useState<'week' | 'month'>('week');
  const [selected, setSelected] = useState('');
  const [undo, setUndo] = useState<WorkTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    void loadWorkContext().then(setContext);
    if (calendar) void loadWorkTasks().then(setTasks);
  }, [calendar]);
  const save = (task: WorkTask) => {
    setTasks(previous => previous.map(item => item.id === task.id ? task : item));
    setRevision(previous => previous + 1);
  };
  if (!context) return null;
  const task = tasks.find(item => item.id === selected);
  return <div className={`work-hub ${task ? 'has-detail is-period' : ''}`}>
    <label>기준 날짜<input type="date" value={date} onChange={event => setDate(event.target.value)}/></label>
    {calendar ? <>
      <button type="button" aria-current={view === 'week' ? 'page' : undefined} onClick={() => setView('week')}>주간</button>
      <button type="button" aria-current={view === 'month' ? 'page' : undefined} onClick={() => setView('month')}>월간</button>
      <WorkCalendar context={context} tasks={tasks} date={date} view={view} assignee="all" revision={revision}
        busy={busy} editing={editing} selectedId={selected} onOpenTask={item => setSelected(item.id)}
        onSelectDate={() => {}} onOpenDay={setDate}
        onComplete={item => void completeWorkTask(item).then(saved => { save(saved); setUndo(saved); })}/>
      {undo && <button type="button" onClick={() => void completeWorkTask(undo, true).then(saved => { save(saved); setUndo(null); })}>완료 되돌리기</button>}
      {task && <div className="work-detail-slot"><aside className="work-task-detail work-detail-sidebar" aria-label="선택한 업무 상세">
        <button type="button" aria-label="업무 상세 닫기" onClick={() => setSelected('')}>닫기</button>
        <WorkTaskDetails key={task.id} task={task} context={context} activity={null} disabled={busy}
          onSaved={save} onPlansChanged={() => {}} onReferenceCreated={() => {}} onBusy={setBusy} onEditing={setEditing}/>
      </aside></div>}
    </> : <WorkDayPanel context={context} date={date} assignee="all" onActivity={() => {}} onBusy={setBusy} onReady={() => {}}/>}
  </div>;
}
const fixture = new URLSearchParams(location.search).get('fixture');
createRoot(document.getElementById('root')!).render(<div className="sidebar-preview"><main className="main-content"><WorkOperationStatus compact/>
  {fixture ? <RecordFixture calendar={fixture === 'calendar'}/> : <WorkHub/>}
</main></div>);
