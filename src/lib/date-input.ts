export function dateInputError(value: string, required = false, min = '1000-01-01', max = '9999-12-31') {
  if (!value) return required ? '연도, 월, 일을 모두 입력해 주세요.' : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '연도 4자리, 월 2자리, 일 2자리를 입력해 주세요.';
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0,10) !== value) return '실제로 있는 날짜를 입력해 주세요.';
  if (value < (min || '1000-01-01') || value > (max || '9999-12-31')) return '입력 가능한 날짜 범위를 확인해 주세요.';
  return '';
}

export function limitDateYearToFourDigits(value: string) {
  return value.replace(/^(\d{4})\d+(?=-)/, '$1');
}
