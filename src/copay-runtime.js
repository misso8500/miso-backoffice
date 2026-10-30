/* Runs inside the reviewed document frame. API calls use the host's authenticated
   requestJson; no tokens or demo records are embedded in the document. */
let copayApi, copayState, copayBusy=false, copayPreview=null, copayUpload=null, copayMetaDraft=null;
const copayMonths=new Map();
const copayBaseRender=render;
const copayBaseEdit=editLedger;
const copayBaseFooter=updateLedgerFooter;
const copayBasePrint=preparePrint;
source.length=0;loaded.clear();
period=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}).slice(0,7);
available=()=>loaded.has(period)?source:[];

function copayDirty(){window.copayOnDirty?.(ledgerDrafts.size>0||copayMetaDraft!==null);}
function copayError(error){
  const message=error instanceof Error?error.message:String(error);
  $('#copay-status').textContent=message;$('#copay-status').setAttribute('role','alert');
  if($('#copay-import-error'))$('#copay-import-error').textContent=message;
}
async function copayRun(action){
  if(copayBusy)return null;
  copayBusy=true;window.copayOnBusy?.(true);
  $('.shell').inert=true;document.querySelectorAll('dialog').forEach(d=>d.inert=true);
  $('#copay-status').textContent='처리 중입니다…';
  try{return await action();}catch(error){copayError(error);return null;}
  finally{copayBusy=false;window.copayOnBusy?.(false);$('.shell').inert=false;document.querySelectorAll('dialog').forEach(d=>d.inert=false);copayDirty();}
}
function copayAccept(data){
  copayState=data;copayMonths.set(data.month,data);period=data.month;
  source.splice(0,source.length,...data.rows);loaded.clear();if(data.rows.length)loaded.add(data.month);
  payments.clear();familyDeductions.clear();statementReviewed.clear();receiptReviewed.clear();recipientCodes.clear();
  for(const row of data.rows){
    if(row.payment)payments.set(row.id,[{...row.payment,id:row.id,voided:false}]);
    familyDeductions.set(row.id,{enabled:row.familyCare,note:row.deductionNote||''});
    if(row.statementReviewed)statementReviewed.add(row.id);if(row.receiptReviewed)receiptReviewed.add(row.id);
    recipientCodes.set(row.id,row.code||'');
  }
  Object.assign(formMeta,data.meta);ledgerDrafts.clear();copayMetaDraft=null;
  selected=new Set([...selected].filter(id=>source.some(r=>r.id===id)));
  render();$('#copay-status').textContent='';copayDirty();
}
async function copayLoad(month,force=false){
  if(copayBusy)return;
  if(!force&&copayMonths.has(month)){copayAccept(copayMonths.get(month));return;}
  await copayRun(async()=>{const data=await copayApi(`/api/work/copay?month=${month}`);copayAccept(data);});
}
function copayLeave(){
  if(copayBusy)return false;
  if((ledgerDrafts.size||copayMetaDraft)&&!window.confirm('저장하지 않은 입력을 버리고 이동할까요?'))return false;
  ledgerDrafts.clear();copayMetaDraft=null;copayDirty();return true;
}
leaveLedger=copayLeave;
changePeriod=async function(next){if(next===period||!copayLeave())return;selected.clear();query='';statusFilter='all';scope='month';page=1;await copayLoad(next);};
changeTab=function(next){if(next===tab||!copayLeave())return;tab=next;render();};
editLedger=function(id,key,value){copayBaseEdit(id,key,value);copayDirty();};
updateLedgerFooter=function(){copayBaseFooter();copayDirty();};

