import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentImageCache } from '../src/lib/document-image-cache.ts';

test('thumbnail, prefetch and repeated navigation share a single download and URL', async () => {
  let calls=0, created=0;
  const cache=createDocumentImageCache(async()=>{calls++;return new Blob(['image']);},()=>`blob:${++created}`,()=>{});
  const [a,b]=await Promise.all([cache.get('/page1'),cache.get('/page1')]);
  assert.equal(a,b); assert.equal(await cache.get('/page1'),a);
  assert.equal(cache.peek('/page1'),a);assert.equal(calls,1);assert.equal(created,1);
});
test('failed background loads can be retried in foreground', async () => {
  let calls=0;
  const cache=createDocumentImageCache(async()=>{if(++calls===1)throw new Error('offline');return new Blob();},()=> 'blob:ok',()=>{});
  await assert.rejects(cache.get('/page1'));
  assert.equal(await cache.get('/page1'),'blob:ok');assert.equal(calls,2);
});
test('closing detail revokes loaded URLs and aborts pending private images',async()=>{
  const revoked=[];let release;let pendingSignal;
  const cache=createDocumentImageCache(async(endpoint,signal)=>{
    if(endpoint==='/ready')return new Blob();
    pendingSignal=signal;return new Promise(resolve=>release=resolve);
  },()=> 'blob:private',url=>revoked.push(url));
  await cache.get('/ready');const pending=cache.get('/pending');await Promise.resolve();
  cache.clear();assert.equal(pendingSignal.aborted,true);assert.deepEqual(revoked,['blob:private']);assert.equal(cache.peek('/ready'),undefined);
  release(new Blob());await assert.rejects(pending);assert.equal(cache.peek('/pending'),undefined);
});
test('an aborted old request cannot remove a newer request for the same image',async()=>{
  let release,calls=0;
  const cache=createDocumentImageCache(async()=>++calls===1?new Promise(resolve=>release=resolve):new Blob(),()=> 'blob:new',()=>{});
  const old=cache.get('/page');await Promise.resolve();cache.clear();
  assert.equal(await cache.get('/page'),'blob:new');release(new Blob());await assert.rejects(old);
  assert.equal(cache.peek('/page'),'blob:new');
});
