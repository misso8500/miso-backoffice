// Never render or save using a partial/older API contract.
export function validatePlanResponse(value) {
  if (!value || !Array.isArray(value.plans) || !value.context || !value.context.institutionPeriod || !Array.isArray(value.context.recognitionPeriods)) {
    throw new Error('계획 API가 이전 버전으로 실행 중입니다. 로컬에서는 npm run api를 실행한 터미널에서 Ctrl+C를 누른 뒤 npm run api로 다시 시작해 주세요. 배포 환경에서는 최신 코드를 재배포해 주세요. 이후 다시 불러오기를 눌러 주세요.');
  }
  if (!Number.isInteger(value.version) || !Array.isArray(value.history) || !value.legacyNotes || value.plans.some(p=>!p || !p.schedule)) {
    throw new Error('계획 응답 형식이 올바르지 않습니다. 다시 불러오기를 눌러 주세요. 문제가 계속되면 담당자에게 문의해 주세요.');
  }
  return value;
}
