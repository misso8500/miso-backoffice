import { useCallback, useEffect, useRef, useState, type Dispatch, type FormEvent, type RefObject, type SetStateAction } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { moveWorkCalendar } from '../shared/work-calendar.mjs';
import { fixedWorkAssignees } from '../shared/work-assignees.mjs';
import PageHeading from './PageHeading';
import { requestJson } from './storage';
import { workToday } from './lib/work-tasks';

type Draft = { title: string; relatedName: string };
type Attempt = Draft & { id: string };
type Memo = Draft & { id: string; authorName: string; createdAt: string; closedAt: string | null; closedByName: string | null; stampAssigneeId: string | null; canDelete?: boolean };
type MemoPage = { items: Memo[]; next: string | null };
const matches = (draft: Draft, attempt: Attempt) =>
  draft.title.trim() === attempt.title && draft.relatedName.trim() === attempt.relatedName;

function insertMemo(page: MemoPage | null, memo: Memo): MemoPage {
  if (!page) return { items: [memo], next: null };
  const items = [memo, ...page.items.filter(item => item.id !== memo.id)].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return { items: items.slice(0, 30), next: items.length > 30 ? items[29].id : page.next };
}

const endpoint = '/api/work/quick-memos';
const stamps = fixedWorkAssignees.map(person => ({ id: person.id, label: person.order === 0 ? '센터장' : person.name }));
const time = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const errorText = (error: unknown) => error instanceof Error ? error.message : '메모 요청을 처리하지 못했습니다.';

