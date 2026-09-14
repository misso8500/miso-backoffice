import { useState } from "react";
import "./RecognitionHistoryPreview.css";
import type { Recipient } from "./types";
import RecognitionAttachments from "./RecognitionAttachments";

export default function RecognitionHistoryPreview({ recipient }: { recipient: Recipient }) {
  const registeredPeriod = `${recipient.serviceStartDate || "미등록"} ~ ${recipient.serviceEndDate || "미등록"}`;
  const [hidden, setHidden] = useState(false);
  const [adding, setAdding] = useState(false);
  const [grade, setGrade] = useState(recipient.careGrade);
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [periodError, setPeriodError] = useState("");
  const period = `${startDate.replaceAll("-", ".")} ~ ${endDate.replaceAll("-", ".")}`;
  const [added, setAdded] = useState(false);

  if (hidden) return <button type="button" className="secondary-button" onClick={() => setHidden(false)}>등급·서류 다시 보기</button>;

  return (
    <section className="recognition-preview" aria-label="등급과 서류 이력">
      <header>
        <div><span className="recognition-preview-badge">수급자 등록 정보</span><h3>등급과 서류를 한눈에</h3></div>
        <button type="button" onClick={() => setHidden(true)}>숨기기</button>
      </header>
      <p className="recognition-preview-note">등록된 등급과 이용계약 기간을 표시합니다. 새 이력 추가는 체험용이며, 추가한 내용은 저장되지 않고 상세 화면을 닫으면 초기화됩니다.</p>

      <div className="recognition-preview-comparison">
        <div className="recognition-preview-current"><span>등록된 등급</span><strong>{recipient.careGrade || "미등록"}</strong><small>장기요양이용계약 기간<br />{registeredPeriod}</small><RecognitionAttachments /></div>
        {added && <><span aria-hidden="true">→</span><div><span>추가한 이력</span><strong>{grade}</strong><small>급여제공 기간<br />{period}</small></div></>}
      </div>

      <div className="recognition-preview-heading"><h4>인정 이력별 서류</h4><button type="button" disabled={added} onClick={() => setAdding(!adding)}>+ 새 이력 추가</button></div>
      {adding && (
        <form className="recognition-preview-add" onSubmit={(event) => {
          event.preventDefault();
          if (!startDate || !endDate || endDate < startDate) {
            setPeriodError("급여제공 종료일은 시작일과 같거나 이후여야 합니다.");
            return;
          }
          setPeriodError("");
          setAdded(true);
          setAdding(false);
        }}>
          <label className="recognition-reason">사유<select required value={reason} onChange={(event) => setReason(event.target.value)}><option value="" disabled>선택</option><option>등급상향 신청</option><option>갱신</option></select></label>
          <label>새 등급 <select value={grade} onChange={(event) => setGrade(event.target.value)}>{["1등급", "2등급", "3등급", "4등급", "5등급", "인지지원등급"].map((value) => <option key={value}>{value}</option>)}</select></label>
          <div className="recognition-preview-dates">
            <label>급여제공 시작일<input type="date" required min="1000-01-01" max="9999-12-31" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPeriodError(""); }} /></label>
            <label>급여제공 종료일<input type="date" required min={startDate || "1000-01-01"} max="9999-12-31" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPeriodError(""); }} /></label>
          </div>
          {periodError && <p role="alert">{periodError}</p>}
          <p>입력한 급여제공 기간과 서류를 이 이력에 함께 표시합니다.</p>
          <button type="submit">추가</button>{" "}
          <button type="button" onClick={() => { setAdding(false); setPeriodError(""); }}>취소</button>
        </form>
      )}

      {added && <details className="recognition-preview-history" open><summary><b>추가한 이력 · {grade}</b><span>급여제공 기간 {period} · {reason}</span></summary><p>직접 입력한 등급과 급여제공 기간입니다. 실제 수급자 등록 정보에는 반영되지 않습니다.</p></details>}
      <div className="recognition-preview-history">
        <p>등록된 이전 등급 이력이 없습니다.</p>
      </div>
      <p className="recognition-preview-note">신분증은 등급과 관계없는 공통 서류로 별도 보관합니다.</p>
      {added && <button type="button" onClick={() => { setAdded(false); setGrade(recipient.careGrade); setReason(""); setStartDate(""); setEndDate(""); setPeriodError(""); }}>추가한 이력 되돌리기</button>}
    </section>
  );
}
