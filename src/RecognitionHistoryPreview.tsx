import DateInput from "./DateInput";
import DriveTestImages from "./DriveTestImages";
import { useState } from "react";
import "./RecognitionHistoryPreview.css";
import type { Recipient } from "./types";
import RecognitionAttachments from "./RecognitionAttachments";
import DocumentImages from "./DocumentImages";

type Period = { id: string; grade: string; start: string; end: string };

export default function RecognitionHistoryPreview({ recipient }: { recipient: Recipient }) {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [adding, setAdding] = useState(false);
  const [grade, setGrade] = useState(recipient.careGrade || "1등급");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");
  return <section className="recognition-preview" aria-label="수급자 서류 미리보기">
    <header><div><span className="recognition-preview-badge">수급자 서류</span><h3>공통 서류와 인정 기간별 서류</h3></div></header>
    <p className="recognition-preview-note">드라이브 연결 전 화면입니다. 인정 기간과 선택한 이미지는 저장되지 않으며 상세 화면을 닫으면 초기화됩니다.</p>
    <h4 className="document-group-heading">공통 서류 · 인정 기간과 관계없이 확인</h4>
    <DocumentImages title="신분증" />
    <DriveTestImages />
    <div className="recognition-preview-heading"><h4>인정 기간별 서류</h4><button type="button" onClick={() => setAdding(!adding)}>{adding ? "입력 접기" : "+ 인정 기간 입력 (미리보기)"}</button></div>
    <p className="recognition-preview-note">장기요양인정서에 적힌 인정 유효기간을 입력해 주세요. 이용계약 기간과 별개이며, 기존 이용계약 기간을 대신 사용하지 않습니다.</p>
    {adding && <form className="recognition-preview-add" onSubmit={(event) => {
      event.preventDefault();
      if (!start || !end || end < start) { setError("인정 종료일은 시작일과 같거나 이후여야 합니다."); return; }
      if (periods.some((period) => period.start === start && period.end === end)) { setError("같은 인정 기간이 이미 있습니다. 아래 서류 묶음을 확인해 주세요."); return; }
      setPeriods((current) => [...current, { id: crypto.randomUUID(), grade, start, end }].sort((a, b) => b.start.localeCompare(a.start)));
      setAdding(false); setStart(""); setEnd(""); setError("");
    }}>
      <label className="recognition-reason">인정 등급<select value={grade} onChange={(event) => setGrade(event.target.value)}>{["1등급", "2등급", "3등급", "4등급", "5등급", "인지지원등급"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <div className="recognition-preview-dates"><label>인정 시작일<DateInput required min="1000-01-01" max="9999-12-31" value={start} onChange={(event) => { setStart(event.target.value); setError(""); }} /></label><label>인정 종료일<DateInput required min={start || "1000-01-01"} max="9999-12-31" value={end} onChange={(event) => { setEnd(event.target.value); setError(""); }} /></label></div>
      {error && <p role="alert">{error}</p>}
      <button type="submit">서류 묶음 미리보기</button>
    </form>}
    {!periods.length && <div className="contract-attachment-empty"><strong>인정 기간을 먼저 입력해 주세요</strong><span>기간마다 인정서·이용계획서·복지용구확인서를 따로 확인할 수 있습니다.</span></div>}
    {periods.map((period) => <details key={period.id} className="recognition-preview-history" open><summary><b>{period.start.replaceAll("-", "")} ~ {period.end.replaceAll("-", "")}</b><span>{period.grade} · 저장 전</span></summary><RecognitionAttachments /></details>)}
  </section>;
}
