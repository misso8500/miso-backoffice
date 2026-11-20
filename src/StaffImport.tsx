import { useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { applyStaffImport, previewStaffImport, readStaffImport, type StaffImportPreview, type StaffImportRow } from './lib/staff-import';

const actions = {
  create: '직원 추가', connect: '기존 계약에 연결', update: '기초정보 갱신',
  unchanged: '변경 없음', duplicate: '중복 행', review: '확인 필요'
};

export default function StaffImport({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<StaffImportRow[]>([]);
  const [preview, setPreview] = useState<StaffImportPreview | null>(null);
  const [confirmed, setConfirmed] = useState<number[]>([]);
  const [checkedPreview, setCheckedPreview] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    return () => { if (node?.open) node.close(); };
  }, []);
  async function load(file: File) {
    setBusy(true); setError(''); setRows([]); setPreview(null); setConfirmed([]); setCheckedPreview([]);
    try {
      const rows = await readStaffImport(file);
      setRows(rows);
      setPreview(await previewStaffImport(rows, []));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '직원 목록을 읽지 못했습니다.'); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!preview || busy) return;
    setBusy(true); setError('');
    try {
      const saved = await applyStaffImport(rows, preview.token, confirmed);
      onSaved(`희망이음 가져오기 완료 · 직원 추가 ${saved.created}명 · 기존 계약 연결 ${saved.connected}명 · 갱신 ${saved.updated}명`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '직원 목록을 반영하지 못했습니다.');
      setPreview(null);
    } finally { setBusy(false); }
  }
  const needsPreview = JSON.stringify(confirmed) !== JSON.stringify(checkedPreview);
  async function refreshPreview() {
    setBusy(true); setError('');
    try {
      setPreview(await previewStaffImport(rows, confirmed));
      setCheckedPreview(confirmed);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '미리보기를 불러오지 못했습니다.'); }
    finally { setBusy(false); }
  }
  const counts = Object.fromEntries(Object.keys(actions).map(action => [action, preview?.rows.filter(row => row.action === action).length ?? 0]));
  const changes = counts.create + counts.connect + counts.update;
  return <dialog ref={dialog} className="recipient-overview-dialog staff-import-dialog" aria-label="희망이음 가져오기"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="recipient-overview-header">
      <div><small>직원 기초정보</small><h2>희망이음 가져오기</h2></div>
      <button type="button" className="icon-button" aria-label="닫기" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>
    </header>
    <div className="recipient-overview-body">
      <label className="recipient-overview-card"><span><Upload size={16} aria-hidden="true" /> 인력변경관리(장기요양) 엑셀</span>
        <input type="file" accept=".xlsx" disabled={busy}
          onChange={event => { const file = event.target.files?.[0]; if (file) void load(file); }} />
      </label>
      {busy && <p role="status">직원 정보를 확인하고 있습니다.</p>}
      {error && <p className="error-banner" role="alert">{error}</p>}
      {preview && <>
        <div className="staff-import-counts" aria-label="가져오기 요약">
          {Object.entries(actions).map(([key, label]) => <span key={key}>{label} <strong>{counts[key]}건</strong></span>)}
        </div>
        <p className="recipient-directory-help">직원번호를 우선 사용하고, 생년월일이 없는 이름 일치는 체크 후 미리보기를 다시 확인하세요. 미확인·중복 행은 건너뜁니다.</p>
        <div className="recipient-directory-list directory-table staff-import-preview"><table>
          <thead><tr><th scope="col">엑셀 행</th><th scope="col">직원</th><th scope="col">처리</th><th scope="col">반영 항목·사유</th></tr></thead>
          <tbody>{preview.rows.map(row => <tr key={row.row}>
            <td>{row.row}</td><th scope="row">{row.name}</th><td>{actions[row.action]}</td><td>{row.note || '기초정보'}{row.confirmName&&<label className="staff-import-confirm">
              <input type="checkbox" aria-label={row.row + '행 기존 직원 연결 확인'} disabled={busy} checked={confirmed.includes(row.row)}
                onChange={event => setConfirmed(current => event.target.checked ? [...current, row.row] : current.filter(value => value !== row.row))} />
              기존 직원과 연결 확인
            </label>}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
    </div>
    <footer className="recipient-overview-save-host staff-overview-footer">
      <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>닫기</button>
      {(!preview || needsPreview) && rows.length > 0 && !busy &&
        <button type="button" className="secondary-button" onClick={() => void refreshPreview()}>미리보기 다시 확인</button>}
      <button type="button" className="primary-button" disabled={busy || needsPreview || !changes} onClick={() => void apply()}>
        {changes ? `${changes}건 반영` : '반영'}
      </button>
    </footer>
  </dialog>;
}
