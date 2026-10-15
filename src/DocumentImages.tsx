import DocumentImageContent from "./DocumentImageContent";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus } from "lucide-react";

type Page = { id: string; file: File; url: string };

export default function DocumentImages({ title, expectedPages }: { title: string; expectedPages?: number }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pagesRef = useRef(pages);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const noteId = useId();
  const index = pages.findIndex((page) => page.id === selectedId);
  const selected = pages[index];
  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => () => pagesRef.current.forEach((page) => URL.revokeObjectURL(page.url)), []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (selectedId && dialog && !dialog.open) dialog.showModal();
    if (!selectedId && dialog?.open) dialog.close();
  }, [selectedId]);
  function addImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const accepted = files.filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type));
    setError(accepted.length !== files.length ? "JPG, PNG, WebP 이미지를 선택해 주세요. 다른 형식은 추가되지 않았습니다." : "");
    const added = accepted.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
    setPages((current) => [...current, ...added]);
    event.target.value = "";
  }
  return <section className="document-images" aria-labelledby={headingId}>
    <div className="section-title-row">
      <div><h4 id={headingId}>{title}</h4><p>{pages.length ? `선택한 이미지 ${pages.length}장` : "선택한 이미지 없음"}{expectedPages ? ` · 1부 ${expectedPages}매 기준` : ""}</p></div>
      <label className="secondary-button contract-image-picker"><ImagePlus size={18} /> 이미지 선택
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addImages} aria-describedby={noteId} aria-label={`${title} 이미지 선택`} />
      </label>
    </div>
    <p id={noteId} className="contract-attachment-note">드라이브 연결 전 미리보기입니다. 선택한 이미지는 저장되지 않으며 화면을 닫거나 다른 사람·계약으로 이동하면 사라집니다.</p>
    {error && <p role="alert" className="assignment-error">{error}</p>}
    {expectedPages && pages.length > 0 && pages.length !== expectedPages && <p className="document-page-notice">{expectedPages}매 기준 서류입니다. 현재 {pages.length}장이 선택되어 있으니 누락·중복을 확인해 주세요.</p>}
    {pages.length > 0 && <ul className="document-thumbnail-grid">{pages.map((page, pageIndex) => <li key={page.id}>
      <button type="button" className="document-thumbnail" onClick={() => setSelectedId(page.id)} aria-label={`${title} ${pageIndex + 1}쪽 크게 보기`}><img src={page.url} alt={`${title} ${pageIndex + 1}쪽`} /><span>{pageIndex + 1}쪽 · 크게 보기</span></button>
      <small title={page.file.name}>{page.file.name}</small>
      <button type="button" className="secondary-button" aria-label={`${title} ${pageIndex + 1}쪽 선택 취소`} onClick={() => {
        URL.revokeObjectURL(page.url);
        setPages((current) => current.filter((item) => item.id !== page.id));
      }}>선택 취소</button>
    </li>)}</ul>}
    <dialog ref={dialogRef} className="document-image-viewer" aria-label={`${title} 크게 보기`} onCancel={() => setSelectedId(null)} onClose={() => setSelectedId(null)} onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "ArrowLeft" && index > 0) setSelectedId(pages[index - 1].id);
      if (event.key === "ArrowRight" && index < pages.length - 1) setSelectedId(pages[index + 1].id);
    }}>
      {selected && <><header><strong>{title} · {index + 1} / {pages.length}쪽</strong><button type="button" className="secondary-button" autoFocus onClick={() => setSelectedId(null)}>닫기</button></header>
        <DocumentImageContent key={selected.id} src={selected.url} alt={`${title} ${index + 1}쪽`} onError={() => setError("이미지를 읽을 수 없습니다. 파일 형식을 확인해 주세요.")} />
        <footer><button type="button" className="secondary-button" disabled={index === 0} onClick={() => setSelectedId(pages[index - 1].id)}>이전 장</button><span>{index + 1} / {pages.length}</span><button type="button" className="secondary-button" disabled={index === pages.length - 1} onClick={() => setSelectedId(pages[index + 1].id)}>다음 장</button></footer></>}
    </dialog>
  </section>;
}
