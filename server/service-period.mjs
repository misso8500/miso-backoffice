export function prepareServicePeriod(body, existing) {
  if (body.updatedAt !== existing.updatedAt) throw Object.assign(new Error('다른 사용자가 수정했습니다. 상세 화면을 다시 열어 주세요.'), { status: 409 });
  const valid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  if (!valid(body.serviceStartDate) || !valid(body.serviceEndDate) || body.serviceStartDate > body.serviceEndDate) throw Object.assign(new Error('이용계약 시작일과 만료일을 올바르게 입력해 주세요.'), { status: 400 });
  if (!['renewal','correction'].includes(body.reason)) throw Object.assign(new Error('갱신인지 날짜 정정인지 선택해 주세요.'), { status: 400 });
  return { start: body.serviceStartDate, end: body.serviceEndDate, type: body.reason === 'renewal' ? 'service_renewal' : 'service_correction',
    memo: JSON.stringify({ previousStartDate: existing.serviceStartDate, previousEndDate: existing.serviceEndDate }),
    changed: body.serviceStartDate !== existing.serviceStartDate || body.serviceEndDate !== existing.serviceEndDate };
}
