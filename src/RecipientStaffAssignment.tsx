import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Pencil } from 'lucide-react';
import type { BackofficeUser, Recipient } from './types';

export default function RecipientStaffAssignment({ recipient, users, saving, error, onAssign }: {
  recipient: Recipient; users: BackofficeUser[]; saving: boolean; error?: string; onAssign: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const current = users.find(user => user.id === recipient.assignedBackofficeUserId);
  const name = current?.name || (recipient.assignedBackofficeUserId ? '담당자 확인 필요' : '미배정');
  function close() { setEditing(false); requestAnimationFrame(() => button.current?.focus()); }
  useEffect(() => {
    if (!editing) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) setEditing(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [editing]);
  return <div ref={container} className="recipient-staff-assignment" onClick={event => event.stopPropagation()} onKeyDown={event => {
    if (editing && event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); close(); }
  }}>
    {editing ? <div className="recipient-staff-editor">
      <div className="recipient-staff-select"><select autoFocus aria-label={`${recipient.name} 담당 사회복지사 선택`} value={recipient.assignedBackofficeUserId || ''} disabled={saving} onChange={event => { onAssign(event.target.value); close(); }}>
        <option value="">미배정</option>
        {recipient.assignedBackofficeUserId && !current && <option value={recipient.assignedBackofficeUserId}>기존 담당자 · 확인 필요</option>}
        {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
      </select><ChevronDown size={16} aria-hidden="true" /></div>
      <button type="button" className="recipient-staff-cancel" onClick={close}>취소</button>
    </div> : <button ref={button} type="button" className="recipient-staff-button" disabled={saving || !users.length} aria-label={`${recipient.name} 담당 사회복지사 ${name}, 변경`} aria-expanded={editing} onClick={() => setEditing(true)}>
      <span title={name}>{saving ? '저장 중…' : name}</span><span className="recipient-staff-change"><Pencil size={13} aria-hidden="true" />변경</span>
    </button>}
    {!users.length && <small>담당자 정보가 없습니다.</small>}
    {saving && <small role="status">담당자 저장 중…</small>}
    {error && <small className="assignment-error" role="alert">{error}</small>}
  </div>;
}
