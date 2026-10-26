import type { EmploymentContract, EmploymentContractTerm, EmploymentWorkCondition, Recipient } from "./types";
import { getMatchingSummary } from "./lib/employment-contracts";
import { matchingStatusLabels } from "./EmploymentConditionsEditor";

const money = (value: number) => `${value.toLocaleString("ko-KR")}원`;

function ConditionDetails({ condition, term, recipients }: {
  condition: EmploymentWorkCondition; term?: EmploymentContractTerm; recipients: Recipient[];
}) {
  return <article className="employment-condition-card">
    <div className="condition-card-heading">
      <strong>{recipients.find((recipient) => recipient.id === condition.recipientId)?.name ?? (condition.recipientId ? "수급자 정보 확인 필요" : "수급자 미지정")}</strong>
      <span className="status-chip">{matchingStatusLabels[condition.matchingStatus]}</span>
    </div>
    <dl className="condition-detail-grid">
      <div><dt>서비스</dt><dd>{condition.serviceType} · {condition.familyCare ? "가족요양" : "일반 요양"}</dd></div>
      <div><dt>적용 기간</dt><dd>{condition.effectiveStartDate.replace(/-/g, "") || "시작일 미입력"}~{condition.effectiveEndDate.replace(/-/g, "") || "종료일 미입력"}</dd></div>
      <div><dt>근무 일정</dt><dd>{condition.workDays || "요일 미입력"} · {condition.workStartTime || "시작 미입력"}~{condition.workEndTime || "종료 미입력"} · 휴게 {condition.breakMinutes}분</dd></div>
      <div><dt>월 약정 최대 시간</dt><dd>{condition.monthlyHourLimit}시간</dd></div>
      <div><dt>임금 약정</dt><dd>{term?.wageAmount ? `${term.wageType} ${money(term.wageAmount)}` : "약정 미입력"}</dd></div>
      <div><dt>차량동행지원비</dt><dd>{condition.vehicleSupportPerVisit ? `이 수급자 동행 1회당 ${money(condition.vehicleSupportPerVisit)}` : "약정 없음"}</dd></div>
      {condition.statusDate && <div><dt>일시정지·종료 적용일</dt><dd>{condition.statusDate}</dd></div>}
      <div><dt>문서 확인</dt><dd>{condition.documentStatus === "confirmed" ? "확인 완료" : "문서 확인 필요"}</dd></div>
      {term && <div><dt>기타 월 수당 약정</dt><dd>식대 {money(term.nonTaxableMealAllowance)} · 기존 차량수당 {money(term.nonTaxableVehicleAllowance)} · 기타 {money(term.otherNonTaxablePay)}</dd></div>}
      {condition.changeReason && <div><dt>조건 변경·합의 메모</dt><dd>{condition.changeReason}</dd></div>}
    </dl>
  </article>;
}

export default function EmploymentConditionsDetails({ contract, recipients }: { contract: EmploymentContract; recipients: Recipient[] }) {
  const work = contract.workConditions;
  const matching = getMatchingSummary(contract);
  return <section className="employment-work-details" aria-label="수급자별 근로계약 조건">
    <div className="section-title-row"><h3>수급자별 계약 조건</h3><span className="status-chip">{matching.label}</span></div>
    {!work ? <p className="condition-note">{contract.isDraft ? "기본 정보가 저장되었습니다. 상세 정보 입력에서 계좌·기간·근무 조건을 보완해 주세요." : "기존 계약입니다. 계약 수정에서 수급자·매칭 상태·근무 조건을 확인해 주세요. 기존 임금·수당은 보존되어 있습니다."}</p> : <>
      <p className="condition-review" role="status">{matching.review}. 보험 가입·제외는 자동 확정하지 않습니다.</p>
      {work.conditions.map((condition) => <ConditionDetails key={condition.termId} condition={condition}
        term={contract.contractTerms.find((term) => term.id === condition.termId)} recipients={recipients} />)}
      <div className="condition-common-payment"><strong>근로자 월정액 교통비 약정 · {money(work.monthlyTravelAllowance)}</strong>
        <p>만근 기준 대비 인정 근무 횟수로 비례 지급하는 약정입니다. 여기서는 실제 급여를 계산하지 않습니다.</p></div>
      <p className="condition-note">지급 항목의 비과세 인정 여부는 별도 확인 대상입니다. 실제 근무·차량동행 횟수는 후속 급여 기능에서 관리합니다.</p>
      <details className="condition-history"><summary>수정 전 조건 기록 ({work.history.length}건)</summary>
        <p className="condition-note">저장 전 내용을 자동 보관한 기록입니다. 과거 적용 조건은 각 조건의 적용 기간으로 구분해 주세요.</p>
        {!work.history.length && <p>수정 기록이 없습니다.</p>}
        {[...work.history].reverse().map((snapshot, index) => <details key={`${snapshot.changedAt}-${index}`}>
          <summary>{new Date(snapshot.changedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 수정 전</summary>
          <p>월정액 교통비 약정 {money(snapshot.monthlyTravelAllowance)}</p>
          {snapshot.conditions.length ? snapshot.conditions.map((condition) => <ConditionDetails key={condition.termId} condition={condition}
            term={snapshot.contractTerms.find((term) => term.id === condition.termId)} recipients={recipients} />)
            : <p>기존 계약 조건: {snapshot.contractTerms.map((term) => `${term.wageType} ${money(term.wageAmount)}`).join(" / ")}</p>}
        </details>)}
      </details>
    </>}
  </section>;
}
