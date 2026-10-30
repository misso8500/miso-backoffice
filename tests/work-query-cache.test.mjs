import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorkQueryCache} from '../shared/work-query-cache.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
test('shared views reuse fresh values and concurrent requests share a single fetch',async()=>{
 const cache=createWorkQueryCache();const wait=deferred();let calls=0;const load=()=>{calls++;return wait.promise};
 const a=cache.get('month',load),b=cache.get('month',load);await Promise.resolve();assert.equal(calls,1);wait.resolve({id:1});
 assert.deepEqual(await a,await b);await cache.get('month',load);assert.equal(calls,1);
});
test('expired data stays visible and active views receive background results',async()=>{
 let now=0;const cache=createWorkQueryCache({ttl:60,now:()=>now});await cache.get('a',async()=>1);let seen;const stop=cache.subscribe('a',()=>{seen=cache.peek('a')});
 now=61;const wait=deferred();assert.equal(await cache.get('a',()=>wait.promise),1);assert.equal(cache.peek('a'),1);wait.resolve(2);await cache.get('a',()=>wait.promise,{force:true});assert.equal(seen,2);stop();
});
test('save responses beat older reads and account clearing prevents late data from repopulating cache',async()=>{
 let now=0;const cache=createWorkQueryCache({ttl:1,now:()=>now});await cache.get('a',async()=>({version:1}));now=2;const wait=deferred();await cache.get('a',()=>wait.promise);
 cache.update(()=>true,()=>({version:3}));wait.resolve({version:2});await Promise.resolve();await Promise.resolve();assert.equal(cache.peek('a').version,3);
 const late=deferred();const loading=cache.get('private',()=>late.promise);cache.clear();late.resolve('old account');await loading;assert.equal(cache.peek('private'),undefined);assert.equal(cache.peek('a'),undefined);
});
test('focus revalidates only stale subscribed queries and failures retain the last data',async()=>{
 let now=0,calls=0;const cache=createWorkQueryCache({ttl:10,now:()=>now});await cache.get('active',async()=>{calls++;return calls});await cache.get('inactive',async()=>99);
 cache.subscribe('active',()=>{});now=20;await cache.revalidate();assert.equal(calls,2);assert.equal(cache.peek('inactive'),99);
 now=40;await cache.get('active',async()=>{throw Error('offline')});await cache.revalidate();assert.equal(cache.peek('active'),2);
});
test('invalidation during an old request still allows a forced fresh result',async()=>{
 let now=0;const cache=createWorkQueryCache({ttl:1,now:()=>now});await cache.get('a',async()=>1);now=2;const old=deferred();await cache.get('a',()=>old.promise);cache.invalidate(()=>true);
 const fresh=cache.get('a',async()=>3,{force:true});old.resolve(2);assert.equal(await fresh,3);assert.equal(cache.peek('a'),3);
});