export default function WorkQuickMemos({ active, month, onMonthChange, draft, setDraft, request, onBusy }: {
  active: boolean; month: string; onMonthChange: (month: string) => void; onBusy: (busy: boolean) => void;
  draft: Draft; setDraft: Dispatch<SetStateAction<Draft>>; request: RefObject<Attempt | null>;
}) {
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState<Attempt | null>(null);
  const [failed, setFailed] = useState<Attempt | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const historyCursor = useRef<string | null>(null);
  const lastRefresh = useRef(0);
  const lock = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const completionButton = useRef<HTMLButtonElement>(null);
  const firstStamp = useRef<HTMLButtonElement>(null);
  const [stampNote, setStampNote] = useState<string | null>(null);
  const [open, setOpen] = useState<MemoPage | null>(null);
  const [before, setBefore] = useState<string | null>(null);
  const currentPage = useRef<string | null>(null);
  const [history, setHistory] = useState<MemoPage | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lastStamped, setLastStamped] = useState<Memo | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [status, setStatus] = useState('');
  const readRevision = useRef(0);
  const historyRevision = useRef(0);
  const thisMonth = workToday().slice(0, 7);

  const load = useCallback(async (cursor: string | null = null) => {
    const revision = ++readRevision.current;
    lastRefresh.current = Date.now();
    const query = new URLSearchParams({ month });
    if (cursor) query.set('before', cursor);
    try {
      const page = await requestJson<MemoPage>(`${endpoint}?${query}`, undefined, true);
      if (revision !== readRevision.current) return;
      currentPage.current = cursor;
      setBefore(cursor);
      setOpen(page);
      setLoadError('');
    } catch (cause) {
      if (revision === readRevision.current) setLoadError(errorText(cause));
    }
  }, [month]);

  useEffect(() => {
    if (!active) return;
    void load(currentPage.current);
    const refresh = () => { if (!lock.current && !document.hidden && !currentPage.current && Date.now() - lastRefresh.current >= 2_000) void load(); };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => {
      readRevision.current++;
      historyRevision.current++;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [active, load]);

  useEffect(() => { if (stampNote) firstStamp.current?.focus({ preventScroll: true }); }, [stampNote]);

  async function loadHistory(cursor?: string | null) {
    const revision = ++historyRevision.current;
    const query = new URLSearchParams({ month, closed: '1' });
    if (cursor) query.set('before', cursor);
    try {
      const page = await requestJson<MemoPage>(`${endpoint}?${query}`, undefined, true);
      if (revision !== historyRevision.current) return;
      historyCursor.current = cursor ?? null;
      setHistory(page);
      setHistoryError('');
    } catch (cause) {
      if (revision === historyRevision.current) setHistoryError(errorText(cause));
    }
  }

  async function write(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    onBusy(true);
    setError('');
    setStatus('');
    try { await action(); }
    catch (cause) { setError(errorText(cause)); }
    finally { lock.current = false; setPending(false); onBusy(false); }
  }

  function add(event: FormEvent) {
    event.preventDefault();
    const value = draft.title.trim();
    const relatedName = draft.relatedName.trim();
    if (!value || lock.current || month !== thisMonth) return;
    const attempt = request.current && matches(draft, request.current)
      ? request.current : { title: value, relatedName, id: crypto.randomUUID() };
    if (failed && !matches(draft, failed)) return;
    save(attempt);
  }

  function save(attempt: Attempt) {
    if (lock.current) return;
    request.current = attempt;
    setSaving(attempt);
    setFailed(null);
    void write(async () => {
      try {
        const memo = await requestJson<Memo>(endpoint, { method: 'POST', body: JSON.stringify({
          title: attempt.title, relatedName: attempt.relatedName, requestId: attempt.id
        }) });
        setDraft(previous => matches(previous, attempt) ? { title: '', relatedName: '' } : previous);
        request.current = null;
        setStatus('포스트잇을 붙였습니다.');
        if (before || !open) void load();
        else {
          readRevision.current++;
          if (!memo.closedAt) setOpen(previous => insertMemo(previous, memo));
        }
      } catch (cause) {
        setFailed(attempt);
        throw cause;
      } finally {
        setSaving(null);
      }
    });
  }

  function remove(memo: Memo) {
    if (lock.current || !window.confirm('이 포스트잇을 삭제할까요?')) return;
    setDeleting(memo.id);
    input.current?.focus({ preventScroll: true });
    void write(async () => {
      try {
        await requestJson<{ id: string }>(`${endpoint}/${memo.id}`, { method: 'DELETE' });
        readRevision.current++;
        setOpen(previous => previous && { ...previous, items: previous.items.filter(item => item.id !== memo.id) });
        setStatus('포스트잇을 삭제했습니다.');
      } finally {
        setDeleting(null);
      }
    });
  }

  function complete(memo: Memo, person: typeof stamps[number]) {
    void write(async () => {
      const result = await requestJson<{ memo: Memo }>(`${endpoint}/${memo.id}/complete`, {
        method: 'POST', body: JSON.stringify({ assigneeId: person.id })
      });
      readRevision.current++;
      setOpen(previous => previous && { ...previous, items: previous.items.filter(item => item.id !== memo.id) });
      setStampNote(null);
      setLastStamped(result.memo);
      setStatus(`${person.label} 도장으로 수행을 기록했습니다.`);
      if (historyOpen && history && !historyCursor.current) {
        historyRevision.current++;
        setHistory(previous => insertMemo(previous, result.memo));
      }
      input.current?.focus({ preventScroll: true });
    });
  }

  function dismissStamps() {
    setStampNote(null);
    completionButton.current?.focus({ preventScroll: true });
  }

  function finishedNote(memo: Memo) {
    const name = stamps.find(stamp => stamp.id === memo.stampAssigneeId)?.label ?? memo.closedByName;
    return <li className="work-note is-finished" key={memo.id}>
      <div className="work-note-copy"><strong>{memo.title}</strong>{memo.relatedName && <span className="work-note-related">관련자 · {memo.relatedName}</span>}</div>
      {memo.stampAssigneeId && <span className="work-memo-stamp is-applied" aria-label={`${name} 완료 도장`}>{name}</span>}
      <small>{memo.closedAt && time.format(new Date(memo.closedAt))} · {memo.stampAssigneeId ? '수행 기록 저장' : '처리됨'}</small>
    </li>;
  }

  return <section className="work-quick-memos" hidden={!active} aria-label="이 달의 할 일 코르크 보드">
    <PageHeading title="이 달의 할 일" description="할 일을 공유하고, 수행자가 완료 도장을 찍어 기록합니다.">
      <div className="work-board-month">
        <button type="button" className="secondary-button" aria-label="이전 달" disabled={pending || month === '1000-01'}
          onClick={() => onMonthChange(moveWorkCalendar(month + '-01', 'month', -1).slice(0, 7))}><ChevronLeft size={17} aria-hidden="true"/></button>
        <strong>{month.slice(0, 4)}년 {Number(month.slice(5))}월</strong>
        <button type="button" className="secondary-button" aria-label="다음 달" disabled={pending || month >= thisMonth}
          onClick={() => onMonthChange(moveWorkCalendar(month + '-01', 'month', 1).slice(0, 7))}><ChevronRight size={17} aria-hidden="true"/></button>
        {month !== thisMonth && <button type="button" className="secondary-button" disabled={pending} onClick={() => onMonthChange(thisMonth)}>이번 달</button>}
      </div>
    </PageHeading>
    <div className="work-board-surface">
    <span className="sr-only" role="status">{deleting ? '포스트잇을 삭제하는 중입니다.' : status}</span>
    {error && <p className="work-board-message" role="alert">{error} <button type="button" className="secondary-button" onClick={() => { setError(''); void load(before); }}>새로고침</button></p>}
    {failed && !matches(draft, failed) && <p className="work-board-message">
      저장 실패 · {failed.title}{' '}
      <button type="button" className="secondary-button" disabled={pending} onClick={() => save(failed)}>다시 저장</button>{' '}
      <button type="button" className="secondary-button" disabled={pending} onClick={() => setFailed(null)}>닫기</button>
    </p>}
    {loadError && <p className="work-board-message" role="alert">{loadError} <button type="button" className="secondary-button" onClick={() => void load(before)}>다시 불러오기</button></p>}
    {!open && !loadError && active && <p className="work-board-message" role="status">포스트잇을 불러오는 중입니다.</p>}
    <ul className="work-memo-list">
      {month === thisMonth && <li className="work-note is-composer">
        <form className="work-note-form" onSubmit={add}>
          <textarea ref={input} aria-label="공동 메모 한 줄" placeholder="할 일을 적으세요" value={draft.title} maxLength={200}
            onChange={event => setDraft({ ...draft, title: event.target.value.replace(/[\r\n]+/g, ' ') })}
            onKeyDown={event => {
              if (!event.repeat && event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}/>
          <label className="work-note-name"><span>관련자</span><input placeholder="이름 (선택)" value={draft.relatedName} maxLength={80}
            onChange={event => setDraft({ ...draft, relatedName: event.target.value })}/></label>
          <button type="submit" className="primary-button work-note-action" disabled={pending || !draft.title.trim() || Boolean(failed && !matches(draft, failed))}>
            <Plus size={15} aria-hidden="true"/> 붙이기
          </button>
        </form>
      </li>}
      {saving && <li className="work-note" key={saving.id} aria-busy="true">
        <div className="work-note-copy"><strong>{saving.title}</strong>{saving.relatedName && <span className="work-note-related">관련자 · {saving.relatedName}</span>}</div>
        <small role="status">저장 중…</small>
      </li>}
      {open?.items.filter(memo => memo.id !== deleting && memo.id !== saving?.id).map(memo => <li className="work-note" key={memo.id}>
        <div className="work-note-copy"><strong>{memo.title}</strong>{memo.relatedName && <span className="work-note-related">관련자 · {memo.relatedName}</span>}</div>
        <small>{memo.authorName} · {time.format(new Date(memo.createdAt))}</small>
        <div className="work-note-actions"><button type="button" className="secondary-button work-note-action"
          disabled={pending} aria-expanded={stampNote === memo.id} onClick={event => {
            completionButton.current = event.currentTarget;
            setStampNote(stampNote === memo.id ? null : memo.id);
          }}>완료</button>
          {memo.canDelete && <button type="button" className="secondary-button work-note-action" aria-label={`${memo.title} 삭제`}
            disabled={pending} onClick={() => remove(memo)}>삭제</button>}
        </div>
        {stampNote === memo.id && <div className="work-memo-stamps" role="group" aria-label={`${memo.title} 완료 도장`}
          onKeyDown={event => { if (event.key === 'Escape' && !pending) { event.preventDefault(); dismissStamps(); } }}>
          <div className="work-stamp-heading"><strong>수행자 도장</strong><button type="button" disabled={pending} onClick={dismissStamps} aria-label="도장 선택 닫기">×</button></div>
          <div className="work-stamp-choices">{stamps.map((person, index) =>
            <button key={person.id} ref={index === 0 ? firstStamp : null} type="button" className="work-memo-stamp" disabled={pending}
              aria-label={`${person.label} 도장 찍기`} onClick={() => complete(memo, person)}>{person.label}</button>)}</div>
        </div>}
      </li>)}
      {lastStamped && !historyOpen && finishedNote(lastStamped)}
    </ul>
    {open && month !== thisMonth && !open.items.length && !lastStamped && <p className="work-board-message">붙인 포스트잇이 없습니다.</p>}
    <div className="work-board-pages">
      {before && <button type="button" className="secondary-button" disabled={pending} onClick={() => void load()}>최신 포스트잇</button>}
      {open?.next && <button type="button" className="secondary-button" disabled={pending} onClick={() => void load(open.next)}>이전 포스트잇</button>}
    </div>
    <details onToggle={event => {
      const expanded = event.currentTarget.open;
      setHistoryOpen(expanded);
      if (expanded) void loadHistory();
      else { historyRevision.current++; setHistory(null); setHistoryError(''); }
    }}>
      <summary>완료 포스트잇</summary>
      {historyError && <p className="work-board-message" role="alert">{historyError} <button type="button" className="secondary-button" onClick={() => void loadHistory()}>다시 불러오기</button></p>}
      {history && (history.items.length ? <ul className="work-memo-list">{history.items.map(finishedNote)}</ul>
        : <p className="work-board-message">완료한 포스트잇이 없습니다.</p>)}
      {history?.next && <button type="button" className="secondary-button" disabled={pending} onClick={() => void loadHistory(history.next)}>이전 완료 기록</button>}
    </details>
    </div>
  </section>;
}
