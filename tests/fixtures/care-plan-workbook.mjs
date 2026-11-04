import ExcelJS from 'exceljs';
export const carePlanExample=(patch={})=>({number:'L1234567890',sequence:'1',birthDate:'1940-01-01',name:'원본 수급자',serviceType:'방문요양',contractDate:'2026-06-23',contractStart:'2026-06-23',contractEnd:'2028-12-31',recognitionRaw:'2025-01-01~2028-12-31',writtenDate:'2026-06-23',notifiedDate:'2026-06-23',periodRaw:'2026-06-23~2027-06-22',planNumber:'L12345678900001',careGrade:'4등급',...patch});
export async function carePlanWorkbook(rows,filename='장기요양 급여제공계획서 내역.xlsx'){
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('장기요양 급여제공계획서 내역');
 sheet.addRow(['NO','','장기요양\n관리번호','SEQ','생년월일','성명','급여구분','급여종류','급여\n계약일','계약\n시작일자','계약\n종료일자','인정유효기간','작성일','제공계획\n통보일','적용기간','급여제공계획서\n번호','등급','열람\n동의\n여부','열람\n가능\n여부','동의여부','동의방법','전자동의 최종요청일','동의일자','동의자명','관계']);
 for(const [i,r]of rows.entries())sheet.addRow([String(i+1),'',r.number,r.sequence,r.birthDate,r.name,'',r.serviceType,r.contractDate,r.contractStart,r.contractEnd,r.recognitionRaw,r.writtenDate,r.notifiedDate,r.periodRaw,r.planNumber,r.careGrade,'Y','Y','Y','직접동의','',r.writtenDate,r.name,'본인']);
 return {filename,file:Buffer.from(await book.xlsx.writeBuffer()).toString('base64')};
}
