import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createVercelHandler } from '../server/vercel-route.mjs';
import { handleAuthRequest } from '../server/auth.mjs';

test('deployment rewrite uses an existing function for both simple and nested API paths',()=>{
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.deepEqual(config.rewrites,[{source:'/api/:path*',destination:'/api/index?__miso_path=:path*'}]);
  assert.ok(existsSync(new URL('../api/index.mjs',import.meta.url)));
  assert.equal(config.functions['api/index.mjs'].includeFiles,'server/postgres/schema.sql');
});
test('restores nested auth/document paths and preserves queries, method, body stream and auth headers',async()=>{
  for(const path of ['auth/config','auth/me','recipients/person-id/documents','recipients/person-id/documents/images/file-id','recipients/bulk-drafts','drive/test-files','recipients']){
    const request={url:`/api/index?__miso_path=${encodeURIComponent(path)}&folderId=abc_123`,method:'PUT',headers:{authorization:'Bearer test'},body:{test:true}};
    await createVercelHandler(async req=>{
      assert.equal(req,request);assert.equal(req.url,`/api/${path}?folderId=abc_123`);
      assert.equal(req.method,'PUT');assert.equal(req.headers.authorization,'Bearer test');assert.deepEqual(req.body,{test:true});
    })(request,{});
  }
});
test('already original URL supplied by Vercel is restored without losing the path',async()=>{
  const req={url:'/api/auth/config?__miso_path=auth%2Fconfig'};
  await createVercelHandler(async req=>assert.equal(req.url,'/api/auth/config'))(req,{});
});
test('invalid or ambiguous rewrite paths fail without reaching business APIs',async()=>{
  for(const path of ['../private','https://evil.example','auth//config','auth/config&__miso_path=recipients']){
    let status;
    await createVercelHandler(()=>assert.fail('must not reach API'))({url:`/api/index?__miso_path=${path}`},{writeHead:s=>status=s,end:()=>{}});
    assert.equal(status,400);
  }
});
test('nested routes still require login after rewriting',async()=>{
  for(const path of ['auth/me','recipients/person/documents','drive/test-files']) {
    await assert.rejects(createVercelHandler(req=>handleAuthRequest(req,{},()=>assert.fail('private data must not be returned')))({url:`/api/index?__miso_path=${path}`,method:'GET',headers:{}},{}),error=>error.status===401);
  }
});
