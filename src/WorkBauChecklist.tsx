import { useEffect, useState } from 'react';
import { requestJson } from './storage';
import type { TrafficRun } from '../shared/work-traffic.mjs';
import type { WorkContext } from './lib/work-tasks';

export default function WorkBauChecklist({ date, assignee, context, onChanged, refresh = 0, status = 'all', query = '' }: { date: string; assignee: string; context: WorkContext; onChanged: () => void; refresh?: number; status?: string; query?: string }) {
  const [runs, setRuns] = useState<TrafficRun[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    setRuns([]);
    void requestJson<{ runs: TrafficRun[] }>(`/api/work/task-maps?month=${date.slice(0,7)}`).then(data => { if(active) setRuns(data.runs); }).catch(error => { if(active) setError(error.message); });
    return () => { active = false; };
  }, [date, revision, refresh]);
  const matches = (run: TrafficRun, step: TrafficRun['steps'][number]) => (assignee === 'all' || (step.assigneeId || run.assigneeId) === assignee) && (status === 'all' || status === 'done' && Boolean(step.completedAt) || status === 'open' && !step.completedAt) && `${run.title} ${step.title} ${run.related.map(r=>r.name).join(' ')}`.toLowerCase().includes(query.toLowerCase());
  const selected = runs.filter(r => (r.date <= date || r.kind === 'monthly' && r.date.slice(0,7) === date.slice(0,7)) && (r.date === date || r.steps.some(s => !s.completedAt)) && r.steps.some(s=>matches(r,s)));
  async function check(run: TrafficRun, step: number) {
    setBusy(true); setError('');
    try {
      const updated = await requestJson<TrafficRun>(`/api/work/task-maps/runs/${run.id}/check`, { method: 'POST', body: JSON.stringify({ version: run.version, step }) });
      setRuns(previous => previous.map(r => r.id === updated.id ? updated : r)); onChanged();
    } catch(error) { setError(error instanceof Error ? error.message : '완료하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <section className="work-bau-checklist" aria-label="연계 업무 체크리스트">{error && <div role="alert" className="error-banner">{error}<button disabled={busy} onClick={()=>setRevision(n=>n+1)}>다시 불러오기</button></div>}{selected.length > 0 && <><h3>설계에서 생성된 업무 <small>{selected.length}묶음</small></h3>{selected.map(run => <details className="work-task-group work-bau-bundle" key={run.id}><summary>{run.title}<span>{run.steps.filter(s=>s.completedAt).length}/{run.steps.length}</span><small>{run.related.map(r=>r.name).join(', ') || run.date}</small></summary><div>{run.steps.map((s,i)=>matches(run,s)?<label className="work-bau-step" key={s.id ?? i}><input type="checkbox" checked={Boolean(s.completedAt)} disabled={busy || Boolean(s.completedAt)} onChange={()=>void check(run,i)}/><span>{s.title}<small>{context.assignees.find(a=>a.id===(s.assigneeId || run.assigneeId))?.name}{s.dueDate && ` · ${s.dueDate}`}{s.completedAt ? ' · 수행 기록됨' : ''}</small></span></label>:null)}</div></details>)}</>}</section>;
}
