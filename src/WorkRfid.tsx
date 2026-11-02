import PageHeading from './PageHeading';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { requestJson } from './storage';
import { workToday } from './lib/work-tasks';
import { moveWorkCalendar } from '../shared/work-calendar.mjs';
import { rfidMonthDates, rfidScheduled, type RfidDocument, type RfidRecipient, type RfidSettings } from '../shared/work-rfid.mjs';
import './WorkRfid.css';

type Month = { month: string; rows: RfidRecipient[] };
const failure = (e: unknown) => e instanceof Error ? e.message : 'RFID 내역을 저장하지 못했습니다.';
const patternLabels = { weekdays: '평일', monSat: '월~토', custom: '지정일' };

function RfidWorkspace({ row, month, onSaved, onBusy }: { row: RfidRecipient; month: string; onSaved: (doc: RfidDocument) => void; onBusy: (busy: boolean) => void }) {
  const [settings, setSettings] = useState(row.document.settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [date, setDate] = useState('');
  const [draft, setDraft] = useState({ checked: false, note: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const lock = useRef(false);
  const dates = rfidMonthDates(month), today = workToday();
  const savedDay = row.document.records[date] ?? { checked: false, note: '' };
  const settingsDirty = JSON.stringify(settings) !== JSON.stringify(row.document.settings);
  const dayDirty = draft.checked !== savedDay.checked || draft.note !== savedDay.note;
  const dirty = settingsDirty || dayDirty;
  useEffect(() => { onBusy(busy || dirty); return () => onBusy(false); }, [busy, dirty, onBusy]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const scheduled = dates.filter(d => rfidScheduled(d, row.document.settings, row));
  const checked = scheduled.filter(d => row.document.records[d]?.checked).length;
  const extra = dates.filter(d => !scheduled.includes(d) && row.document.records[d]?.checked).length;
  function selectDate(next: string) {
    if (busy || next === date) return;
    if (dayDirty && !window.confirm('저장하지 않은 일자별 변경을 버리고 이동할까요?')) return;
    setDate(next); setDraft(row.document.records[next] ?? { checked: false, note: '' }); setError(''); setNotice('');
  }
  async function save(kind: 'settings' | 'day', next = draft) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const value = await requestJson<{ document: RfidDocument }>(`/api/work/rfid?month=${month}`, { method: 'PUT', body: JSON.stringify({ kind, recipientId: row.id, version: row.document.version, ...(kind === 'settings' ? { settings } : { date, checked: next.checked, note: next.note }) }) });
      onSaved(value.document);
      if (kind === 'settings') setSettings(value.document.settings);
      else setDraft(value.document.records[date]);
      setNotice(kind === 'settings' ? '이 달의 서비스 정보를 저장했습니다.' : `${date} ${next.checked ? 'RFID 확인 완료' : '확인 전'} · 저장했습니다.`);
    } catch (e) { setError(failure(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function reloadLatest() {
    if (lock.current || !window.confirm('저장하지 않은 변경을 버리고 최신 RFID 내역을 불러올까요?')) return;
    lock.current = true; setBusy(true);
    try {
      const value = await requestJson<Month>(`/api/work/rfid?month=${month}`);
      const latest = value.rows.find(r => r.id === row.id)?.document;
      if (!latest) throw new Error('수급자 내역을 찾을 수 없습니다.');
      onSaved(latest); setSettings(latest.settings); setDraft(latest.records[date] ?? { checked: false, note: '' }); setError(''); setNotice('최신 내역을 불러왔습니다.');
    } catch (e) { setError(failure(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  function updateSettings<K extends keyof RfidSettings>(key: K, value: RfidSettings[K]) { setSettings(old => ({ ...old, [key]: value })); }
  const offset = new Date(`${month}-01T12:00:00Z`).getUTCDay();
  return <div className="rfid-workspace">
    <button className="rfid-settings-toggle" type="button" disabled={busy} aria-expanded={settingsOpen} aria-controls={`rfid-settings-${row.id}`} onClick={() => setSettingsOpen(open => !open)}><span>서비스 정보 <small>{patternLabels[row.document.settings.pattern]} · 총 {row.document.settings.totalDays ?? '—'}일 / {row.document.settings.totalHours ?? '—'}시간{settingsDirty ? ' · 변경됨' : ''}</small></span><ChevronDown size={18} className={settingsOpen ? 'is-open' : ''}/></button>
    <div id={`rfid-settings-${row.id}`} className={`rfid-collapse ${settingsOpen ? 'is-open' : ''}`} inert={!settingsOpen}><div className="rfid-collapse-clip"><form className="rfid-settings" onSubmit={e => { e.preventDefault(); void save('settings'); }}>
      <p>수급자별·월별 서비스 정보입니다. 근무 유형으로 달력의 예정일을 표시합니다.</p>
      <fieldset disabled={busy}><div className="rfid-settings-fields"><label>총 근무일<input type="number" min="0" max={dates.length} step="1" value={settings.totalDays ?? ''} onChange={e => updateSettings('totalDays', e.target.value === '' ? null : Number(e.target.value))} placeholder="일"/></label><label>총 근무시간<input type="number" min="0" max={dates.length * 24} step="0.25" value={settings.totalHours ?? ''} onChange={e => updateSettings('totalHours', e.target.value === '' ? null : Number(e.target.value))} placeholder="시간"/></label><label>근무 유형<select value={settings.pattern} onChange={e => updateSettings('pattern', e.target.value as RfidSettings['pattern'])}>{Object.entries(patternLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      {settings.pattern === 'custom' && <div className="rfid-custom-dates" role="group" aria-label="지정 근무일 선택">{dates.map(d => <button type="button" aria-pressed={settings.dates.includes(d)} key={d} onClick={() => updateSettings('dates', settings.dates.includes(d) ? settings.dates.filter(x => x !== d) : [...settings.dates, d])}>{Number(d.slice(-2))}</button>)}</div>}
      <label>서비스 내용<textarea maxLength={5000} rows={2} value={settings.notes} onChange={e => updateSettings('notes', e.target.value)} placeholder="예: 오전 방문, 월·수·금 3시간 / 특이사항"/></label>
      </fieldset><div className="rfid-actions"><button type="button" className="secondary-button" disabled={busy || !settingsDirty} onClick={() => setSettings(row.document.settings)}>변경 취소</button><button type="submit" className="primary-button" disabled={busy || !settingsDirty}>{busy ? '저장 중…' : '서비스 정보 저장'}</button></div>
    </form></div></div>
    <div className="rfid-month-summary"><strong>예정 {scheduled.length}일</strong><span className="is-done">확인 {checked}일</span><span>남음 {scheduled.length - checked}일</span>{extra > 0 && <span>예정 외 확인 {extra}일</span>}<small>예정일은 근무 유형과 서비스 계약 기간 기준</small></div>
    {error && <div className="work-day-error" role="alert">{error}<button type="button" className="secondary-button" disabled={busy} onClick={() => void reloadLatest()}>최신 내역 불러오기</button></div>}{notice && <p className="rfid-notice" role="status">{notice}</p>}
    <div className={`rfid-calendar-layout ${date ? 'has-editor' : ''}`}>
      <section className="rfid-calendar" aria-label={`${row.name} ${month} RFID 달력`}><div className="rfid-calendar-heading"><h3>{Number(month.slice(5))}월 RFID 체크</h3><small>날짜를 눌러 확인·비고 작성</small></div><div className="rfid-calendar-grid">
        {['일', '월', '화', '수', '목', '금', '토'].map((label, i) => <span className={`rfid-weekday day-${i}`} key={label}>{label}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`} aria-hidden="true"/>)}
        {dates.map(d => { const record = row.document.records[d], planned = scheduled.includes(d); return <button type="button" key={d} disabled={busy} className={`rfid-date ${planned ? 'is-scheduled' : ''} ${record?.checked ? 'is-checked' : ''} ${d === date ? 'is-selected' : ''} ${d === today ? 'is-today' : ''}`} aria-pressed={d === date} aria-label={`${d} ${record?.checked ? '확인 완료' : planned ? '확인 전' : '예정 없음'}${record?.note ? ' 비고 있음' : ''}`} onClick={() => selectDate(d)}><span>{Number(d.slice(-2))}{d === today && <small>오늘</small>}</span><strong>{record?.checked ? <><Check size={14}/>확인</> : planned ? '확인 전' : '—'}</strong>{record?.note && <small className="rfid-note-dot">비고</small>}</button>; })}
      </div><div className="rfid-calendar-legend"><span>보라 · 예정</span><span>초록 · 확인 완료</span><span>비고 · 작성 내역 있음</span></div></section>
      <div className="rfid-editor-slide" inert={!date}><div className="rfid-editor-clip"><aside className="rfid-day-editor" aria-label="RFID 업무내역 작성"><header><div><small>{row.name} · RFID 업무내역</small><h3>{date || '날짜 선택'}</h3></div><button className="icon-button" type="button" disabled={busy} aria-label="RFID 업무내역 닫기" onClick={() => selectDate('')}><X size={18}/></button></header>{date && <form onSubmit={e => { e.preventDefault(); void save('day'); }}>
        <p className="rfid-day-hint">{scheduled.includes(date) ? '서비스 예정일입니다.' : '서비스 예정 외 날짜입니다. 필요하면 확인 내역을 남길 수 있습니다.'}</p>
        <label className={`rfid-check-action ${draft.checked ? 'is-checked' : ''}`}><input type="checkbox" checked={draft.checked} disabled={busy || date > today} onChange={e => { const next = { ...draft, checked: e.target.checked }; setDraft(next); void save('day', next); }}/><span><strong>RFID 확인 완료</strong><small>{busy ? '저장 중…' : '체크하면 비고와 함께 즉시 저장'}</small></span></label>
        {date > today && <p className="rfid-day-hint">미래 날짜는 비고만 작성할 수 있습니다.</p>}
        <label className="rfid-note-label">비고 <small>선택</small><textarea value={draft.note} disabled={busy} maxLength={5000} rows={6} placeholder="누락, 시간 차이 등 확인이 필요한 내용을 적어 주세요." onChange={e => setDraft(old => ({ ...old, note: e.target.value }))} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void save('day'); } }}/></label>
        <div className="rfid-actions"><button type="button" className="secondary-button" disabled={busy || !dayDirty} onClick={() => setDraft(savedDay)}>변경 취소</button><button type="submit" className="primary-button" disabled={busy || !dayDirty}>{busy ? '저장 중…' : '비고·내역 저장'}</button></div><small className="rfid-save-hint">{dayDirty ? '저장하지 않은 변경이 있습니다.' : '저장된 내역입니다.'} · Ctrl+Enter로 저장</small>
      </form>}</aside></div></div>
    </div>
  </div>;
}

export default function WorkRfid({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const [month, setMonth] = useState(workToday().slice(0, 7)), [data, setData] = useState<Month | null>(null);
  const [selected, setSelected] = useState(''), [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => {
    const reset = () => { setData(null); setSelected(''); setVisited(new Set()); setBusy(false); setRevision(n => n + 1); };
    window.addEventListener('miso-work-session-change', reset);
    return () => window.removeEventListener('miso-work-session-change', reset);
  }, []);
  useEffect(() => { let active = true; setLoading(true); setError(''); setData(null); void requestJson<Month>(`/api/work/rfid?month=${month}`).then(value => { if (active) setData(value); }).catch(e => { if (active) setError(failure(e)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [month, revision]);
  function leave() { return !busy || window.confirm('저장하지 않은 변경을 버리고 이동할까요?'); }
  function changeMonth(value: string) { if (/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value) && value !== month && leave()) { setMonth(value); setSelected(''); setVisited(new Set()); setBusy(false); } }
  const rows = (data?.rows ?? []).filter(r => `${r.name} ${r.operationalName}`.includes(query.trim()) && (filter === 'all' || r.selected));
  return <section className="work-rfid" aria-label="RFID 업무 관리"><PageHeading title="RFID 업무 관리" description="수급자별 서비스 일정과 한 달의 확인 내역을 함께 관리합니다."><button type="button" className="secondary-button" disabled={loading || busy} onClick={() => setRevision(n => n + 1)}><RefreshCw size={16}/>새로고침</button></PageHeading>
    <div className="rfid-toolbar"><div className="rfid-month-picker"><button className="secondary-button" aria-label="RFID 이전 달" disabled={busy || loading || month === '1000-01'} onClick={() => changeMonth(moveWorkCalendar(`${month}-01`, 'month', -1).slice(0, 7))}><ChevronLeft size={18}/></button><label>조회 월<input type="month" min="1000-01" max="9999-12" value={month} disabled={busy || loading} onChange={e => changeMonth(e.target.value)}/></label><button className="secondary-button" aria-label="RFID 다음 달" disabled={busy || loading || month === '9999-12'} onClick={() => changeMonth(moveWorkCalendar(`${month}-01`, 'month', 1).slice(0, 7))}><ChevronRight size={18}/></button></div><label>수급자 검색<input type="search" placeholder="이름·운영상 표기" value={query} disabled={busy} onChange={e => setQuery(e.target.value)}/></label><label>대상<select value={filter} disabled={busy} onChange={e => setFilter(e.target.value)}><option value="all">전체 수급자</option><option value="service">이 달의 서비스 수급자</option></select></label></div>
    <p className="rfid-guidance">수급자를 펼치면 월간 달력이 나타납니다. 서비스 대상 선택은 방문요양 서비스 관리와 연결되며, 근무일·시간·유형은 이 화면에서 월별로 저장합니다.</p>
    {error && <p className="work-day-error" role="alert">{error}<button className="secondary-button" onClick={() => setRevision(n => n + 1)}>다시 불러오기</button></p>}
    {loading ? <p role="status">RFID 월간 내역을 불러오는 중입니다.</p> : <div className="rfid-recipients">{rows.map(row => { const open = selected === row.id, count = Object.values(row.document.records).filter(r => r.checked).length; return <section key={row.id} className={`rfid-recipient ${open ? 'is-open' : ''}`}><button type="button" className="rfid-recipient-toggle" aria-expanded={open} aria-controls={`rfid-recipient-${row.id}`} disabled={busy} onClick={() => { if (leave()) { setVisited(old => new Set([...old, row.id])); setSelected(open ? '' : row.id); setBusy(false); } }}><span className="rfid-avatar">{row.name.slice(0, 1)}</span><span><strong>{row.name}</strong><small>{row.operationalName || '방문요양'} · {row.selected ? '이 달 서비스 대상' : '서비스 대상 미선택'}{!row.enabled ? ' · 비활성' : ''}</small></span><span className="rfid-recipient-count">확인 {count}일</span><ChevronDown size={20} className={open ? 'is-open' : ''}/></button><div id={`rfid-recipient-${row.id}`} className={`rfid-collapse ${open ? 'is-open' : ''}`} inert={!open}><div className="rfid-collapse-clip">{visited.has(row.id) && <RfidWorkspace key={`${month}:${row.id}:${revision}`} row={row} month={month} onBusy={setBusy} onSaved={doc => setData(old => old ? { ...old, rows: old.rows.map(r => r.id === row.id ? { ...r, document: doc } : r) } : old)}/>}</div></div></section>; })}{!rows.length && <p className="empty-state">{data?.rows.length ? '조건에 맞는 수급자가 없습니다.' : '등록된 수급자가 없습니다.'}</p>}</div>}
  </section>;
}
