import './NavigationTabs.css';
import './WorkHub.css';
import './CenterWork.css';
import { useEffect, useRef, useState } from 'react';
import WorkTaskMap from './WorkTaskMap';
import WorkQuickMemos from './WorkQuickMemos';
import WorkRecurrenceSettings from './WorkRecurrenceSettings';
import { loadWorkContext, workToday, type WorkContext } from './lib/work-tasks';

const sections = [
  { id: 'board', label: '이 달의 할 일' },
  { id: 'map', label: '업무전체지도' },
  { id: 'design', label: '업무연관설계(태스크맵)' }
] as const;
type Section = typeof sections[number]['id'];

export default function WorkHub() {
  const [section, setSection] = useState<Section>('board');
  const [context, setContext] = useState<WorkContext | null>(null);
  const [design, setDesign] = useState<'map' | 'repeat' | 'legacy'>('map');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [month, setMonth] = useState(() => workToday().slice(0, 7));
  const [draft, setDraft] = useState({ title: '', relatedName: '' });
  const memoRequest = useRef<{ title: string; relatedName: string; id: string } | null>(null);

  useEffect(() => {
    if (section === 'board') return;
    let active = true;
    setError('');
    void loadWorkContext(attempt > 0).then(value => { if (active) setContext(value); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '업무 정보를 불러오지 못했습니다.'); });
    return () => { active = false; };
  }, [section, attempt]);

  function changeSection(next: Section) {
    if (dirty && !window.confirm('작성 중인 설정을 닫고 이동할까요?')) return;
    setDirty(false);
    setSection(next);
  }

  return <section className={`work-hub ${section === 'design' ? 'is-system' : ''}`} aria-label="공동 업무">
    <div className="work-day-navigation app-navigation-bar">
      <strong>센터업무(할일)</strong>
      <nav className="work-view-tabs work-primary-tabs app-navigation-tabs" aria-label="센터 업무">
        {sections.map(item => <button key={item.id} type="button" disabled={busy}
          aria-current={section === item.id ? 'page' : undefined} onClick={() => changeSection(item.id)}>{item.label}</button>)}
      </nav>
    </div>

    <WorkQuickMemos key={month} active={section === 'board'} month={month} onMonthChange={setMonth}
      draft={draft} setDraft={setDraft} request={memoRequest} onBusy={setBusy}/>

    {section !== 'board' && error && <p role="alert">{error} <button type="button" className="secondary-button"
      onClick={() => setAttempt(value => value + 1)}>다시 불러오기</button></p>}
    {section !== 'board' && !context && !error && <p role="status">업무 정보를 불러오는 중입니다.</p>}
    {context && section === 'map' && <WorkTaskMap onBusy={setBusy} context={context} date={workToday()} onChanged={() => {}}/>}
    {context && section === 'design' && <>
      <nav className="work-secondary-tabs app-navigation-tabs" aria-label="설계 종류">
        {([['map', '월간·사건형 업무 설계'], ['repeat', '매일 반복업무'], ['legacy', '기존 반복 규칙']] as const).map(([key, label]) =>
          <button key={key} type="button" disabled={busy || dirty} aria-current={design === key ? 'page' : undefined}
            onClick={() => setDesign(key)}>{label}</button>)}
      </nav>
      {design === 'legacy'
        ? <WorkRecurrenceSettings context={context} onChanged={() => setAttempt(value => value + 1)} onBusy={setBusy} onDirty={setDirty}/>
        : <WorkTaskMap key={design} mode="design" initialKind={design === 'repeat' ? 'daily' : 'monthly'}
            context={context} date={workToday()} onChanged={() => {}} onBusy={setBusy} onDirty={setDirty}/>}
    </>}
  </section>;
}