render=function(){
  copayBaseRender();
  const years=new Set([Number(period.slice(0,4)),new Date().getFullYear()]);
  for(const item of copayState?.months||[])years.add(Number(item.month.slice(0,4)));
  const low=Math.min(...years)-1,high=Math.max(...years)+1;
  $('#year').innerHTML=Array.from({length:high-low+1},(_,i)=>`<option ${String(low+i)===period.slice(0,4)?'selected':''}>${low+i}</option>`).join('');
  $('#sourcebar').innerHTML=source.length?`<div class="sourcebar"><strong>${esc(copayState.filename)}</strong><span>${source.length}명 · ${periodLabel()} · 저장 버전 ${copayState.version}</span><button onclick="openImport()">${copayState.warnings?.length?'△ 확인 사항 '+copayState.warnings.length+'건':'다른 파일 가져오기'}</button><button onclick="if(copayLeave())copayLoad(period,true)">새로고침</button></div>`:'';
  if(!source.length)$('#content').innerHTML='<div class="empty"><h2>이 달의 종합현황이 없습니다.</h2><p>엑셀 파일을 가져오면 수납대장과 문서가 함께 만들어집니다.</p><button onclick="openImport()">종합현황 엑셀 가져오기</button><button onclick="copayLoad(period,true)">새로고침</button></div>';
  else if($('.stat>small'))$('.stat>small').textContent=periodLabel()+' 저장 자료';
};

saveLedger=async function(){
  if(copayBusy||!ledgerDrafts.size)return;
  const changes=[...ledgerDrafts].map(([id,v])=>{
    const clear=!v.date&&!v.amount&&!v.payer.trim()&&!v.bank&&!v.item.trim();
    return {id,payment:clear?null:{date:v.date.length===8?`${v.date.slice(0,4)}-${v.date.slice(4,6)}-${v.date.slice(6,8)}`:v.date,amount:/^\d{1,10}$/.test(v.amount)?Number(v.amount):null,payer:v.payer.trim(),bank:v.bank,item:v.item.trim()},familyCare:v.familyCare,deductionNote:v.deductionNote.trim()};
  });
  await copayRun(async()=>{const data=await copayApi(`/api/work/copay?month=${period}`,{method:'PUT',body:JSON.stringify({version:copayState.version,changes})});copayAccept(data);notify(`${changes.length}명의 수납 정보를 저장했습니다.`);});
};
confirmDocument=async function(id,type){
  if(!copayLeave())return;
  await copayRun(async()=>{copayAccept(await copayApi(`/api/work/copay?month=${period}`,{method:'PUT',body:JSON.stringify({version:copayState.version,review:{id,type}})}));notify('문서 확인 상태를 저장했습니다.');});
};
settings=function(r){return `<details class="doc-settings"><summary>기관 공통정보 · 수급자 인정번호</summary><div class="settings-grid">${[['provider','기관명'],['code','장기요양기관기호'],['business','사업자등록번호'],['address','주소'],['bank','입금 계좌'],['representative','대표자·수령인']].map(([key,label])=>`<label class="field">${label}<input data-meta="${key}" value="${esc((copayMetaDraft||formMeta)[key])}" maxlength="${key==='address'?300:100}" oninput="copayMetaDraft={...(copayMetaDraft||formMeta),['${key}']:this.value};copayDirty()"></label>`).join('')}${r?`<label class="field">${esc(r.name)} 인정번호<input readonly value="${esc(recipientCodes.get(r.id)||'')}" placeholder="수급자 기초정보에서 연결"></label>`:''}</div><button onclick="copaySaveMeta()">기관 정보 저장</button><button onclick="copayMetaDraft=null;render();copayDirty()">취소</button><small>기관 정보는 이 달의 문서에 저장됩니다. 직인·간인은 24×24mm입니다.</small></details>`;};
async function copaySaveMeta(){if(!copayMetaDraft||copayBusy)return;await copayRun(async()=>{copayAccept(await copayApi(`/api/work/copay?month=${period}`,{method:'PUT',body:JSON.stringify({version:copayState.version,meta:copayMetaDraft})}));notify('기관 정보를 저장했습니다.');});}
preparePrint=function(pages,type){if(ledgerDrafts.size||copayMetaDraft){notify('변경 내용을 먼저 저장하거나 취소해 주세요.');return;}sealReady.then(ok=>{if(ok)copayBasePrint(pages,type);else copayError(new Error('직인 이미지를 불러오지 못했습니다. 새로고침해 주세요.'));});};

