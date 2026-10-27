import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createSqliteWorkStore,createPostgresWorkStore} from '../server/work-task-stores.mjs';
import {visitUrgency} from '../shared/work-visits.mjs';

test('month-end warnings include the last seven days and retain overdue months',()=>{
 assert.equal(visitUrgency('2026-10','2026-10-23'),'normal');assert.equal(visitUrgency('2026-10','2026-10-24'),'warning');assert.equal(visitUrgency('2026-10','2026-10-31'),'warning');assert.equal(visitUrgency('2026-09','2026-10-01'),'overdue');assert.equal(visitUrgency('2028-02','2028-02-22'),'warning');
});
for(const mode of ['sqlite','postgres-adapter'])test(`${mode}: monthly visits share tasks, retry safely, preserve cancellations and validate targets`,async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE recipients(id TEXT PRIMARY KEY,name TEXT,operational_name TEXT,is_draft INTEGER,enabled INTEGER,contract_registered_date TEXT,contract_expired_date TEXT,service_start_date TEXT,service_end_date TEXT);CREATE TABLE employment_contracts(id TEXT PRIMARY KEY,worker_name TEXT,contract_start_date TEXT,contract_end_date TEXT,is_draft INTEGER,enabled INTEGER);`);
 const bridge={async connect(){return{async query(sql,params=[]){if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)){db.exec(sql);return{rows:[]};}const values=[],converted=sql.replace(/ FOR UPDATE$/,'').replace(/\$(\d+)/g,(_,n)=>{values.push(params[Number(n)-1]);return'?';});const rows=db.prepare(converted).all(...values);return{rows,rowCount:rows.length};},release(){}};}};
 if(mode==='postgres-adapter')db.exec(readFileSync(new URL('../server/work-task-schema.sql',import.meta.url),'utf8')+readFileSync(new URL('../server/work-journal-schema.sql',import.meta.url),'utf8'));
 const store=mode==='sqlite'?createSqliteWorkStore(db,()=>true):createPostgresWorkStore(bridge,()=>true);
 const a=await store.members({id:'a',email:'a@example.com',name:'A'},['a@example.com','b@example.com']),b=await store.members({id:'b',email:'b@example.com',name:'B'},['a@example.com','b@example.com']);
 function person(id,start='2026-09-01',end='2026-09-30',enabled=1,draft=0){db.prepare('INSERT INTO recipients VALUES(?,?,?,?,?,?,?,?,?)').run(id,id,'',draft,enabled,'2026-09-01','2026-09-30',start,end);}
 person('active');person('midmonth','2026-09-18');person('ended','2026-09-01','2026-09-12',0);person('draft','2026-09-01','2026-09-30',1,1);person('future','2026-10-01','2026-10-31');person('invalid','2026-09-31');person('disjoint');db.prepare("UPDATE recipients SET contract_expired_date='2026-09-05',service_start_date='2026-09-06' WHERE id='disjoint'").run();
 assert.deepEqual((await store.visitMonth('2026-09')).rows.map(row=>row.recipientId),['active','ended','midmonth']);
 const body={recipientId:'active',assigneeId:'staff-park-jungyu',serviceConfirmed:true};
 await assert.rejects(store.startVisit('2026-09',{...body,serviceConfirmed:false},a),{status:400});await assert.rejects(store.startVisit('2026-09',{...body,assigneeId:'staff-shin-suyeon'},a),{status:400});await assert.rejects(store.startVisit('9999-12',body,a),{status:400});
 await assert.rejects(store.startVisit('2026-09',{...body,recipientId:'ended'},a),{status:409});await assert.rejects(store.startVisit('2026-09',{...body,recipientId:'draft'},a),{status:409});
 const results=mode==='sqlite'?await Promise.all([store.startVisit('2026-09',body,a),store.startVisit('2026-09',body,b)]):[await store.startVisit('2026-09',body,a),await store.startVisit('2026-09',body,b)];assert.equal(results[0].id,results[1].id);assert.equal(db.prepare('SELECT COUNT(*) n FROM work_tasks').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM work_task_events').get().n,1);
 const task=results[0];assert.equal(task.dueDate,'2026-09-30');assert.equal(task.related[0].id,'active');assert((await store.list(a,'all','open')).some(row=>row.id===task.id));
 await store.complete(task.id,task.version,b);let row=(await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='active');assert.equal(row.task.status,'done');
 await store.complete(row.task.id,row.task.version,a,true);row=(await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='active');assert.equal(row.task.status,'open');
 await store.cancel(row.task.id,row.task.version,a);assert.equal((await store.startVisit('2026-09',body,a)).status,'cancelled');assert.equal(db.prepare('SELECT COUNT(*) n FROM work_tasks').get().n,1);
 db.prepare("UPDATE recipients SET contract_expired_date='2026-08-31' WHERE id='active'").run();row=(await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='active');assert.equal(row.eligible,false);assert.equal(row.task.status,'cancelled');
 await assert.rejects(store.visitMonth('2026-13'),{status:400});
});
