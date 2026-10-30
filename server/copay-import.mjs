import ExcelJS from 'exceljs';
import {createHash} from 'node:crypto';
import {workError} from './work-tasks.mjs';

const text = cell => {
  const v=cell.value;
  if(v == null)return '';
  if(v instanceof Date)return v.toISOString().slice(0,10);
  if(typeof v==='object')return String(v.result ?? v.text ?? v.richText?.map(t=>t.text).join('') ?? '');
  return String(v).trim();
};
const compact = v=>v.replace(/\s/g,'');
const number = (cell,label) => {
  const v=text(cell).replace(/,/g,'');
  if(!v)return null;
  if(!/^\d+(?:\.0+)?$/.test(v)||!Number.isSafeInteger(Number(v)))throw workError(400,`${label}: 금액을 확인해 주세요.`);
  return Number(v);
};
export async function parseCopayWorkbook(buffer, filename) {
  if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>2*1024*1024)throw workError(400,'2MB 이하의 엑셀 파일을 선택해 주세요.');
  const workbook=new ExcelJS.Workbook();
  try {await workbook.xlsx.load(buffer);}catch{throw workError(400,'엑셀 파일을 읽을 수 없습니다. .xlsx 형식을 확인해 주세요.');}
  const months=new Set(),rows=[],warnings=[],totals=[];
  for(const sheet of workbook.worksheets){
    if(sheet.rowCount>10000||sheet.columnCount>100)throw workError(400,'엑셀의 행 또는 열이 너무 많습니다. 종합현황 파일을 확인해 주세요.');
    let columns=null;
    sheet.eachRow((row,n)=>{
      if(n<8)row.eachCell(cell=>{const match=text(cell).match(/(\d{4})년\s*(\d{1,2})월/);if(match)months.add(`${match[1]}-${match[2].padStart(2,'0')}`);});
      const labels=new Map();
      row.eachCell((cell,col)=>{if(!cell.isMerged||cell.master.col===col)labels.set(compact(text(cell)),col);});
      if(labels.has('수급자')&&labels.has('사용액')&&labels.has('본인부담금')){
        columns={name:labels.get('수급자'),grade:labels.get('등급'),rate:labels.get('본인부담율'),limit:labels.get('월한도액'),usage:labels.get('사용액'),copay:labels.get('본인부담금'),extra:labels.get('초과/비급여'),total:labels.get('합계'),paid:labels.get('금월납부총액'),date:labels.get('납부일자'),code:labels.get('인정번호')};
        return;
      }
      if(!columns)return;
      const ordinal=text(row.getCell(1));
      if(!/^\d+$/.test(ordinal)){
        // Repeated source totals are compared once, never added across sheets.
        const u=columns.usage?text(row.getCell(columns.usage)):'';
        const c=columns.copay?text(row.getCell(columns.copay)):'';
        if(/^[\d,]+$/.test(u)&&/^[\d,]+$/.test(c))totals.push({usage:Number(u.replaceAll(',','')),copay:Number(c.replaceAll(',',''))});
        return;
      }
      if(!Number.isSafeInteger(Number(ordinal))||Number(ordinal)<1||Number(ordinal)>1000000)throw workError(400,'수급자 연번은 1부터 1000000 사이의 정수여야 합니다.');
      const get=key=>columns[key]?row.getCell(columns[key]):{value:null};
      const name=text(get('name')),grade=text(get('grade')),rawRate=text(get('rate'));
      if(!name&&!grade){warnings.push(`${sheet.name} ${n}행: 수급자명과 등급이 없는 행은 제외했습니다. 금액이 있으면 원본을 확인해 주세요.`);return;}
      if(!name||name.length>100||!/^\d$/.test(grade))throw workError(400,`${sheet.name} ${n}행: 수급자명과 등급을 확인해 주세요.`);
      const rateNumber=Number(rawRate.replace('%',''))*(rawRate.includes('%')?1:100);
      if(!Number.isFinite(rateNumber)||!rawRate||rateNumber<0||rateNumber>100)throw workError(400,`${sheet.name} ${n}행: 본인부담율을 확인해 주세요.`);
      const item={id:Number(ordinal),name,grade,rate:`${rateNumber.toFixed(1)}%`,code:text(get('code'))};
      for(const key of ['limit','usage','copay','extra'])item[key]=number(get(key),`${sheet.name} ${n}행 ${key}`);
      if(item.usage===null||item.copay===null)throw workError(400,`${sheet.name} ${n}행: 사용액 또는 본인부담금이 비어 있습니다.`);
      item.sourceTotal=number(get('total'),`${sheet.name} ${n}행 합계`);
      item.sourcePaid=number(get('paid'),`${sheet.name} ${n}행 수납액`);
      item.sourceDate=text(get('date'));
      if(item.sourcePaid)warnings.push(`${ordinal}번: 원본 수납액은 참고값입니다. 수납대장에서 수납일과 납부자를 확인해 저장하세요.`);
      if(item.sourceTotal!==null&&item.sourceTotal!==item.copay+(item.extra||0))warnings.push(`${ordinal}번: 청구 합계와 본인부담금·비급여의 합이 다릅니다. 원본 합계를 사용합니다.`);
      rows.push(item);
    });
  }
  if(months.size!==1)throw workError(400,'파일 제목에서 하나의 청구 연월을 확인할 수 없습니다.');
  const month=[...months][0];
  if(!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)||!rows.length||rows.length>5000)throw workError(400,'청구 연월 또는 수급자 데이터가 올바르지 않습니다.');
  if(new Set(rows.map(r=>r.id)).size!==rows.length)throw workError(400,'수급자 연번이 중복됩니다. 원본을 확인해 주세요.');
  const sums={usage:rows.reduce((s,r)=>s+r.usage,0),copay:rows.reduce((s,r)=>s+r.copay,0)};
  for(const key of ['usage','copay'])if(totals.some(t=>t[key]!==sums[key]))warnings.push(`${key==='usage'?'급여사용액':'본인부담금'}: 원본 표기 합계와 행 합산(${sums[key].toLocaleString('ko-KR')}원)이 다릅니다. 개별 행을 기준으로 관리합니다.`);
  return {month,filename:String(filename||'종합현황.xlsx').slice(0,200),hash:createHash('sha256').update(buffer).digest('hex'),rows,warnings:[...new Set(warnings)],sums};
}
