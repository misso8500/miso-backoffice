import { useEffect, useState, type FormEvent } from 'react';
import { ChevronRight, FileText, Plus, Search } from 'lucide-react';
import PageHeading from './PageHeading';
import type { EmploymentContract } from './types';
import { loadStaffProfiles, newStaffProfile, saveStaffProfile, staffDirectoryEntries, staffDocumentTypes, type StaffDocument, type StaffProfile } from './lib/staff-directory';
import { workToday } from './lib/work-tasks';
import './StaffDirectory.css';

const sections = ['기초정보', '서류', '근로계약'] as const;
const expectedPages = { contract: '3쪽', health: '1~2쪽', criminal: '3쪽', certificate: '1쪽' };
const options = (values: string[]) => <><option value="">미입력</option>{values.map(value => <option key={value}>{value}</option>)}</>;

export default function StaffDirectory({ contracts, loading, error, onReload, onOpenContract, onCreateContract }: {
  contracts: EmploymentContract[]; loading: boolean; error: string | null; onReload: () => void;
  onOpenContract: (contract: EmploymentContract) => void;
  onCreateContract: (profile: StaffProfile, contract?: EmploymentContract) => void;
}) {
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('전체');
  const [profileError, setProfileError] = useState('');
  const [busy, setBusy] = useState(true);
  const [savedNotice, setSavedNotice] = useState('');
  const [editor, setEditor] = useState<{ profile: StaffProfile; contracts: EmploymentContract[] } | null>(null);
  async function load() {
    setBusy(true); setProfileError('');
    try { setProfiles((await loadStaffProfiles()).profiles); }
    catch (cause) { setProfileError(cause instanceof Error ? cause.message : '직원 기초정보를 불러오지 못했습니다.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  const entries = staffDirectoryEntries(profiles, contracts);
  const shown = entries.filter(item => (filter === '전체' || (item.profile?.status || '미입력') === filter) &&
    [item.name, item.profile?.phone ?? item.contracts[0]?.workerPhone, item.profile?.job ?? item.contracts[0]?.jobTitle].some(value =>
      value?.toLowerCase().includes(query.trim().toLowerCase())));
  return <section className="recipient-directory-workspace">
    <PageHeading title="직원 기초정보" description="직원별 연락처, 입·퇴사, 희망이음 진행과 서류를 확인합니다.">
      <button type="button" className="primary-button" disabled={busy || !!profileError} onClick={() => setEditor({ profile: newStaffProfile(), contracts: [] })}><Plus size={17} /> 직원 추가</button>
    </PageHeading>
    {(error || profileError) && <div className="error-banner" role="alert">{profileError || error}
      <button type="button" className="secondary-button" onClick={() => { onReload(); void load(); }}>다시 불러오기</button></div>}
    {savedNotice && <p role="status">{savedNotice}</p>}
    <div className="list-toolbar">
      <div><h2>직원 목록</h2><span>{shown.length}명</span></div>
      <div className="toolbar-controls">
        <select className="filter-select" aria-label="재직 상태" value={filter} onChange={e => setFilter(e.target.value)}>
          {['전체','재직','휴직','퇴사','입사 예정','미입력'].map(value => <option key={value}>{value}</option>)}
        </select>
        <label className="search-box"><Search size={18} /><input type="search" aria-label="직원 검색" placeholder="이름·연락처·직종"
          value={query} onChange={e => setQuery(e.target.value)} /></label>
      </div>
    </div>
    {(loading || busy) && <p role="status">직원 명부를 불러오는 중입니다.</p>}
    {shown.length > 0 && <div className="recipient-directory-list">
      <div className="recipient-directory-columns" aria-hidden="true"><span>직원</span><span>입사 · 퇴사</span><span>희망이음 · 서류</span><span>재직 상태</span><span /></div>
      {shown.map(({ key, name, profile, contracts }) => <div className="recipient-directory-row" key={key}>
        <button type="button" className="recipient-directory-open" aria-label={name} disabled={busy || !!profileError}
          onClick={() => setEditor({ profile: profile ?? newStaffProfile(contracts[0]), contracts })} />
        <span className="recipient-directory-identity"><strong>{name}</strong><small>{profile?.job || contracts[0]?.jobTitle || '직종 미입력'}</small></span>
        <span><strong>입사 {profile?.start || '미입력'}</strong><small>퇴사 {profile?.end || '미입력'}</small></span>
        <span><strong>입사보고 {profile?.reporting || '미입력'}</strong><small>서류 {profile?.documents.filter(document => document.url).length ?? 0}건</small></span>
        <span><em className={`recipient-directory-status${profile?.status ? '' : ' is-draft'}`}>{profile?.status || '미입력'}</em></span>
        <ChevronRight size={16} />
      </div>)}
    </div>}
    {!shown.length && !busy && !loading && <div className="empty-state"><p>{query || filter !== '전체' ? '검색 조건에 맞는 직원이 없습니다.' : '직원 추가로 명부를 시작하세요.'}</p></div>}
    {editor && <StaffEditor key={editor.profile.id} initial={editor.profile}
      contracts={entries.find(item => item.profile?.id === editor.profile.id)?.contracts ?? editor.contracts}
      eligible={entries.filter(item => !item.profile).flatMap(item => item.contracts.slice(0, 1))}
      onClose={() => setEditor(null)} onSaved={saved => {
        setProfiles(current => [...current.filter(profile => profile.id !== saved.id), saved]);
        setSavedNotice(saved.name + ' 직원 정보를 저장했습니다.');
      }} onOpenContract={contract => { setEditor(null); onOpenContract(contract); }}
      onCreateContract={(profile, contract) => { setEditor(null); onCreateContract(profile, contract); }} />}
  </section>;
}

function StaffEditor({ initial, contracts, eligible, onClose, onSaved, onOpenContract, onCreateContract }: {
  initial: StaffProfile; contracts: EmploymentContract[]; eligible: EmploymentContract[];
  onClose: () => void; onSaved: (profile: StaffProfile) => void; onOpenContract: (contract: EmploymentContract) => void;
  onCreateContract: (profile: StaffProfile, contract?: EmploymentContract) => void;
}) {
  const [profile, setProfile] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [section, setSection] = useState<typeof sections[number]>('기초정보');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = JSON.stringify(profile) !== JSON.stringify(baseline);
  const set = <K extends keyof StaffProfile>(key: K, value: StaffProfile[K]) => setProfile(previous => ({ ...previous, [key]: value }));
  const canLeave = () => !busy && (!dirty || window.confirm('저장하지 않은 직원 정보 변경을 닫을까요?'));
  const close = () => { if (canLeave()) onClose(); };
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  const displayContracts = profile.anchorContractId
    ? (contracts.length ? contracts : eligible.filter(item => item.id === profile.anchorContractId)) : [];
  const currentYear = workToday().slice(0, 4);
  function editDocument(id: string, value: Partial<StaffDocument>) {
    set('documents', profile.documents.map(document => document.id === id ? { ...document, ...value } : document));
  }
  function addDocument(type: StaffDocument['type']) {
    set('documents', [...profile.documents, { id: crypto.randomUUID(), type, year: type === 'contract' ? currentYear : '', url: '', pages: null }]);
  }
  function field(label: string, key: 'name'|'birth'|'phone'|'job'|'start'|'end'|'reportingDate', type = 'text') {
    return <label>{label}<input type={type} required={key === 'name'} maxLength={100} value={profile[key]} onChange={e => set(key, e.target.value)} /></label>;
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!profile.name.trim()) { setSection('기초정보'); setError('직원 이름을 입력해 주세요.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await saveStaffProfile(profile);
      setBaseline(saved); setProfile(saved); onSaved(saved); setNotice('저장했습니다.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '직원 정보를 저장하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <dialog className="recipient-overview-dialog staff-overview-dialog" aria-label={profile.name ? profile.name + ' 직원 상세' : '직원 추가'}
    ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { event.preventDefault(); close(); }}>
    <header className="recipient-overview-header"><div><small>직원 기초정보</small><h2>{baseline.name || '직원 추가'}</h2></div>
      <button type="button" className="secondary-button" disabled={busy} onClick={close}>닫기</button></header>
    <nav className="app-navigation-tabs recipient-detail-tabs" aria-label="직원 상세 탭">{sections.map(item => <button type="button" key={item}
      disabled={busy} aria-current={section === item ? 'page' : undefined} onClick={() => setSection(item)}>{item}</button>)}</nav>
    <form className="staff-overview-form" onSubmit={save}>
      <div className="recipient-overview-body">
        <fieldset disabled={busy} className="staff-detail-fields">
          {section === '기초정보' && <>
            <section className="recipient-overview-card"><h3>연락·재직 정보</h3><div className="staff-form-grid">
              {field('이름','name')}{field('생년월일','birth','date')}{field('연락처','phone','tel')}{field('직종','job')}
              <label>재직 상태<select value={profile.status} onChange={e => set('status',e.target.value)}>{options(['입사 예정','재직','휴직','퇴사'])}</select></label>
              {field('입사일','start','date')}{field('퇴사일','end','date')}
            </div></section>
            <section className="recipient-overview-card"><h3>희망이음 처리 현황</h3><div className="staff-form-grid">
              <label>인사카드 등록<select value={profile.personnel} onChange={e => set('personnel',e.target.value)}>{options(['대기','진행 중','완료'])}</select></label>
              <label>입사보고<select aria-label="입사보고" value={profile.reporting} onChange={e => set('reporting',e.target.value)}>{options(['대기','진행 중','완료'])}</select></label>
              {field('입사보고 처리일','reportingDate','date')}
            </div><label>인사 업무 메모<textarea rows={2} maxLength={2000} value={profile.memo} onChange={e => set('memo',e.target.value)} /></label></section>
          </>}
          {section === '서류' && Object.entries(staffDocumentTypes).map(([type, label]) => {
            const kind = type as StaffDocument['type'];
            const files = profile.documents.filter(document => document.type === kind);
            return <section className="recipient-overview-card staff-document-card" key={type}>
              <div className="recipient-overview-card-heading"><h3><FileText size={16} /> {label} <small>{expectedPages[kind]}</small></h3>
                <button type="button" className="secondary-button" disabled={profile.documents.length >= 100} onClick={() => addDocument(kind)}>링크 추가</button></div>
              {!files.length && <p>등록된 링크가 없습니다.</p>}
              {files.map(document => <div className="staff-document-row" key={document.id}>
                {kind === 'contract' && <label>계약 연도<input required inputMode="numeric" pattern="[1-9][0-9]{3}" maxLength={4} value={document.year}
                  onChange={e => editDocument(document.id,{year:e.target.value})} /></label>}
                <label>Google Drive 링크<input type="url" maxLength={2000} value={document.url} onChange={e => editDocument(document.id,{url:e.target.value})} /></label>
                <label>페이지 수<input type="number" min={1} max={500} value={document.pages ?? ''} onChange={e => editDocument(document.id,{pages:e.target.value ? e.target.valueAsNumber : null})} /></label>
                {baseline.documents.some(item => item.id === document.id && item.url && item.url === document.url) &&
                  <a href={document.url} target="_blank" rel="noreferrer">Drive에서 열기</a>}
                <button type="button" className="secondary-button" onClick={() => set('documents', profile.documents.filter(item => item.id !== document.id))}>링크 제거</button>
              </div>)}
            </section>;
          })}
          {section === '근로계약' && <section className="recipient-overview-card"><div className="recipient-overview-card-heading">
            <h3>연도별 근로계약</h3><button type="button" className="primary-button" disabled={!baseline.version || dirty}
              onClick={() => onCreateContract(baseline, displayContracts[0])}>{displayContracts.length ? '추가·갱신계약' : '근로계약 등록'}</button></div>
            {!baseline.version && <p>직원 기초정보를 먼저 저장하세요.</p>}
            {displayContracts.map(contract => <div className="staff-contract-row" key={contract.id}>
              <span>{contract.contractStartDate || '시작일 미등록'} ~ {contract.contractEndDate || '종료일 미등록'}{contract.isDraft ? ' · 작성 중' : ''}</span>
              <button type="button" className="secondary-button" onClick={() => { if (canLeave()) onOpenContract(contract); }}>계약 정보</button>
            </div>)}
            {!profile.anchorContractId && <label>기존 근로계약 연결<select value="" onChange={e => set('anchorContractId',e.target.value)}>
              <option value="">직원의 기존 계약 선택</option>{eligible.map(contract => <option key={contract.id} value={contract.id}>
                {contract.workerName} · {contract.workerBirthDate || '생년월일 미입력'} · {contract.contractStartDate || '시작일 미입력'}
              </option>)}</select></label>}
          </section>}
        </fieldset>
      </div>
      <footer className="recipient-overview-save-host staff-overview-footer">
        {error && <p role="alert" className="error-banner">{error}</p>}{notice && <p role="status">{notice}</p>}
        <button type="submit" className="primary-button" disabled={busy || (!dirty && !!baseline.version)}>{busy ? '저장 중…' : '직원 정보 저장'}</button>
      </footer>
    </form>
  </dialog>;
}
