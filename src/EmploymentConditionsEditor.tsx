import DateInput from "./DateInput";
import { Plus, Trash2 } from "lucide-react";
import type { EmploymentWorkCondition, Recipient } from "./types";

export type EmploymentConditionFormTerm = {
  id: string;
  wageType: "월급" | "시급";
  wageAmount: string;
  nonTaxableMealAllowance: string;
  nonTaxableVehicleAllowance: string;
  otherNonTaxablePay: string;
  condition: EmploymentWorkCondition;
};

export const createEmptyWorkCondition = (termId: string): EmploymentWorkCondition => ({
  termId, recipientId: "", serviceType: "방문요양", familyCare: false, matchingStatus: "pending",
  statusDate: "", effectiveStartDate: "", effectiveEndDate: "", workDays: "",
  workStartTime: "", workEndTime: "", breakMinutes: 0, monthlyHourLimit: 59.5,
  vehicleSupportPerVisit: 0, changeReason: "", documentStatus: "needs_confirmation"
});

export const matchingStatusLabels = { pending: "매칭 대기", active: "매칭 확정", paused: "서비스 일시정지", ended: "서비스 종료" };

type Props = {
  detailed: boolean;
  onEnable: () => void;
  terms: EmploymentConditionFormTerm[];
  recipients: Recipient[];
  startDate: string;
  endDate: string;
  monthlyTravelAllowance: string;
  onTravelChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onTermChange: (id: string, field: "wageType" | "wageAmount" | "nonTaxableMealAllowance" | "nonTaxableVehicleAllowance" | "otherNonTaxablePay", value: string) => void;
  onConditionChange: (id: string, patch: Partial<EmploymentWorkCondition>) => void;
};

