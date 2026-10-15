import { createDocumentImageCache, type DocumentImageCache } from "./lib/document-image-cache";
import "./RecognitionHistoryPreview.css";
import { useEffect, useRef, useState } from 'react';
import { getAuthHeaders } from './auth';
import DocumentImageContent from './DocumentImageContent';

type Period = { id: string; startDate: string; endDate: string };
type Page = { fileId: string; kind: string; periodId: string; order: number; name?: string };
type Documents = { folderId: string; periods: Period[]; pages: Page[]; version: string | null };
type Candidate = { id: string; name: string; path: string };
const kinds = [{ id: 'identity', label: '신분증' }, { id: 'recognition', label: '장기요양인정서' }, { id: 'plan', label: '개인별장기요양이용계획서' }, { id: 'equipment', label: '복지용구확인서' }];
const empty: Documents = { folderId: '', periods: [], pages: [], version: null };
async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...await getAuthHeaders() }, cache: 'no-store', signal: options?.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? '서류를 불러오지 못했습니다.');
  return response;
}
function RemoteImage({ endpoint, name, onOpen, cache }: { endpoint: string; name: string; onOpen: (url: string) => void; cache: DocumentImageCache }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '200px' });
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  const [url, setUrl] = useState(''); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setUrl(''); setError('');
    void cache.get(endpoint).then(url => {
      if (active) setUrl(url);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [endpoint, attempt, visible, cache]);
  return <div ref={host}>{url ? <button type="button" className="document-thumbnail" onClick={() => onOpen(url)}><img src={url} alt={name} /><span>크게 보기</span></button> : error ? <><p role="alert">{error}</p><button type="button" className="secondary-button" onClick={() => setAttempt(attempt + 1)}>다시 시도</button></> : <p role="status">사진 불러오는 중…</p>}</div>;
}
export default function RecipientDocuments({ recipientId, recipientName }: { recipientId: string; recipientName: string }) {
  const [saved, setSaved] = useState<Documents>(empty), [draft, setDraft] = useState<Documents>(empty);
  const [candidates, setCandidates] = useState<Candidate[]>([]), [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false), [initializing, setInitializing] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<{ url: string; name: string; pages: { endpoint: string; name: string }[]; index: number } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [imageCache] = useState(() => createDocumentImageCache(async (endpoint, signal) => {
    const blob = await (await request(endpoint, { signal })).blob();
    return blob;
  }));
  const previewGeneration = useRef(0);
  const closePreview = () => { previewGeneration.current++; setPreview(null); setPreviewBusy(false); };
  useEffect(() => () => { previewGeneration.current++; imageCache.clear(); }, [imageCache]);
  async function navigatePreview(index: number) {
    if (!preview || index < 0 || index >= preview.pages.length || previewBusy) return;
    const generation = previewGeneration.current;
    const endpoint = preview.pages[index].endpoint;
    const cached = imageCache.peek(endpoint);
    if (cached) {
      setPreview(current => current ? { ...current, index, url: cached, name: current.pages[index].name } : null);
      return;
    }
    setPreviewBusy(true);
    try {
      const url = await imageCache.get(endpoint);
      if (generation !== previewGeneration.current) return;
      setPreview(current => current ? { ...current, index, url, name: current.pages[index].name } : null);
    } catch(e) { if (generation === previewGeneration.current) setError(e instanceof Error ? e.message : '사진을 읽지 못했습니다.'); }
    finally { if (generation === previewGeneration.current) setPreviewBusy(false); }
  }
  useEffect(() => {
    if (!preview) return;
    // Neighbours share the same request/cache as thumbnails and foreground navigation.
    for (const index of [preview.index + 1, preview.index - 1]) {
      const page = preview.pages[index];
      if (page) void imageCache.get(page.endpoint).catch(() => { /* Foreground navigation offers retry on failure. */ });
    }
  }, [preview, imageCache]);
  const dialog = useRef<HTMLDialogElement>(null);
  const base = `/api/recipients/${encodeURIComponent(recipientId)}/documents`;
  useEffect(() => {
    let active = true;
    void request(base).then(r => r.json()).then((data: Documents) => { if (active) { setSaved(data); setDraft(data); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setInitializing(false); });
    return () => { active = false; };
  }, [base]);
  useEffect(() => {
    if (preview && !dialog.current?.open) dialog.current?.showModal();
    if (!preview && dialog.current?.open) dialog.current.close();
  }, [preview]);
  async function loadCandidates() {
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await (await request(`${base}/candidates?folderId=${encodeURIComponent(draft.folderId)}`)).json() as { folderName: string; files: Candidate[] };
      // Use the server-validated URL/ID on requests; links are parsed only on the server.
      const id = draft.folderId.includes('https://') ? new URL(draft.folderId).pathname.split('/').filter(Boolean).at(-1)! : draft.folderId.trim();
      setDraft(current => ({ ...current, folderId: id })); setCandidates(data.files);
      setNotice(`${data.folderName} 폴더에서 이미지 ${data.files.length}장을 찾았습니다. 종류·인정 기간·쪽 순서를 확인한 뒤 저장해 주세요.`);
    } catch (e) { setError(e instanceof Error ? e.message : '폴더를 조회하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await (await request(base, { method: 'PUT', body: JSON.stringify(draft) })).json() as Documents;
      setSaved(data); setDraft(data); setEditing(false); setCandidates([]); setNotice('서류 연결을 저장했습니다. 다음에 상세 화면을 열어도 바로 확인할 수 있습니다.');
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  const patchPage = (fileId: string, patch: Partial<Page>) => setDraft(current => ({ ...current, pages: current.pages.map(page => page.fileId === fileId ? { ...page, ...patch } : page) }));
  function renderGroup(kind: string | null, periodId = '') {
    const kindsInGroup = kind ? kinds.filter(k => k.id === kind) : kinds.filter(k => k.id !== 'identity');
    const pages = saved.pages.filter(p => kindsInGroup.some(k => k.id === p.kind) && p.periodId === periodId)
      .sort((a,b) => kinds.findIndex(k => k.id === a.kind) - kinds.findIndex(k => k.id === b.kind) || a.order - b.order);
    const pageLabel = (page: Page) => `${kinds.find(k => k.id === page.kind)?.label || '서류'} · ${page.order}쪽`;
    return <section className={`document-images${kind ? '' : ' recognition-document-bundle'}`} aria-label={kind ? '공통 신분증' : '인정 기간 서류 모음'}>
      <div className="section-title-row"><h4>{kind ? '신분증' : '인정서류 모아보기'}</h4><span className="document-bundle-count">총 {pages.length}장</span></div>
      {!kind && <p className="contract-attachment-note">사진을 누르면 크게 볼 수 있습니다. 이전·다음 장으로 이 기간의 서류를 이어서 확인하세요.</p>}
      {pages.length ? <ul className={`document-thumbnail-grid${kind ? '' : ' recognition-document-grid'}`}>{pages.map((page, index) => <li key={page.fileId}>
        <strong className="document-page-label">{pageLabel(page)}</strong>
        <RemoteImage cache={imageCache} endpoint={`${base}/images/${page.fileId}`} name={`${recipientName} ${pageLabel(page)}`} onOpen={url => setPreview({ url, name: pageLabel(page), index, pages: pages.map(p => ({ endpoint: `${base}/images/${p.fileId}`, name: pageLabel(p) })) })} />
      </li>)}</ul> : <p className="contract-attachment-note">아직 연결된 서류가 없습니다.</p>}
      {!kind && kindsInGroup.some(k => !pages.some(p => p.kind === k.id)) && <p className="document-missing-note">미연결 서류: {kindsInGroup.filter(k => !pages.some(p => p.kind === k.id)).map(k => k.label).join(', ')}</p>}
    </section>;
  }
  return <section className="recognition-preview" aria-label="수급자 Drive 서류">
    <div className="section-title-row"><h3>수급자 서류</h3><button type="button" className="secondary-button" disabled={busy || initializing} onClick={() => { closePreview(); setEditing(!editing); setDraft(saved); setCandidates([]); setError(''); setNotice(''); }}>{editing ? '편집 취소' : saved.folderId ? '서류 추가·연결 수정' : '드라이브 서류 연결'}</button></div>
    <p className="contract-attachment-note">이미지는 Drive에 보관하고, 이 화면에서는 수급자·인정 기간과의 연결만 저장합니다.</p>
    {initializing && <p role="status">서류 연결 불러오는 중…</p>}
    {error && <p role="alert" className="assignment-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {editing ? <div className="recipient-document-editor">
      <p>① 사람 폴더 불러오기 → ② 인정 기간 입력 → ③ 서류 선택 → ④ 연결 저장</p>
      <label>이 수급자의 Drive 폴더 링크<input type="text" value={draft.folderId} disabled={busy} onChange={e => { setDraft(current => ({ ...current, folderId: e.target.value })); setCandidates([]); }} placeholder="https://drive.google.com/drive/folders/…" /></label>
      <button type="button" className="secondary-button" disabled={busy || !draft.folderId} onClick={() => void loadCandidates()}>폴더의 사진 불러오기</button>
      <h4>인정 기간</h4><p className="contract-attachment-note">이용계약 기간이 아닌, 인정서에 적힌 유효기간을 입력해 주세요.</p>
      {draft.periods.map(period => <div className="recognition-preview-dates" key={period.id}><label>인정 시작일<input type="date" disabled={busy} value={period.startDate} onChange={e => setDraft(current => ({ ...current, periods: current.periods.map(p => p.id === period.id ? { ...p, startDate: e.target.value } : p) }))} /></label><label>인정 종료일<input type="date" disabled={busy} value={period.endDate} onChange={e => setDraft(current => ({ ...current, periods: current.periods.map(p => p.id === period.id ? { ...p, endDate: e.target.value } : p) }))} /></label><button type="button" className="secondary-button" disabled={busy || draft.pages.some(p => p.periodId === period.id)} title="이 기간에 연결할 서류를 먼저 해제해 주세요." onClick={() => setDraft(current => ({ ...current, periods: current.periods.filter(p => p.id !== period.id) }))}>이 기간 삭제</button></div>)}
      <button type="button" disabled={busy} className="secondary-button" onClick={() => setDraft(current => ({ ...current, periods: [...current.periods, { id: crypto.randomUUID(), startDate: '', endDate: '' }] }))}>+ 인정 기간 추가</button>
      <p>연결할 사진을 선택하고 종류와 쪽 순서를 확인해 주세요. 선택하지 않은 사진은 Drive에 그대로 남습니다.</p>
      {candidates.map(file => {
        const page = draft.pages.find(p => p.fileId === file.id);
        return <div className="document-candidate" key={file.id}><label><input type="checkbox" checked={Boolean(page)} disabled={busy} onChange={e => setDraft(current => ({ ...current, pages: e.target.checked ? [...current.pages, { fileId: file.id, kind: '', periodId: '', order: 1, name: file.name }] : current.pages.filter(p => p.fileId !== file.id) }))} />{file.path}{file.name}</label>
          <RemoteImage cache={imageCache} endpoint={`${base}/images/${file.id}?folderId=${encodeURIComponent(draft.folderId)}`} name={file.name} onOpen={url => setPreview({ url, name: file.name, index: candidates.findIndex(f => f.id === file.id), pages: candidates.map(f => ({ endpoint: `${base}/images/${f.id}?folderId=${encodeURIComponent(draft.folderId)}`, name: f.name })) })} />
          {page && <div className="document-candidate-fields"><label>서류 종류<select disabled={busy} value={page.kind} onChange={e => patchPage(file.id, { kind: e.target.value, periodId: e.target.value === 'identity' ? '' : page.periodId })}><option value="">종류 선택</option>{kinds.map(kind => <option key={kind.id} value={kind.id}>{kind.label}</option>)}</select></label>{page.kind !== 'identity' && <label>인정 기간<select disabled={busy} value={page.periodId} onChange={e => patchPage(file.id, { periodId: e.target.value })}><option value="">기간 선택</option>{draft.periods.map(p => <option key={p.id} value={p.id}>{p.startDate} ~ {p.endDate}</option>)}</select></label>}<label>쪽 순서<input type="number" min={1} max={300} disabled={busy} value={page.order} onChange={e => patchPage(file.id, { order: Number(e.target.value) })} /></label></div>}
        </div>;
      })}
      <p className="contract-attachment-note">저장하지 않고 화면을 닫으면 편집 내용은 사라집니다. 기존 연결은 저장하기 전까지 유지됩니다.</p>
      <button type="button" className="primary-button" disabled={busy || !candidates.length} onClick={() => void save()}>{busy ? '처리 중…' : `서류 연결 저장 (${draft.pages.length}장)`}</button>
    </div> : <>
      {!saved.folderId && !initializing && <p>아직 연결된 폴더가 없습니다. ‘드라이브 서류 연결’을 눌러 시작해 주세요.</p>}
      {saved.folderId && <>{renderGroup('identity')}{[...saved.periods].sort((a,b) => b.startDate.localeCompare(a.startDate)).map((period, index) => <details className="recognition-preview-history" key={period.id} open={index === 0}><summary><b>인정 기간 {period.startDate.replaceAll('-', '')} ~ {period.endDate.replaceAll('-', '')}</b></summary>{renderGroup(null, period.id)}</details>)}</>}
    </>}
    <dialog ref={dialog} className="document-image-viewer" aria-label="수급자 서류 크게 보기" onCancel={closePreview} onClose={closePreview} onKeyDown={e => { e.stopPropagation(); if (preview && e.key === 'ArrowLeft') void navigatePreview(preview.index - 1); if (preview && e.key === 'ArrowRight') void navigatePreview(preview.index + 1); }}>{preview && <><header><strong>{preview.name}</strong><button autoFocus type="button" className="secondary-button" onClick={closePreview}>닫기</button></header><DocumentImageContent key={preview.url} src={preview.url} alt={preview.name} /><footer><button type="button" className="secondary-button" disabled={previewBusy || preview.index === 0} onClick={() => void navigatePreview(preview.index - 1)}>이전 장</button><span role="status">{previewBusy ? "불러오는 중…" : `${preview.index + 1} / ${preview.pages.length}`}</span><button type="button" className="secondary-button" disabled={previewBusy || preview.index === preview.pages.length - 1} onClick={() => void navigatePreview(preview.index + 1)}>다음 장</button></footer></>}</dialog>
  </section>;
}
