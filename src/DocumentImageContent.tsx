import { useRef, useState } from "react";

export default function DocumentImageContent({ src, alt, onError }: { src: string; alt: string; onError?: () => void }) {
  const [enlarged, setEnlarged] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  return <div className="document-image-content">
    <div className="document-image-toolbar" role="group" aria-label="이미지 보기 크기">
      <button type="button" className="secondary-button" aria-pressed={!enlarged} onClick={() => {
        setEnlarged(false); viewport.current?.scrollTo(0, 0);
      }}>전체 보기</button>
      <button type="button" className="secondary-button" aria-pressed={enlarged} onClick={() => setEnlarged(true)}>확대해서 읽기</button>
      <span>{enlarged ? "스크롤하여 아래 내용까지 확인하세요." : "이미지 전체를 화면에 맞춰 표시합니다."}</span>
    </div>
    <div ref={viewport} className={`document-large-image${enlarged ? " is-enlarged" : ""}`} tabIndex={0} aria-label={enlarged ? "확대 이미지, 스크롤하여 읽기" : "전체 이미지"}>
      <img src={src} alt={alt} onError={onError} />
    </div>
  </div>;
}
