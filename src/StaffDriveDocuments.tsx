import { useCallback, useEffect, useRef, useState } from 'react';
import DocumentImageContent from './DocumentImageContent';
import { RemoteImage, requestDocument } from './RecipientDocuments';
import { createDocumentImageCache } from './lib/document-image-cache';
import { isDialogBackdropClick } from './lib/modal';

const categories = [
  { id: 'contract', label: '근로계약서', expected: '1~3부' },
  { id: 'certificate', label: '요양보호사 자격증', expected: '1부' },
  { id: 'health', label: '채용검진확인서', expected: '1~3부 · 선택' },
  { id: 'criminal', label: '범죄경력회보서' },
  { id: 'disabilityAbuse', label: '장애인학대회신서' },
  { id: 'elderAbuse', label: '노인학대회신서' }
];

type DriveFile = { id: string; name: string; path: string; mimeType: string; kind: string };
type Listing = { folderName: string; files: DriveFile[] };
const fileOrder = new Intl.Collator('ko', { numeric: true });
const isPdf = (file: DriveFile) => file.mimeType === 'application/pdf';

export default function StaffDriveDocuments({ staffId, folder, savedFolder, onFolderChange }: {
  staffId: string;
  folder: string;
  savedFolder: string;
  onFolderChange: (value: string) => void;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ files: DriveFile[]; index: number; url: string } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewGeneration = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const [cache] = useState(() => createDocumentImageCache(async (endpoint, signal) =>
    (await requestDocument(endpoint, { signal })).blob()));
  const base = `/api/work/staff-directory/${encodeURIComponent(staffId)}/documents`;
  const fileEndpoint = (file: DriveFile) => `${base}/${encodeURIComponent(file.id)}`;

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const data = await (await requestDocument(base, { signal })).json() as Listing;
      if (!signal?.aborted) setListing(data);
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Drive 서류를 불러오지 못했습니다.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    if (!staffId || !savedFolder) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [staffId, savedFolder, load]);
  useEffect(() => () => { previewGeneration.current++; cache.clear(); }, [cache]);
  useEffect(() => {
    if (preview && !dialog.current?.open) dialog.current?.showModal();
    if (!preview && dialog.current?.open) dialog.current.close();
  }, [preview]);

  function closePreview() {
    previewGeneration.current++;
    setPreview(null);
    setPreviewError('');
    setPreviewBusy(false);
  }

  async function showFile(files: DriveFile[], index: number, thumbnailUrl?: string) {
    if (index < 0 || index >= files.length) return;
    const generation = ++previewGeneration.current;
    setPreviewError('');
    setPreviewBusy(true);
    try {
      const url = thumbnailUrl ?? await cache.get(fileEndpoint(files[index]));
      if (generation === previewGeneration.current) setPreview({ files, index, url });
    } catch (cause) {
      if (generation === previewGeneration.current) setPreviewError(cause instanceof Error ? cause.message : '파일을 열지 못했습니다.');
    } finally {
      if (generation === previewGeneration.current) setPreviewBusy(false);
    }
  }

  function renderFiles(files: DriveFile[]) {
    const sorted = [...files].sort((a, b) => fileOrder.compare(a.path + a.name, b.path + b.name));
    return <ul className="document-thumbnail-grid">{sorted.map((file, index) => <li key={file.id}>
      <strong className="document-page-label">{file.path}{file.name}</strong>
      {isPdf(file)
        ? <button type="button" className="secondary-button" disabled={previewBusy} onClick={() => void showFile(sorted, index)}>PDF 미리보기</button>
        : <RemoteImage cache={cache} endpoint={fileEndpoint(file)} name={file.name} onOpen={url => void showFile(sorted, index, url)} />}
    </li>)}</ul>;
  }

  const currentFile = preview?.files[preview.index];
  const uncategorized = listing?.files.filter(file => !file.kind) ?? [];
  return <section className="recognition-preview" aria-label="직원 Drive 서류">
    <div className="section-title-row"><h3>Google Drive 서류</h3>
      {savedFolder && <button type="button" className="secondary-button" disabled={loading} onClick={() => void load()}>Drive 다시 확인</button>}
    </div>
    <label>직원별 Drive 폴더 링크<input type="text" value={folder} onChange={event => onFolderChange(event.target.value)} placeholder="https://drive.google.com/drive/folders/…" /></label>
    {(!savedFolder || folder !== savedFolder) && <p className="contract-attachment-note">직원별 폴더 링크를 입력하고 직원 정보를 저장하면 폴더의 서류를 자동으로 확인합니다.</p>}
    {loading && <p role="status">Drive 서류 확인 중…</p>}
    {error && <p role="alert">{error}</p>}
    {!preview && previewBusy && <p role="status">미리보기 불러오는 중…</p>}
    {!preview && previewError && <p role="alert">{previewError}</p>}
    {listing && <>
      <p className="contract-attachment-note">{listing.folderName} · 이미지 및 PDF {listing.files.length}개</p>
      {categories.map(category => {
        const files = listing.files.filter(file => file.kind === category.id);
        return <section className="document-images" key={category.id}>
          <div className="section-title-row"><h4>{category.label}</h4><span>{category.expected && `${category.expected} · `}{files.length}개 확인</span></div>
          {files.length ? renderFiles(files) : <p className="contract-attachment-note">찾은 파일이 없습니다.</p>}
        </section>;
      })}
      {uncategorized.length > 0 && <details><summary>종류를 확인할 파일 {uncategorized.length}개</summary>{renderFiles(uncategorized)}</details>}
    </>}
    <dialog ref={dialog} className="document-image-viewer" aria-label="직원 서류 크게 보기"
      onCancel={event => { event.preventDefault(); event.stopPropagation(); closePreview(); }} onClose={closePreview}
      onClick={event => { if (isDialogBackdropClick(event)) closePreview(); }}
      onKeyDown={event => {
        event.stopPropagation();
        if (!preview || previewBusy) return;
        if (event.key === 'ArrowLeft') void showFile(preview.files, preview.index - 1);
        if (event.key === 'ArrowRight') void showFile(preview.files, preview.index + 1);
      }}>
      {preview && currentFile && <>
        <header><strong>{currentFile.name}</strong>{isPdf(currentFile) && <a href={preview.url} target="_blank" rel="noreferrer">PDF 새 탭에서 열기</a>}<button type="button" className="secondary-button" autoFocus onClick={closePreview}>닫기</button></header>
        {isPdf(currentFile)
          ? <object data={preview.url} type="application/pdf" aria-label={currentFile.name} className="staff-drive-pdf"><a href={preview.url} target="_blank" rel="noreferrer">PDF 열기</a></object>
          : <DocumentImageContent key={preview.url} src={preview.url} alt={currentFile.name} />}
        {previewError && <p role="alert">{previewError}</p>}
        <footer>
          <button type="button" className="secondary-button" disabled={previewBusy || preview.index === 0} onClick={() => void showFile(preview.files, preview.index - 1)}>이전 파일</button>
          <span role="status">{previewBusy ? '불러오는 중…' : `${preview.index + 1} / ${preview.files.length}`}</span>
          <button type="button" className="secondary-button" disabled={previewBusy || preview.index === preview.files.length - 1} onClick={() => void showFile(preview.files, preview.index + 1)}>다음 파일</button>
        </footer>
      </>}
    </dialog>
  </section>;
}