openImport=function(){
  if(copayBusy)return;
  copayPreview=null;copayUpload=null;
  $('#import-dialog').innerHTML=`<div class="dialog-title"><h2>종합현황 엑셀 가져오기</h2><button aria-label="임포트 닫기" onclick="closeDialog('import-dialog')">×</button></div><p>파일의 청구 연월과 수급자 연결을 확인하고 저장합니다. 같은 달을 다시 가져와도 기존 수납 내역은 유지합니다.</p><div class="file-drop"><input id="xlsx-file" aria-label="종합현황 엑셀 파일" type="file" accept=".xlsx" onchange="showChosenFile(this)"><p>방문요양 종합현황 .xlsx · 최대 2MB</p></div><p id="copay-import-error" role="alert"></p><div id="copay-preview">${(copayState?.warnings||[]).map(w=>`<p class="warning">${esc(w)}</p>`).join('')}</div><div class="dialog-actions"><button onclick="closeDialog('import-dialog')">닫기</button></div>`;
  $('#import-dialog').showModal();
};
showChosenFile=async function(input){
  const file=input.files?.[0];copayPreview=null;copayUpload=null;$('#copay-preview').innerHTML='';
  if(!file)return;
  if(!/\.xlsx$/i.test(file.name)||file.size>2*1024*1024){copayError(new Error('2MB 이하의 .xlsx 파일을 선택해 주세요.'));return;}
  await copayRun(async()=>{
    const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    copayUpload={filename:file.name,file:btoa(binary)};
    copayPreview=await copayApi('/api/work/copay/import',{method:'POST',body:JSON.stringify(copayUpload)});
    copayShowPreview();$('#copay-status').textContent='';$('#copay-import-error').textContent='';
  });
};
function copayShowPreview(){
  const d=copayPreview;
  $('#copay-preview').innerHTML=`<h3>${esc(d.month)} · ${d.rows.length}명 · 본인부담금 ${money(d.sums.copay)}원</h3>${d.warnings.map(w=>`<p class="warning">${esc(w)}</p>`).join('')}<p>수급자 명부 연결: 미연결 ${d.unmatched}명. 동명이인은 직접 선택하세요. 미연결 행도 별도 수납 기록으로 보관되며 기초정보는 새로 생성하지 않습니다.</p><div class="table-wrap" style="max-height:320px"><table><thead><tr><th>연번</th><th>파일 수급자</th><th>본인부담금</th><th>수급자 명부 연결</th></tr></thead><tbody>${d.rows.map(r=>`<tr><td>${r.id}</td><td>${esc(r.name)}</td><td>${money(r.copay)}</td><td><select data-link="${r.id}" aria-label="${esc(r.name)} 수급자 연결"><option value="">미연결로 보관</option>${d.recipients.map(p=>`<option value="${esc(p.id)}" ${r.recipientId===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div><label style="display:flex;gap:8px;margin:16px 0"><input id="import-ack" type="checkbox" onchange="$('#import-apply').disabled=!this.checked">연월, 금액, 연결과 확인 사항을 검토했습니다.</label><button id="import-apply" class="primary" disabled onclick="applyImport()">${esc(d.month)} 자료 저장${d.version?' · 기존 종합현황 갱신':''}</button>`;
}
applyImport=async function(){
  if(!copayPreview||!$('#import-ack').checked||!copayLeave())return;
  const links=Object.fromEntries([...document.querySelectorAll('[data-link]')].map(e=>[e.dataset.link,e.value||null]));
  await copayRun(async()=>{
    const data=await copayApi('/api/work/copay/import',{method:'POST',body:JSON.stringify({...copayUpload,links,apply:true,acknowledged:true,version:copayPreview.version})});
    selected.clear();query='';statusFilter='all';page=1;copayAccept(data);$('#import-dialog').close();notify('종합현황을 저장했습니다. 수납대장에서 이어서 입력하세요.');
  });
};
window.copayStart=function(api,onDirty,onBusy){
  copayApi=api;window.copayOnDirty=onDirty;window.copayOnBusy=onBusy;
  const status=document.createElement('p');status.id='copay-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');$('.tabs').before(status);
  $('.pill').textContent='월별 수납 · 문서 관리';$('.footnote').textContent='수납 입력은 변경 전체 저장 후 반영됩니다. 기관 정보와 문서 확인 상태도 해당 월의 자료로 저장됩니다.';
  render();void copayLoad(period);
};
