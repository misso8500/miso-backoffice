import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import ExcelJS from 'exceljs';
import {createSqliteWorkStore} from '../server/work-task-stores.mjs';
import {parseCopayWorkbook} from '../server/copay-import.mjs';

async function fixture(month='2026년 09월'){
  const w=new ExcelJS.Workbook();
  for(const [i,merged] of [true,false].entries()){
    const s=w.addWorksheet(`Page ${i+1}`);s.getCell('A1').value=`${month} 급여사용액 및 본인부담금 종합 현황`;
    s.addRow(['','수급자','등급','본인부담율',...(merged?['']:[]),'월한도액','사용액','본인부담금','초과/비급여','합계','금월납부총액','납부일자']);
    if(merged)s.mergeCells('D2:E2');
    s.addRow([i+1,i===0?'연결 수급자':'외부 수급자','4','15.0%',...(merged?['']:[]),1409700,506400,75960,'',75960]);
  }
  return Buffer.from(await w.xlsx.writeBuffer());
}
function setup(){
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE recipients(id TEXT PRIMARY KEY,name TEXT,long_term_care_number TEXT);');
  db.prepare('INSERT INTO recipients VALUES(?,?,?)').run('r1','연결 수급자','LTC-001');
  return {db,store:createSqliteWorkStore(db,()=>true),current:{me:{id:'actor'}}};
}
test('merged and unmerged sheets preserve amount columns',async()=>{
  const d=await parseCopayWorkbook(await fixture(),'test.xlsx');assert.equal(d.rows.length,2);assert.equal(d.rows[1].limit,1409700);assert.equal(d.rows[1].copay,75960);assert.equal(d.sums.copay,151920);
});
test('preview is readonly; import, atomic ledger save, conflicts, reviews and reimport preservation',async()=>{
  const {db,store,current}=setup();try{
    const upload={file:(await fixture()).toString('base64'),filename:'test.xlsx'};
    const preview=await store.importCopay(upload,current);assert.equal(preview.unmatched,1);assert.equal(preview.rows[0].recipientId,'r1');assert.equal((await store.copayMonth('2026-09')).rows.length,0);
    let d=await store.importCopay({...upload,apply:true,acknowledged:true,version:0},current);assert.equal(d.version,1);assert.equal(d.rows[0].code,'LTC-001');
    const change={id:1,payment:{date:'2026-10-23',amount:75960,payer:'보호자',bank:true,item:''},familyCare:true,deductionNote:'가족요양 정산 공제'};
    await assert.rejects(store.saveCopay('2026-09',{version:1,changes:[change,{...change,id:2,payment:{...change.payment,date:'2026-02-30'}}]},current),e=>e.status===400);
    assert.equal((await store.copayMonth('2026-09')).rows[0].payment,null,'failed batch rolls back all rows');
    d=await store.saveCopay('2026-09',{version:1,changes:[change]},current);assert.equal(d.version,2);assert.equal(d.rows[0].payment.amount,75960);
    await assert.rejects(store.saveCopay('2026-09',{version:1,changes:[change]},current),e=>e.status===409);
    d=await store.saveCopay('2026-09',{version:2,review:{id:1,type:'receipt'}},current);assert.equal(d.rows[0].receiptReviewed,true);
    d=await store.importCopay({...upload,apply:true,acknowledged:true,version:3},current);assert.equal(d.version,4);assert.equal(d.rows[0].payment.payer,'보호자');assert.equal(d.rows[0].familyCare,true);assert.equal(d.rows[0].receiptReviewed,false);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM copay_events').get().n,4);
    assert.equal((await store.copayMonth('2026-10')).rows.length,0,'monthly data is isolated');
    d=await store.saveCopay('2026-09',{version:4,changes:[{...change,payment:null}]},current);assert.equal(d.rows[0].payment,null);assert.equal(d.rows[0].familyCare,true);
  }finally{db.close();}
});
test('invalid files, unacknowledged commits and duplicate recipient links are rejected',async()=>{
  const {db,store,current}=setup();try{
    await assert.rejects(parseCopayWorkbook(Buffer.from('invalid'),'bad.xlsx'),e=>e.status===400);
    const upload={file:(await fixture()).toString('base64'),filename:'test.xlsx'};
    await assert.rejects(store.importCopay({...upload,apply:true,version:0},current),e=>e.status===400);
    await assert.rejects(store.importCopay({...upload,links:{1:'r1',2:'r1'},apply:true,acknowledged:true,version:0},current),e=>e.status===400);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM copay_months').get().n,0);
  }finally{db.close();}
});
// The user's source workbook stays local and is never copied into a test fixture.
const source=readdirSync('tmp').find(f=>f.endsWith('.xlsx'));
if(source)test('local reference workbook reads both sheets without shifted columns',async()=>{
  const d=await parseCopayWorkbook(readFileSync(`tmp/${source}`),source);assert.equal(d.rows.length,50);assert.equal(d.sums.copay,4111330);assert.equal(d.rows.at(-1).limit,1208900);assert.equal(d.rows.at(-1).usage,658320);assert(d.warnings.length>0);
});