export default function EmploymentConditionsEditor(props: Props) {
  if (!props.detailed) return <section className="form-section" aria-labelledby="legacy-terms-title">
    <div className="section-title-row"><h3 id="legacy-terms-title">기존 계약 조건</h3>
      <button type="button" className="secondary-button" onClick={props.onEnable}>수급자별 조건 등록</button></div>
    <p className="condition-note">기존 임금·수당만 수정할 수 있습니다. 수급자별 조건은 확인 후 등록해 주세요.</p>
    {props.terms.map((term, index) => <fieldset className="employment-condition-card" key={term.id}>
      <legend>조건 {index + 1}</legend><div className="form-grid">
        <label><span>임금 형태</span><select value={term.wageType} onChange={(event) => props.onTermChange(term.id, "wageType", event.target.value)}><option>시급</option><option>월급</option></select></label>
        {([['wageAmount', '임금 약정 (원)'], ['nonTaxableMealAllowance', '월 식대 약정 (원)'], ['nonTaxableVehicleAllowance', '기존 월 차량수당 (원)'], ['otherNonTaxablePay', '기타 월 수당 (원)']] as const).map(([field, label]) =>
          <label key={field}><span>{label}</span><input type="number" min={field === "wageAmount" ? 1 : 0} required={field === "wageAmount"} value={term[field]}
            onChange={(event) => props.onTermChange(term.id, field, event.target.value)} /></label>)}
      </div></fieldset>)}
  </section>;
  return (
    <section className="form-section employment-conditions-editor" aria-labelledby="terms-form-title">
      <div className="section-title-row">
        <h3 id="terms-form-title">수급자별 계약 조건</h3>
        <button type="button" className="secondary-button" onClick={props.onAdd}><Plus size={16} /> 조건 추가</button>
      </div>
      <p className="condition-note">매칭 전에도 계약을 보관할 수 있습니다. 수급자마다 시급·근무시간·지원 약정을 구분해 주세요.</p>
      <p className="condition-note">같은 수급자의 조건이 변경되면 이전 조건 종료일을 조정하고 새 조건을 추가해 주세요. 적용 기간은 서로 겹칠 수 없습니다.</p>
      {props.terms.map((term, index) => {
        const condition = term.condition;
        const update = (patch: Partial<EmploymentWorkCondition>) => props.onConditionChange(term.id, patch);
        return (
          <fieldset className="employment-condition-card" key={term.id}>
            <legend>조건 {index + 1}</legend>
            <div className="condition-card-heading">
              <strong>{props.recipients.find((recipient) => recipient.id === condition.recipientId)?.name ?? "수급자 미지정"}</strong>
              <button type="button" className="icon-button" disabled={props.terms.length === 1}
                aria-label={`${index + 1}번째 조건 제거`} onClick={() => props.onRemove(term.id)}><Trash2 size={16} /></button>
            </div>
            <div className="form-grid">
              <label><span>수급자</span><select value={condition.recipientId} onChange={(event) => update({ recipientId: event.target.value })}>
                <option value="">아직 정해지지 않음</option>
                {condition.recipientId && !props.recipients.some((recipient) => recipient.id === condition.recipientId) &&
                  <option value={condition.recipientId}>기존 수급자 · 정보 확인 필요</option>}
                {props.recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name} · {recipient.careGrade} · {recipient.longTermCareNumber}{recipient.enabled === false ? " · 비활성화" : ""}</option>)}
              </select></label>
              <label><span>매칭 상태</span><select value={condition.matchingStatus}
                onChange={(event) => update({ matchingStatus: event.target.value as EmploymentWorkCondition["matchingStatus"], statusDate: "" })}>
                {Object.entries(matchingStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              {["paused", "ended"].includes(condition.matchingStatus) && <label><span>일시정지·종료 적용일</span>
                <DateInput min={condition.effectiveStartDate || props.startDate} max={condition.effectiveEndDate || props.endDate}
                  required value={condition.statusDate} onChange={(event) => update({ statusDate: event.target.value })} /></label>}
              <label><span>서비스 제공 형태</span><input required value={condition.serviceType}
                placeholder="방문요양, 방문목욕 등" onChange={(event) => update({ serviceType: event.target.value })} /></label>
              <label><span>가족요양 구분</span><select value={String(condition.familyCare)} onChange={(event) => update({ familyCare: event.target.value === "true" })}>
                <option value="false">일반 요양</option><option value="true">가족요양</option></select></label>
              <label><span>조건 적용 시작일</span><DateInput min={props.startDate} max={props.endDate} required
                value={condition.effectiveStartDate || props.startDate} onChange={(event) => update({ effectiveStartDate: event.target.value })} /></label>
              <label><span>조건 적용 종료일</span><DateInput min={condition.effectiveStartDate || props.startDate} max={props.endDate} required
                value={condition.effectiveEndDate || props.endDate} onChange={(event) => update({ effectiveEndDate: event.target.value })} /></label>
              <label><span>임금 형태</span><select value={term.wageType}
                onChange={(event) => props.onTermChange(term.id, "wageType", event.target.value)}><option>시급</option><option>월급</option></select></label>
              <label><span>{term.wageType === "시급" ? "시간당 약정액 (원)" : "월 약정액 (원)"}</span><input type="number" min="1" step="1" required
                value={term.wageAmount} onChange={(event) => props.onTermChange(term.id, "wageAmount", event.target.value)} /></label>
              <label><span>근무 요일</span><input required placeholder="예: 월·수·금" value={condition.workDays}
                onChange={(event) => update({ workDays: event.target.value })} /></label>
              <label><span>월 약정 최대 시간</span><input type="number" min="0.5" max="744" step="0.5" required value={condition.monthlyHourLimit}
                onChange={(event) => update({ monthlyHourLimit: Number(event.target.value) })} /><small>59.5 조건은 이 수급자에 대한 월 상한입니다.</small></label>
              <label><span>근무 시작</span><input type="time" required value={condition.workStartTime} onChange={(event) => update({ workStartTime: event.target.value })} /></label>
              <label><span>근무 종료</span><input type="time" required value={condition.workEndTime} onChange={(event) => update({ workEndTime: event.target.value })} /></label>
              <label><span>휴게 시간 (분)</span><input type="number" min="0" step="1" value={condition.breakMinutes}
                onChange={(event) => update({ breakMinutes: Number(event.target.value) })} /></label>
              <label><span>차량동행지원비 · 1회 약정액 (원)</span><input type="number" min="0" step="1" value={condition.vehicleSupportPerVisit}
                onChange={(event) => update({ vehicleSupportPerVisit: Number(event.target.value) })} /><small>이 수급자에게 차량동행을 수행했을 때 적용합니다. 약정이 없으면 0원입니다.</small></label>
              <label><span>문서 확인 상태</span><select value={condition.documentStatus}
                onChange={(event) => update({ documentStatus: event.target.value as EmploymentWorkCondition["documentStatus"] })}>
                <option value="needs_confirmation">문서 확인 필요</option><option value="confirmed">문서 확인 완료</option></select></label>
              <label className="wide-field"><span>조건 변경 사유·합의 메모</span><textarea value={condition.changeReason}
                placeholder="예: 10월 15일부터 돌봄 난이도 증가로 시급 조정, 변경 문서 확인 예정"
                onChange={(event) => update({ changeReason: event.target.value })} /></label>
            </div>
            <details className="legacy-allowance-fields"><summary>식대·기존 수당 약정</summary>
              <div className="form-grid">
                {([['nonTaxableMealAllowance', '월 식대 약정 (원)'], ['nonTaxableVehicleAllowance', '기존 월 차량수당 약정 (원)'], ['otherNonTaxablePay', '기타 월 수당 약정 (원)']] as const).map(([field, label]) => (
                  <label key={field}><span>{label}</span><input type="number" min="0" step="1" value={term[field]}
                    onChange={(event) => props.onTermChange(term.id, field, event.target.value)} /></label>
                ))}
              </div>
              <p className="condition-note">기존 수당 값은 보존됩니다. 아래의 근로자 월정액 교통비와 중복 약정하지 않았는지 확인해 주세요.</p>
            </details>
          </fieldset>
        );
      })}
      <fieldset className="employment-condition-card">
        <legend>근로자 공통 지급 약정</legend>
        <label><span>월정액 교통비 약정 (원)</span><input type="number" min="0" step="1" value={props.monthlyTravelAllowance}
          onChange={(event) => props.onTravelChange(event.target.value)} /></label>
        <p className="condition-note">근로자에게 월 단위로 지급하는 항목입니다. 만근 기준 대비 인정 근무 횟수로 비례 지급하며, 실제 지급 계산은 추후 급여 화면에서 처리합니다.</p>
      </fieldset>
      <p className="condition-note">지원비 약정과 세법상 비과세 인정 여부는 별도 확인 대상입니다. 매칭 추가·중단 시 보험 적용 여부도 다시 확인해 주세요.</p>
    </section>
  );
}
