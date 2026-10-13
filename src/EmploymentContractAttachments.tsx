import { useEffect, useId, useState, type ChangeEvent } from "react";
import { ImagePlus, Trash2 } from "lucide-react";

function ImagePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <li className="contract-image-card">
      <a href={url || undefined} target="_blank" rel="noreferrer" aria-label={`${file.name} 크게 보기`}>
        {url && <img src={url} alt={file.name} />}
      </a>
      <div className="contract-image-caption">
        <strong title={file.name}>{file.name}</strong>
        <small>{Math.max(1, Math.ceil(file.size / 1024)).toLocaleString()} KB · 저장 전</small>
        <button type="button" className="secondary-button" onClick={onRemove} aria-label={`${file.name} 첨부 제거`}>
          <Trash2 size={14} /> 제거
        </button>
      </div>
    </li>
  );
}

export default function EmploymentContractAttachments() {
  const noteId = useId();
  const [files, setFiles] = useState<{ id: string; file: File }[]>([]);
  const [error, setError] = useState("");
  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    const images = selected.filter((file) => file.type.startsWith("image/"));
    setError(images.length < selected.length ? "이미지 파일만 첨부할 수 있습니다." : "");
    setFiles((current) => [...current, ...images.map((file) => ({ id: crypto.randomUUID(), file }))]);
    event.target.value = "";
  };

  return (
    <section className="contract-attachments" aria-label="근로계약서 이미지 첨부">
      <div className="section-title-row">
        <h3>근로계약서 첨부 <small>{files.length}개</small></h3>
        <label className="secondary-button contract-image-picker">
          <ImagePlus size={17} /> 이미지 추가
          <input type="file" accept="image/*" multiple aria-describedby={noteId} onChange={addFiles} />
        </label>
      </div>
      <p id={noteId} className="contract-attachment-note">
        이미지 선택과 미리보기만 가능합니다. 서버에는 저장되지 않으며, 상세 화면을 닫거나 다른 계약으로 이동하면 초기화됩니다.
      </p>
      {error && <p role="alert" className="assignment-error">{error}</p>}
      {files.length ? (
        <ul className="contract-image-grid">
          {files.map(({ id, file }) => <ImagePreview key={id} file={file}
            onRemove={() => setFiles((current) => current.filter((item) => item.id !== id))} />)}
        </ul>
      ) : (
        <div className="contract-attachment-empty">
          <ImagePlus size={28} />
          <strong>계약서 이미지를 선택해 주세요</strong>
          <span>여러 장을 함께 선택할 수 있습니다. 선택한 이미지는 눌러서 크게 볼 수 있습니다.</span>
        </div>
      )}
    </section>
  );
}
