import DocumentImageContent from "./DocumentImageContent";
import { useEffect, useRef, useState } from 'react';
import { getAuthHeaders } from './auth';

type ImageFile = { id: string; name: string; url: string };
export default function DriveTestImages() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => { controller.current?.abort(); urls.current.forEach(URL.revokeObjectURL); }, []);
  useEffect(() => {
    if (selected !== null && !dialog.current?.open) dialog.current?.showModal();
    if (selected === null && dialog.current?.open) dialog.current.close();
  }, [selected]);
  async function load() {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setMessage(''); setImages([]);
    urls.current.forEach(URL.revokeObjectURL); urls.current = [];
    try {
      const headers = await getAuthHeaders();
      const read = async (path: string) => {
        const response = await fetch(path, { headers, cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(60000)]) });
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || '이미지를 불러오지 못했습니다.');
        return response;
      };
      const listing = await (await read('/api/drive/test-files')).json() as { files: { id: string; name: string }[] };
      if (listing.files.length === 0) setMessage('테스트 폴더에 지원하는 이미지가 없습니다. JPG·PNG·WebP를 확인해 주세요.');
      for (const file of listing.files) {
        const blob = await (await read(`/api/drive/test-files/${encodeURIComponent(file.id)}/image`)).blob();
        if (abort.signal.aborted) return;
        const url = URL.createObjectURL(blob); urls.current.push(url);
        setImages((current) => [...current, { ...file, url }]);
      }
    } catch (error) { if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : 'Drive 조회에 실패했습니다.'); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <section className="document-images" aria-label="Drive 연결 테스트">
    <div className="section-title-row"><h4>Drive 연결 테스트</h4><button type="button" className="secondary-button" disabled={busy} onClick={() => void load()}>{busy ? '이미지 불러오는 중…' : '테스트 이미지 불러오기'}</button></div>
    <p className="contract-attachment-note">연결 확인용 폴더입니다. 아래 이미지는 이 사람의 실제 서류로 등록되지 않습니다.</p>
    {message && <p role="status">{message}</p>}
    <ul className="document-thumbnail-grid">{images.map((file, index) => <li key={file.id}><button type="button" className="document-thumbnail" onClick={() => setSelected(index)}><img src={file.url} alt={`테스트 이미지 ${index + 1}`} /><span>{index + 1}장 · 크게 보기</span></button><small>{file.name}</small></li>)}</ul>
    <dialog className="document-image-viewer" ref={dialog} aria-label="Drive 테스트 이미지 크게 보기" onCancel={() => setSelected(null)} onClose={() => setSelected(null)} onKeyDown={(event) => {
      event.stopPropagation();
      if (selected !== null && event.key === 'ArrowLeft' && selected > 0) setSelected(selected - 1);
      if (selected !== null && event.key === 'ArrowRight' && selected < images.length - 1) setSelected(selected + 1);
    }}>{selected !== null && images[selected] && <><header><strong>테스트 이미지 {selected + 1} / {images.length}</strong><button autoFocus type="button" className="secondary-button" onClick={() => setSelected(null)}>닫기</button></header><DocumentImageContent key={images[selected].id} src={images[selected].url} alt={`테스트 이미지 ${selected + 1}`} /><footer><button className="secondary-button" type="button" disabled={selected === 0} onClick={() => setSelected(selected - 1)}>이전 장</button><span>{selected + 1} / {images.length}</span><button type="button" className="secondary-button" disabled={selected === images.length - 1} onClick={() => setSelected(selected + 1)}>다음 장</button></footer></>}</dialog>
  </section>;
}
