import { useEffect, useState } from "react";

const documentTypes = ["장기요양인정서", "개인별장기요양이용계획서 1면", "개인별장기요양이용계획서 2면", "복지용구 확인서", "기타"];

function AttachmentItem({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return <div className="recognition-attachment-file"><a href={url} download={file.name}>{file.name}</a><small>{Math.max(1, Math.ceil(file.size / 1024)).toLocaleString()} KB · 저장 전</small><button type="button" aria-label={`${file.name} 첨부 취소`} onClick={onRemove}>첨부 취소</button></div>;
}

export default function RecognitionAttachments() {
  const [documentType, setDocumentType] = useState(documentTypes[0]);
  const [files, setFiles] = useState<{ id: string; documentType: string; file: File }[]>([]);

  return <section className="recognition-attachments" aria-label="등록된 등급 첨부파일">
    <h4>첨부파일 <small>{files.length}개</small></h4>
    <div className="recognition-attachment-controls">
      <label>서류 종류<select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>{documentTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label>파일 추가<input type="file" multiple aria-describedby="recognition-attachment-note" onChange={(event) => {
        const selected = Array.from(event.target.files ?? []);
        setFiles((current) => [...current, ...selected.map((file) => ({ id: crypto.randomUUID(), documentType, file }))]);
        event.target.value = "";
      }} /></label>
    </div>
    <p id="recognition-attachment-note" className="recognition-preview-note">파일은 아직 서버에 저장되지 않습니다. 상세 화면을 닫으면 선택한 파일이 초기화됩니다.</p>
    {files.length === 0 ? <p className="recognition-preview-note">선택한 첨부파일이 없습니다. 서류 종류를 선택하고 파일을 추가해 주세요.</p> : <ul className="recognition-attachment-list">{files.map((item) => <li key={item.id}><b>{item.documentType}</b><AttachmentItem file={item.file} onRemove={() => setFiles((current) => current.filter((entry) => entry.id !== item.id))} /></li>)}</ul>}
  </section>;
}
