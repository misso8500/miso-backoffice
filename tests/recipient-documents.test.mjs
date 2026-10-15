import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { normalizeDocuments, parseFolderId, recipientReader, handleRecipientDocuments } from '../server/recipient-documents.mjs';
import { createDriveReader } from '../server/drive.mjs';
const folderId = 'allowed_folder_12345', fileId = 'allowed_image_12345';
const body = () => ({ folderId, periods: [{ id: 'period1', startDate: '2026-09-09', endDate: '2028-09-08' }], pages: [{ fileId, kind: 'plan', periodId: 'period1', order: 1 }], version: null });
test('document payload validates real dates, periods, types and page order', () => {
  assert.equal(normalizeDocuments(body()).pages[0].periodId, 'period1');
  for (const modify of [b => b.periods[0].startDate='2026-02-30', b => b.periods[0].endDate='2025-01-01', b => b.pages[0].kind='unknown', b => b.pages[0].order=0, b => b.pages[0].periodId='other', b => b.pages.push({...b.pages[0]}), b => b.pages.push({...b.pages[0], fileId:'another_image_12345'})]) {
    const b=body();modify(b);assert.throws(() => normalizeDocuments(b));
  }
  const b=body(); b.pages[0].kind='identity';assert.equal(normalizeDocuments(b).pages[0].periodId,'');
});
test('folder parsing and allowlist reject arbitrary domains and unapproved IDs', () => {
  assert.equal(parseFolderId(`https://drive.google.com/drive/folders/${folderId}?usp=sharing`),folderId);
  assert.throws(() => parseFolderId(`https://evil.example/drive/folders/${folderId}`));
  assert.throws(() => recipientReader(folderId,{}),{status:403});
});
function harness() {
  let saved=null, writes=0;
  const store={exists:async id=>id==='recipient1',get:async()=>saved,save:async(_id,value)=>{saved=value;writes++;}};
  const dependencies={reader:()=>({tree:async()=>({files:[{id:fileId,name:'page.jpg'}]}),image:async()=>({bytes:Buffer.from([1,2]),mimeType:'image/jpeg'})})};
  async function call(method,path,data) {
    const req=Readable.from(data ? [Buffer.from(JSON.stringify(data))] : []);req.method=method;req.url=`/api/recipients/recipient1/documents${path}`;
    let status,output,headers={};const res={setHeader:(k,v)=>headers[k]=v,writeHead:(s,h)=>{status=s;headers={...headers,...h};},end:v=>output=v};
    const handled=await handleRecipientDocuments(req,res,(_r,s,p)=>{status=s;output=p;},store,dependencies);
    return {handled,status,output,headers};
  }
  return {call,store,get saved(){return saved;},get writes(){return writes;}};
}
test('saving references and rereading preserves period, names, order and version',async()=>{
  const h=harness();assert.equal((await h.call('GET','')).output.version,null);
  const result=await h.call('PUT','',body());assert.equal(result.status,200);assert.ok(result.output.version);assert.equal(result.output.pages[0].name,'page.jpg');
  assert.deepEqual((await h.call('GET','')).output,result.output);
  assert.equal((await h.call('GET',`/images/${fileId}`)).status,200);
  assert.equal((await h.call('GET',`/images/${fileId}`)).headers['Cache-Control'],'private, no-store');
});
test('stale versions cannot overwrite saved connections',async()=>{
  const h=harness();await h.call('PUT','',body());
  assert.equal((await h.call('PUT','',body())).status,409);assert.equal(h.writes,1);
});
test('unlisted file IDs and unsupported methods cannot save or read references',async()=>{
  const h=harness();const b=body();b.pages[0].fileId='outside_image_12345';
  assert.equal((await h.call('PUT','',b)).status,400);assert.equal(h.writes,0);
  assert.equal((await h.call('GET',`/images/${fileId}`)).status,404);
  assert.equal((await h.call('DELETE','')).status,405);
});
test('missing recipients cannot access document endpoints',async()=>{
  const h=harness();h.store.exists=async()=>false;
  assert.equal((await h.call('GET','/candidates?folderId='+folderId)).status,404);
});
test('recursive Drive image access checks each ancestor and refuses moved/deleted ancestors',async()=>{
  for (const deleted of [false,true]) {
    let mediaCalls=0;
    const drive=createDriveReader({DRIVE_TEST_FOLDER_ID:folderId,DRIVE_INCLUDE_SUBFOLDERS:'true'},{token:async()=>'t',fetch:async url=>{
      let data;
      if(url.searchParams.get('alt')==='media'){mediaCalls++;return new Response(new Uint8Array([1]));}
      if(url.pathname.endsWith(fileId))data={mimeType:'image/png',parents:['subfolder_12345'],size:'1'};
      else if(url.pathname.endsWith('subfolder_12345'))data={mimeType:'application/vnd.google-apps.folder',parents:[folderId],trashed:deleted};
      else data={mimeType:'application/vnd.google-apps.folder'};
      return new Response(JSON.stringify(data));
    }});
    if(deleted){await assert.rejects(drive.image(fileId),{status:404});assert.equal(mediaCalls,0);}
    else{assert.equal((await drive.image(fileId)).bytes.length,1);assert.equal(mediaCalls,1);}
  }
});
