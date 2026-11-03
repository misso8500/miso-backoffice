import ExcelJS from 'exceljs';
import JSZip from 'jszip';
export async function importWorkbook({rows=[],second=[],brokenDrawing=false}={}){
 const w=new ExcelJS.Workbook(),s=w.addWorksheet('Page 1');
 s.mergeCells('C2:H2');s.getCell('C2').value='계약자 명부 조회';
 const headers=['성명','등급','생년월일','장기요양인정번호','연락처','주소','계약일자','계약시작일','계약종료일','최종급여\n제공일자','보호자 이름','보호자 관계','보호자 연락처'];
 s.getRow(5).values=headers;for(const row of rows)s.addRow(row);
 s.addRow(['','','','','','','출력 종료']);
 if(second.length){const t=w.addWorksheet('Page 2');t.addRow(headers);second.forEach(row=>t.addRow(row));}
 let buffer=Buffer.from(await w.xlsx.writeBuffer());
 if(brokenDrawing){const z=await JSZip.loadAsync(buffer);z.file('xl/worksheets/sheet1.xml',(await z.file('xl/worksheets/sheet1.xml').async('string')).replace('</worksheet>','<drawing r:id="rIdMissing"/></worksheet>'));z.file('xl/drawings/drawing1.xml','<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"/>');buffer=await z.generateAsync({type:'nodebuffer'});}
 return {filename:'수급자 목록.xlsx',file:buffer.toString('base64')};
}
