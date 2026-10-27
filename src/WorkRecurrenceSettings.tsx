import { useEffect, useRef, useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { requestJson } from './storage';
import { recurrenceDates, recurrenceTitle, recurrenceToday } from '../shared/work-recurrence.mjs';
import { workCategoryLabels, type WorkContext } from './lib/work-tasks';

type Rule = { id?: string; ownerId?: string; assigneeId: string; title: string; description: string; category: string; kind: 'monthly' | 'daily'; dueDay: number; includeSaturday: boolean; includeSunday: boolean; includeLeave: boolean; active: boolean; startMonth?: string; version?: number; requestId?: string };
type Category = { id: string; name: string; active: number; version: number };
const blank = (): Rule => ({ title: '', description: '', assigneeId: '', category: 'unclassified', kind: 'monthly', dueDay: 1, includeSaturday: false, includeSunday: false, includeLeave: true, active: true, requestId: crypto.randomUUID() });
const errorText = (error: unknown) => error instanceof Error ? error.message : '설정을 저장하지 못했습니다.';

export default function WorkRecurrenceSettings({ context, onChanged, onBusy, onDirty }: { context: WorkContext; onChanged: () => void; onBusy: (value: boolean) => void; onDirty: (value: boolean) => void }) {
  const [rules, setRules] = useState<Rule[]>([]), [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<Rule>(blank), [month, setMonth] = useState(recurrenceToday().slice(0, 7));
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [categoryName, setCategoryName] = useState(''), [categoryEdit, setCategoryEdit] = useState<Category | null>(null), [canManage, setCanManage] = useState(false);
  const [section, setSection] = useState<'rules' | 'categories'>('rules');
  const [leaveLinked, setLeaveLinked] = useState<string[]>([]);
  const lock = useRef(false), generation = useRef(0);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => { onDirty(Boolean(form.title || form.description || form.assigneeId || categoryName)); return () => onDirty(false); }, [form, categoryName, onDirty]);
  async function reload() {
    const run = ++generation.current; setLoading(true); setError('');
    try {
      const [recurrence, catalog] = await Promise.all([requestJson<{rules: Rule[]; month: string; leaveLinkedAssignees?: string[]}>('/api/work/recurrences'), requestJson<{categories: Category[]; canManage: boolean}>('/api/work/categories')]);
      if (run !== generation.current) return;
      setRules(recurrence.rules); setMonth(recurrence.month); setCategories(catalog.categories); setCanManage(catalog.canManage); setLeaveLinked(recurrence.leaveLinkedAssignees ?? []);
    } catch (cause) { if (run === generation.current) setError(errorText(cause)); }
    finally { if (run === generation.current) setLoading(false); }
  }
  useEffect(() => { void reload(); return () => { generation.current++; }; }, []);
  async function act(action: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); onChanged(); } catch (cause) { setError(errorText(cause)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); await act(async () => {
      const value = await requestJson<{rule: Rule; created: number}>(`/api/work/recurrences${form.id ? `/${form.id}` : ''}`, { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(form) });
      setRules(previous => [...previous.filter(rule => rule.id !== value.rule.id), value.rule]); setForm(blank());
      setNotice(`규칙을 저장했습니다. ${month} 업무 ${value.created}개를 생성했습니다. 이미 생성된 업무는 유지됩니다.`);
    });
  }
  async function toggle(rule: Rule) { await act(async () => {
    const value = await requestJson<{rule: Rule; created: number}>(`/api/work/recurrences/${rule.id}`, { method: 'PUT', body: JSON.stringify({ ...rule, active: !rule.active }) });
    setRules(previous => previous.map(row => row.id === value.rule.id ? value.rule : row));
    setNotice(value.rule.active ? `자동 생성을 재개했습니다. 이번 달 업무 ${value.created}개를 생성했습니다.` : '자동 생성을 중지했습니다. 기존 업무는 유지됩니다.');
  }); }
  async function saveCategory(event: FormEvent) { event.preventDefault(); await act(async () => {
    const saved = await requestJson<Category>(`/api/work/categories${categoryEdit ? `/${categoryEdit.id}` : ''}`, { method: categoryEdit ? 'PUT' : 'POST', body: JSON.stringify({ name: categoryName, version: categoryEdit?.version }) });
    setCategories(previous => [...previous.filter(row => row.id !== saved.id), saved]); setCategoryName(''); setCategoryEdit(null); setNotice('카테고리를 저장했습니다.');
  }); }
  const dates = form.title.trim() && Number.isInteger(form.dueDay) && form.dueDay >= 1 && form.dueDay <= 31 ? recurrenceDates(form, month) : [];
  return <section className="work-system" aria-label="반복 업무">
    <header className="work-system-heading"><div><h2>반복 업무</h2><p>이번 달 {month} · 규칙은 나만 관리하고, 생성된 업무는 공동업무에서 함께 처리합니다.</p></div><button type="button" className="secondary-button" disabled={busy || loading} onClick={() => void reload()}><RefreshCw size={15}/>새로고침</button></header>
    <nav className="work-system-tabs" aria-label="반복 업무 설정"><button type="button" aria-pressed={section === 'rules'} onClick={() => setSection('rules')}>나의 반복 업무</button><button type="button" aria-pressed={section === 'categories'} onClick={() => setSection('categories')}>카테고리 관리</button></nav>
    {error && <p className="work-day-error" role="alert">{error} 입력 내용은 유지됩니다.</p>}{notice && <p className="work-notice" role="status">{notice}</p>}
    {loading ? <p role="status">설정을 불러오는 중입니다.</p> : section === 'rules' ? <div className="work-system-layout"><form className="work-system-form" onSubmit={event => void save(event)}><h3>{form.id ? '반복 규칙 수정' : '반복 업무 만들기'}</h3><fieldset disabled={busy}>
      <label>생성 주기<select aria-label="생성 주기" value={form.kind} onChange={event => setForm({ ...form, kind: event.target.value as Rule['kind'] })}><option value="monthly">매월 한 번</option><option value="daily">이번 달 매일</option></select></label>
      <label>업무 제목<input required maxLength={450} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder={form.kind === 'daily' ? 'RFID <YYMMDD> 체크' : '월별 급여 자료 확인'}/></label>
      {form.kind === 'daily' && <small>제목의 &lt;YYMMDD&gt;는 해당 날짜로 바뀝니다. 예: RFID 261001 체크</small>}
      <div className="work-system-fields"><label>업무 담당자<select aria-label="업무 담당자" required value={form.assigneeId} onChange={event => setForm({ ...form, assigneeId: event.target.value })}><option value="">담당자 선택</option>{context.assignees.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>카테고리<select aria-label="카테고리" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>{categories.filter(row => row.active || row.id === form.category).map(row => <option key={row.id} value={row.id}>{row.name}{row.active ? '' : ' (삭제됨)'}</option>)}</select></label></div>
      {form.kind === 'monthly' ? <label>매월 마감일<div className="work-system-day"><input type="number" required min={1} max={31} value={form.dueDay} onChange={event => setForm({ ...form, dueDay: Number(event.target.value) })}/>일</div><small>해당 날짜가 없는 달은 말일로 맞춥니다.</small></label> : <><div className="work-system-checks"><label><input type="checkbox" checked={form.includeSaturday} onChange={event => setForm({ ...form, includeSaturday: event.target.checked })}/>토요일 생성</label><label><input type="checkbox" checked={form.includeSunday} onChange={event => setForm({ ...form, includeSunday: event.target.checked })}/>일요일 생성</label></div><label className="work-system-pending"><input type="checkbox" disabled={!leaveLinked.includes(form.assigneeId)} checked={!form.includeLeave} onChange={event => setForm({ ...form, includeLeave: !event.target.checked })}/>연차·반차일 제외</label><small>근무기록에 연결된 담당자는 확정 연차 계획·출근부를 기준으로 제외할 수 있습니다. 이미 생성된 업무는 자동 삭제하지 않습니다.</small></>}
      <label>내용 (선택)<textarea maxLength={5000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })}/></label>
      <div className="work-system-preview"><strong>이번 달 생성 대상 {dates.length}개</strong>{dates.slice(0, 4).map(date => <div key={date}><time>{date}</time><span>{recurrenceTitle(form.title, date)}</span></div>)}{dates.length > 4 && <small>외 {dates.length - 4}개</small>}</div>
      <p className="work-help">저장하면 이번 달분만 생성합니다. 다음 달분은 월이 바뀐 후 공동업무에 처음 접속할 때 생성됩니다. 규칙 수정은 기존 업무를 덮어쓰지 않습니다.</p>
      <div className="work-inline-buttons"><button type="submit" className="primary-button">{busy ? '저장 중…' : '규칙 저장 및 이번 달 생성'}</button><button type="button" className="secondary-button" onClick={() => setForm(blank())}>새로 작성</button></div>
    </fieldset></form><section className="work-system-rules" aria-label="나의 반복 규칙"><h3>나의 규칙 {rules.length}개</h3>{rules.map(rule => <article key={rule.id}><div><strong>{rule.title}</strong><small>{rule.kind === 'monthly' ? `매월 ${rule.dueDay}일 마감` : `매일 · 토 ${rule.includeSaturday ? '포함' : '제외'} / 일 ${rule.includeSunday ? '포함' : '제외'}`} · {context.assignees.find(person => person.id === rule.assigneeId)?.name} · {categories.find(row => row.id === rule.category)?.name ?? workCategoryLabels[rule.category] ?? rule.category}</small><small>{rule.active ? '자동 생성 중' : '중지됨'}</small></div><div className="work-inline-buttons"><button type="button" className="secondary-button" disabled={busy} onClick={() => { if ((form.title || form.id) && !window.confirm('작성 중인 내용을 바꾸고 이 규칙을 수정할까요?')) return; setForm(rule); }}>수정</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void toggle(rule)}>{rule.active ? '중지' : '재개'}</button></div></article>)}{!rules.length && <p>아직 등록한 반복 업무가 없습니다.</p>}</section></div> : <section className="work-system-categories"><h3>카테고리</h3>{!canManage && <p className="work-help">카테고리 변경은 서버에 등록된 개발자 계정만 가능합니다.</p>}{canManage && <form onSubmit={event => void saveCategory(event)}><input required maxLength={60} aria-label="카테고리 이름" placeholder="새 카테고리 이름" disabled={busy} value={categoryName} onChange={event => setCategoryName(event.target.value)}/><button type="submit" className="primary-button" disabled={busy}>{categoryEdit ? '수정 저장' : '카테고리 추가'}</button>{categoryEdit && <button type="button" className="secondary-button" disabled={busy} onClick={() => { setCategoryEdit(null); setCategoryName(''); }}>취소</button>}</form>}{categories.filter(row => row.active).map(row => <div className="work-system-category" key={row.id}><span>{row.name}</span>{canManage && <div><button type="button" className="secondary-button" disabled={busy} onClick={() => { setCategoryEdit(row); setCategoryName(row.name); }}>수정</button><button type="button" className="danger-button" disabled={busy || row.id === 'unclassified'} onClick={() => { if (!window.confirm('카테고리를 삭제할까요? 기존 업무의 분류 이력은 유지됩니다.')) return; void act(async () => { const saved = await requestJson<Category>(`/api/work/categories/${row.id}`, { method: 'DELETE', body: JSON.stringify({ version: row.version }) }); setCategories(previous => previous.map(item => item.id === saved.id ? saved : item)); setNotice('카테고리를 삭제했습니다. 기존 업무의 분류는 보존됩니다.'); }); }}>삭제</button></div>}</div>)}</section>}
  </section>;
}
