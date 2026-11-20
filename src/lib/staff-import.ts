import { requestJson } from '../storage';

export type StaffImportRow = {
  row: number; name: string; birth: string; phone: string; job: string; start: string; end: string;
  status: string; reporting: string; reportingDate: string; issue: string; hopeStaffNumber: string; hopeReportStatus: string; effectiveDate: string;
};
export type StaffImportPreview = {
  token: string;
  rows: { row: number; name: string; action: 'create' | 'connect' | 'update' | 'unchanged' | 'review' | 'duplicate'; note: string; confirmName?: boolean }[];
};
const headers = {
  hopeStaffNumber: ['직원번호', '종사자번호', '인력번호'],
  hopeReportStatus: ['보고상태'],
  effectiveDate: ['적용일자', '적용일'],
  name: ['성명', '직원명', '종사자명', '인력명', '이름', '종사자성명', '직원성명'],
  birth: ['생년월일', '생일'],
  residentNumber: ['주민등록번호', '주민번호', '주민등록번호앞자리', '주민번호앞자리'],
  phone: ['연락처', '전화번호', '휴대전화', '휴대전화번호', '휴대폰번호', '휴대폰', '핸드폰번호'],
  job: ['직종', '직종명', '직책', '직위', '인력직종'],
  start: ['입사일', '입사일자', '입사년월일', '입사연월일', '채용일', '근무시작일', '근무시작일자'],
  end: ['퇴사일', '퇴사일자', '퇴사년월일', '퇴사연월일', '근무종료일', '근무종료일자'],
  status: ['재직상태', '근무상태', '직원상태', '종사자상태', '입퇴사구분', '재직여부'],
  reporting: ['입사보고상태', '입사신고상태', '입사보고여부', '입사신고여부'],
  reportingDate: ['입사보고일', '입사보고일자', '입사신고일', '입사신고일자']
};
const fields = Object.keys(headers) as (keyof typeof headers)[];
const compact = (value: string) => value.normalize('NFC').replace(/[\s·/_-]/g, '');
const yesNo: Record<string, string> = {
  '보고완료': '완료', '신고완료': '완료', '완료': '완료', 'Y': '완료', '예': '완료',
  '미보고': '대기', '미신고': '대기', '대기': '대기', 'N': '대기', '아니오': '대기', '진행중': '진행 중'
};
const statusLabels: Record<string, string> = {
  '재직': '재직', '재직중': '재직', '근무': '재직', '근무중': '재직', '퇴사': '퇴사', '퇴직': '퇴사', '퇴사자': '퇴사',
  '휴직': '휴직', '휴직중': '휴직', '입사예정': '입사 예정'
};
function parseCalendarDate(value: unknown, text: string, date1904: boolean) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  const serial = typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100000;
  if (serial) return new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) + value * 86400000).toISOString().slice(0, 10);
  const match = /^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*(?:일|\.)?$/.exec(text)
    ?? /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (!match) return '';
  const iso = [match[1], match[2].padStart(2, '0'), match[3].padStart(2, '0')].join('-');
  return Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso ? iso : '';
}

export async function readStaffImport(file: File): Promise<StaffImportRow[]> {
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 엑셀 파일을 선택해 주세요.');
  const buffer = await file.arrayBuffer();
  const magic = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  if (magic.length >= 4 && magic[0] === 0xd0 && magic[1] === 0xcf && magic[2] === 0x11 && magic[3] === 0xe0) {
    throw new Error('암호로 보호된 엑셀 또는 이전 형식입니다. Excel에서 연 뒤 암호 없이 .xlsx 형식으로 저장한 사본을 선택해 주세요.');
  }
  const { default: { Workbook } } = await import('exceljs');
  const workbook = new Workbook();
  try { await workbook.xlsx.load(buffer); }
  catch { throw new Error('엑셀을 읽을 수 없습니다. 희망이음에서 받은 .xlsx 파일을 확인해 주세요.'); }
  for (const sheet of workbook.worksheets) {
    for (let line = 1; line <= Math.min(sheet.rowCount, 30); line++) {
      const columns = new Map<keyof typeof headers, number>();
      sheet.getRow(line).eachCell((cell, index) => {
        const heading = compact(cell.text.replace(/\s*[（(].*?[）)]\s*/g, ''));
        const field = fields.find(key => headers[key].includes(heading));
        if (field && !columns.has(field)) columns.set(field, index);
      });
      if (!columns.has('name') || (!columns.has('birth') && !columns.has('residentNumber') && !columns.has('hopeStaffNumber'))) continue;
      const rows: StaffImportRow[] = [];
      sheet.eachRow((record, row) => {
        if (row <= line) return;
        const cell = (key: keyof typeof headers) => {
          const column = columns.get(key);
          return column ? record.getCell(column) : undefined;
        };
        const text = (key: keyof typeof headers) => cell(key)?.text.trim() ?? '';
        const date = (key: keyof typeof headers) => {
          const value = cell(key);
          return parseCalendarDate(value?.formula ? value.result : value?.value, text(key), workbook.properties.date1904);
        };
        const name = text('name');
        if (!name || /^(합계|총계|성명|직원명|종사자명)$/.test(name)) return;
        const rrn = /^\s*(\d{6})\s*-?\s*([0-9])/.exec(text('residentNumber'));
        const prefix = rrn && (['1','2','5','6'].includes(rrn[2]) ? '19' : ['3','4','7','8'].includes(rrn[2]) ? '20' : '');
        const birth = date('birth') || (prefix && rrn ? parseCalendarDate(null, prefix + rrn[1], false) : '');
        const start = date('start'), end = date('end'), reportingDate = date('reportingDate'), effectiveDate = date('effectiveDate');
        const hopeStaffNumber = text('hopeStaffNumber'), hopeReportStatus = compact(text('hopeReportStatus'));
        const issue = !birth && !hopeStaffNumber ? '직원번호 또는 생년월일 확인 필요'
          : (text('start') && !start) || (text('end') && !end) || (start && end && end < start) ? '입·퇴사일 확인 필요'
          : '';
        const rawPhone = text('phone');
        const phone = typeof cell('phone')?.value === 'number' && /^10\d{8}$/.test(rawPhone) ? `0${rawPhone}` : rawPhone;
        rows.push({ row, name, birth, phone, hopeStaffNumber, hopeReportStatus, effectiveDate, job: text('job'), start, end,
          status: statusLabels[compact(text('status'))] ?? '',
          reporting: yesNo[compact(text('reporting')).toUpperCase()] ?? ({ 입사승인: '완료', 입사제출: '진행 중', 등록: '대기' } as Record<string,string>)[hopeReportStatus] ?? '', reportingDate, issue });
      });
      if (rows.length && rows.length <= 3000) return rows;
      if (rows.length > 3000) throw new Error('한 번에 최대 3,000행을 가져올 수 있습니다.');
    }
  }
  throw new Error('직원 이름과 직원번호 또는 생년월일 열이 있는 직원 목록을 찾지 못했습니다.');
}

export const previewStaffImport = (rows: StaffImportRow[], confirmed: number[]) => requestJson<StaffImportPreview>('/api/work/staff-directory/import/preview', {
  method: 'POST', body: JSON.stringify({ rows, confirmed })
});
export const applyStaffImport = (rows: StaffImportRow[], token: string, confirmed: number[]) =>
  requestJson<{ created: number; connected: number; updated: number }>('/api/work/staff-directory/import/apply', {
    method: 'POST', body: JSON.stringify({ rows, token, confirmed })
  });
