import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export default function StaffPaperPreviewModal({ title, children, onClose }: {
  title: string; children: ReactNode; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return <dialog ref={dialog} className="staff-preview-modal" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}>
    <header className="staff-preview-heading"><h2 id={titleId}>{title} · 서식 미리보기</h2><button type="button" className="secondary-button" autoFocus onClick={onClose} aria-label="서식 미리보기 닫기"><X size={18}/><span>닫기</span></button></header>
    <div className="staff-preview-scroll"><div className="staff-paper-preview">{children}</div></div>
  </dialog>;
}
