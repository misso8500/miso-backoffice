import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const {chromium}=await import(process.env.WORK_UI_PLAYWRIGHT_MODULE?pathToFileURL(process.env.WORK_UI_PLAYWRIGHT_MODULE).href:'playwright-core');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
 const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(resolve('docs/prototypes/copay-review.html')).href);
 assert.equal(await page.evaluate(()=>sealReady),true,'provided seal reference is available');
 await page.evaluate(()=>{window.printCalls=0;window.print=()=>window.printCalls++;});
 assert.equal(await page.locator('#content .table-wrap tbody tr').count(),12);
 assert.equal(await page.getByRole('button',{name:'수납 입력',exact:true}).count(),0);
 const signals=page.getByRole('group',{name:'수급자 01 진행 상태'});assert.equal(await signals.locator('[tabindex="0"]').count(),4);
 await signals.locator('.red').focus();assert.equal(await signals.locator('.red .copay-tooltip').evaluate(e=>getComputedStyle(e).opacity),'1');
 await signals.locator('.red').click();assert.equal(await signals.locator('.red').getAttribute('class'),'copay-dot red ');
 await page.locator('.heading .primary').click();await page.locator('#import-ack').check();await page.locator('#import-apply').click();
 await page.locator('[data-tab="ledger"]').click();
 assert.equal(await page.locator('.ledger-date').count(),50);assert.equal(await page.locator('dialog[open]').count(),0);
 await page.getByLabel('수급자 01 수납일',{exact:true}).fill('2026-10-23');
 await page.getByRole('textbox',{name:'수급자 01 수납액',exact:true}).fill('75960');
 await page.getByRole('textbox',{name:'수급자 01 납부자',exact:true}).fill('가상 보호자');
 await page.getByRole('checkbox',{name:'수급자 01 통장수납',exact:true}).check();
 await page.getByRole('checkbox',{name:'수급자 01 가족요양 공제대상',exact:true}).check();
 await page.getByRole('textbox',{name:'수급자 01 공제 내용',exact:true}).fill('가족요양 급여 정산 시 본인부담금 공제 · 2026년 9월 급여 정산에 반영하며 납부자와 확인한 공제 내역을 수납대장에 보관합니다.');
 await page.getByLabel('수급자 02 수납일',{exact:true}).fill('');
 await page.getByRole('textbox',{name:'수급자 02 수납액',exact:true}).fill('20000');
 await page.getByRole('button',{name:'변경 전체 저장'}).click();
 assert.equal(await page.evaluate(()=>received(1)),0,'invalid second row prevents partial bulk save');
 await page.getByLabel('수급자 02 수납일',{exact:true}).fill('2026-10-01');
 await page.getByRole('textbox',{name:'수급자 02 수납액',exact:true}).fill('20000');
 await page.getByRole('textbox',{name:'수급자 02 납부자',exact:true}).fill('가상 보호자 2');
 await page.getByRole('textbox',{name:'수급자 검색'}).fill('수급자 01');assert.equal(await page.locator('.ledger-date').count(),1);
 await page.getByRole('button',{name:'변경 전체 저장'}).click();assert.equal(await page.evaluate(()=>received(1)),75960);assert.equal(await page.evaluate(()=>received(2)),20000,'hidden second row is saved too');
 await page.getByRole('textbox',{name:'수급자 검색'}).fill('');
 assert.equal(await page.locator('.ledger-input-table tfoot .num').textContent(),'95,960','saved month total is visible in the input ledger too');
 await page.getByRole('checkbox',{name:'수급자 03 가족요양 공제대상',exact:true}).check();
 await page.getByRole('textbox',{name:'수급자 03 공제 내용',exact:true}).fill('가족요양 공제대상 · 정산 확인 예정');
 await page.getByRole('button',{name:'변경 전체 저장'}).click();assert.equal(await page.evaluate(()=>received(3)),0,'family information alone does not create a payment');
 await page.getByRole('button',{name:'수납대장 인쇄',exact:true}).click();assert.equal(await page.locator('#print-root .ledger-form').count(),2);
 assert.equal(await page.locator('#print-root .grand-total td.num').textContent(),'95,960');
 assert.equal(await page.locator('#print-root .ledger-print-date').first().textContent(),'2026.10.23');

 if(viewport.width===1440){await page.emulateMedia({media:'print'});await page.setViewportSize({width:718,height:1047});assert.equal(await page.locator('#print-root .ledger-print-date').first().evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);return r.getClientRects().length;}),1,'full receipt date stays on one line');await page.screenshot({path:'tmp/copay-ledger-refined.png',fullPage:true});const pdf=await page.pdf({preferCSSPageSize:true});assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,2,'50 ledger rows print in 2 A4 pages');await page.emulateMedia({media:'screen'});await page.setViewportSize(viewport);}
 await page.locator('[data-tab="overview"]').click();assert.equal(await page.getByRole('group',{name:'수급자 01 진행 상태'}).locator('.red.done').count(),1);
 const first=page.locator('#content .table-wrap tbody tr').first();await first.getByRole('button',{name:'영수증',exact:true}).click();
 assert.equal(await page.locator('#document-dialog .receipt-copy').count(),2);assert.equal(await page.locator('#document-dialog .receipt-date').first().innerText(),'2026년 10월 23일');
 assert.equal(await page.locator('#document-dialog .receipt-deduction').count(),2);
 assert.equal(await page.locator('#document-dialog .company-seal').count(),2);assert.equal(await page.locator('#document-dialog .seam-seal').count(),1);
 const seamBox=await page.locator('#document-dialog .seam-seal').boundingBox();assert(Math.abs(seamBox.width-24*96/25.4)<1&&Math.abs(seamBox.height-24*96/25.4)<1,'seam seal is also 24 by 24 mm');
 for(const seal of await page.locator('#document-dialog .company-seal').all()){const box=await seal.boundingBox();assert(Math.abs(box.width-24*96/25.4)<1&&Math.abs(box.height-24*96/25.4)<1,'company seal is 24 by 24 mm');assert(await seal.evaluate(e=>e.complete&&e.naturalWidth>0),'new transparent seal loaded');}
 assert.equal(await page.locator('#document-dialog .receipt-sheet').evaluate(e=>e.querySelector('.receipt-seam').getBoundingClientRect().bottom<=e.querySelector('.receipt-ack').getBoundingClientRect().top),true,'seam seal does not cover receipt acknowledgement');
 assert.equal(await page.locator('#document-dialog .receipt-copy').first().evaluate(e=>e.querySelector('.receipt-deduction').getBoundingClientRect().top>=e.querySelector('.receipt-signer').getBoundingClientRect().bottom),true,'family care note follows recipient signer');
 assert.equal(await page.locator('#document-dialog').getByRole('button',{name:'영수증 확인',exact:true}).count(),0,'overview preview is readonly');
 await page.getByRole('button',{name:'문서 미리보기 닫기'}).click();
 await page.locator('#content .table-wrap tbody tr').nth(1).getByRole('button',{name:'영수증',exact:true}).click();assert.equal(await page.locator('#document-dialog [aria-label="수납일자 공란"]').count(),2);
 await page.getByRole('button',{name:'문서 미리보기 닫기'}).click();
 await page.getByRole('checkbox',{name:'수급자 01 선택',exact:true}).check();await page.getByRole('checkbox',{name:'수급자 02 선택',exact:true}).check();
 await page.getByRole('button',{name:'선택 명세서 미리보기'}).click();
 await page.getByRole('button',{name:'명세서 확인',exact:true}).click();
 await page.getByRole('button',{name:'2부 인쇄',exact:true}).click();assert.equal(await page.locator('#print-root .statement-form').count(),2);
 if(viewport.width===1440){await page.emulateMedia({media:'print'});await page.setViewportSize({width:718,height:1047});const size=await page.locator('#print-root .statement-form').first().boundingBox();assert(size.height>=1000&&size.height<=1047,'statement fills A4 printable height');assert.equal(await page.locator('#print-root .statement-grid').count(),2);await page.screenshot({path:'tmp/copay-statement-refined.png',fullPage:true});const pdf=await page.pdf({preferCSSPageSize:true});assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,2,'statement stays one A4 page per recipient');await page.emulateMedia({media:'screen'});await page.setViewportSize(viewport);}
 await page.locator('[data-tab="receipt"]').click();await page.getByRole('button',{name:'영수증 확인',exact:true}).click();await page.getByRole('button',{name:'이 수급자만 인쇄',exact:true}).click();
 assert.equal(await page.locator('#print-root .receipt-copy').count(),2);
 if(viewport.width===1440){await page.emulateMedia({media:'print'});await page.setViewportSize({width:1047,height:718});await page.screenshot({path:'tmp/copay-receipt-refined.png',fullPage:true});const pdf=await page.pdf({preferCSSPageSize:true});assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1,'two receipt copies fit one A4 landscape page');await page.emulateMedia({media:'screen'});await page.setViewportSize(viewport);await page.screenshot({path:'tmp/copay-receipt-review.png',fullPage:false});}
 await page.emulateMedia({media:'print'});assert.equal(await page.locator('.shell').isVisible(),false);await page.emulateMedia({media:'screen'});
 await page.locator('[data-tab="overview"]').click();assert.equal(await page.getByRole('group',{name:'수급자 01 진행 상태'}).locator('.done').count(),4);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);assert.deepEqual(errors,[]);await page.screenshot({path:`tmp/copay-${viewport.width}.png`,fullPage:false});await page.close();
}console.log('PASS: readonly stage signals, 50 inline editors, atomic bulk save, supplied form layouts, A4 PDF page counts, desktop/mobile');}finally{await browser.close();}

