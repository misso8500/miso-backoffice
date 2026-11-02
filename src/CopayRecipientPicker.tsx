import { useEffect, useRef, useState } from 'react';
import type { Recipient } from './types';
import type { CopayRecipientRequest } from './lib/copay-recipient';
import { X } from 'lucide-react';

export default function CopayRecipientPicker({ row, recipients, busy, error, onChoose, onCreate, onClose }: {
  row: CopayRecipientRequest; recipients: Recipient[]; busy: boolean; error: string;
  onChoose: (recipient: Recipient) => void; onCreate: () => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), [query, setQuery] = useState(row.name);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const matches = recipients.filter(p => `${p.name} ${p.operationalName || ''} ${p.longTermCareNumber}`.includes(query.trim()));
  return <dialog ref={dialog} className="copay-recipient-picker" aria-labelledby="copay-recipient-picker-title" onCancel={e => { if (busy) e.preventDefault(); else onClose(); }} onClose={onClose}>
    <div className="section-title-row"><h2 id="copay-recipient-picker-title">수급자 기초정보 연결</h2><button type="button" className="icon-button" aria-label="수급자 연결 닫기" disabled={busy} onClick={onClose}><X size={18}/></button></div>
    <p>{row.month} 종합현황 · {row.name} · {row.grade}등급</p><p>같은 수급자가 이미 등록되어 있는지 확인하고 연결하세요. 동명이인은 업무식별명과 인정번호를 확인해 주세요.</p>
    <label>기존 수급자 검색<input type="search" value={query} disabled={busy} onChange={e => setQuery(e.target.value)}/></label>
    <div className="copay-recipient-matches">{matches.slice(0, 30).map(p => <button className="copay-recipient-match" type="button" key={p.id} disabled={busy} onClick={() => onChoose(p)}><strong>{p.name} <small>{p.careGrade}</small></strong><span>{p.operationalName || '업무식별명 없음'}</span><small>인정번호 {p.longTermCareNumber || '미등록'}{p.isDraft ? ' · 정보 입력 중' : ''}{!p.enabled ? ' · 비활성' : ''}</small><b>이 수급자 연결</b></button>)}{!matches.length && <p>검색에 맞는 수급자가 없습니다.</p>}{matches.length > 30 && <p>검색어를 구체적으로 입력해 주세요.</p>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>닫기</button><button type="button" className="primary-button" disabled={busy} onClick={onCreate}>별도 수급자로 새로 등록</button></div>
  </dialog>;
}
