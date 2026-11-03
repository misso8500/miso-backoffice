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
 function person(id,start='2026-09-01',end='2026-09-30',enabled=1,draft=0){db.prepare('INSERT INTO recipients VALUES(?,?,?,?,?,?,?,?,?)').run(id,id,'',draft,enabled,'2026-09-01','2026-09-30',start,end);const old=db.prepare('SELECT recipient_ids FROM recipient_service_months WHERE month=?').get('2026-09');const ids=old?JSON.parse(old.recipient_ids):[];ids.push(id);db.prepare("INSERT INTO recipient_service_months(month,recipient_ids,version,updated_by,updated_at) VALUES('2026-09',?,1,'a','2026-09-01') ON CONFLICT(month) DO UPDATE SET recipient_ids=excluded.recipient_ids").run(JSON.stringify(ids));}
 person('active');person('midmonth','2026-09-18');person('ended','2026-09-01','2026-09-12',0);person('draft','2026-09-01','2026-09-30',1,1);person('future','2026-10-01','2026-10-31');person('invalid','2026-09-31');person('disjoint');db.prepare("UPDATE recipients SET contract_expired_date='2026-09-05',service_start_date='2026-09-06' WHERE id='disjoint'").run();
 assert.deepEqual((await store.visitMonth('2026-09')).rows.map(row=>row.recipientId),['active','disjoint','draft','ended','future','invalid','midmonth']);
 db.prepare("INSERT INTO recipients VALUES('unchecked','미선택','',0,1,'2026-09-01','2026-09-30','2026-09-01','2026-09-30')").run();
 assert(!(await store.visitMonth('2026-09')).rows.some(row=>row.recipientId==='unchecked'));
 const body={recipientId:'active',assigneeId:'staff-park-jungyu',serviceConfirmed:true};
 await assert.rejects(store.startVisit('2026-09',{...body,recipientId:'unchecked'},a),{status:409});
 await assert.rejects(store.startVisit('2026-09',{...body,serviceConfirmed:false},a),{status:400});await assert.rejects(store.startVisit('2026-09',{...body,assigneeId:'staff-shin-suyeon'},a),{status:400});await assert.rejects(store.startVisit('9999-12',body,a),{status:400});
 await assert.rejects(store.startVisit('2026-09',{...body,recipientId:'ended'},a),{status:409});await assert.rejects(store.startVisit('2026-09',{...body,recipientId:'draft'},a),{status:409});
 const results=mode==='sqlite'?await Promise.all([store.startVisit('2026-09',body,a),store.startVisit('2026-09',body,b)]):[await store.startVisit('2026-09',body,a),await store.startVisit('2026-09',body,b)];assert.equal(results[0].id,results[1].id);assert.equal(db.prepare('SELECT COUNT(*) n FROM work_tasks').get().n,1);assert.equal(db.prepare('SELECT COUNT(*) n FROM work_task_events').get().n,1);
 const task=results[0];assert.equal(task.dueDate,'2026-09-30');assert.equal(task.related[0].id,'active');assert((await store.list(a,'all','open')).some(row=>row.id===task.id));
 await store.complete(task.id,task.version,b);let row=(await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='active');assert.equal(row.task.status,'done');
 await store.complete(row.task.id,row.task.version,a,true);row=(await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='active');assert.equal(row.task.status,'open');
 await store.cancel(row.task.id,row.task.version,a);assert.equal((await store.startVisit('2026-09',body,a)).status,'cancelled');assert.equal(db.prepare('SELECT COUNT(*) n FROM work_tasks').get().n,1);
 db.prepare("UPDATE recipients SET contract_expired_date='2026-08-31' WHERE id='active'").run();row=(await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='active');assert.equal(row.eligible,false);assert.equal(row.task.status,'cancelled');
 await assert.rejects(store.visitMonth('2026-13'),{status:400});
 person('scheduled');
 let scheduled=await store.saveServiceRounding('2026-09','scheduled',{version:0,status:'coordinating',date:'2026-09-10',assigneeId:'staff-hwang-youngsang',taskVersion:null,plannedStartTime:'09:30',plannedEndTime:'10:15'},a);
 let scheduledRow=(await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='scheduled');
 assert.deepEqual(scheduledRow.plannedDates,['2026-09-10']);assert.deepEqual(scheduledRow.visitedDates,[]);
 assert.equal(scheduledRow.rounding.plannedStartTime,'09:30');assert.equal(scheduledRow.rounding.plannedEndTime,'10:15');
 for(const times of [{plannedStartTime:'25:00',plannedEndTime:'26:00'},{plannedStartTime:'10:00',plannedEndTime:'09:30'},{plannedStartTime:'09:00',plannedEndTime:''},{plannedStartTime:930,plannedEndTime:'10:00'},{plannedStartTime:'10:00',plannedEndTime:'10:00'}])await assert.rejects(store.saveServiceRounding('2026-09','scheduled',{...scheduled.rounding,...times},a),{status:400});
 const {plannedStartTime,plannedEndTime,...legacyRounding}=scheduled.rounding;
 await store.saveServiceRounding('2026-09','scheduled',{...legacyRounding,status:'visited',date:'2026-09-12',confirmComplete:true},a);
 scheduledRow=(await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='scheduled');
 assert.deepEqual(scheduledRow.plannedDates,['2026-09-10']);assert.deepEqual(scheduledRow.visitedDates,['2026-09-12']);assert.equal(scheduledRow.rounding.assigneeId,'staff-hwang-youngsang');
 assert.equal(scheduledRow.rounding.plannedStartTime,'09:30');assert.equal(scheduledRow.rounding.plannedEndTime,'10:15');
 assert.equal((await store.recipientServiceMonth('2026-09')).rows.find(row=>row.id==='scheduled').rounding.plannedStartTime,'09:30');
 await store.saveServiceRounding('2026-09','scheduled',{...scheduledRow.rounding,plannedStartTime:'',plannedEndTime:''},a);
 assert.equal((await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='scheduled').rounding.plannedStartTime,'');
 // Removing a monthly selection excludes even existing plans and completed tasks.
 const selection=db.prepare('SELECT recipient_ids FROM recipient_service_months WHERE month=?').get('2026-09');
 db.prepare('UPDATE recipient_service_months SET recipient_ids=? WHERE month=?').run(JSON.stringify(JSON.parse(selection.recipient_ids).filter(id=>id!=='scheduled')),'2026-09');
 assert(!(await store.visitMonth('2026-09')).rows.some(row=>row.recipientId==='scheduled'));


 // Planning creates a single design instance, task and daily plan; checking the design uses the same execution.
 person('integrated');
 let integrated=await store.saveServiceRounding('2026-09','integrated',{version:0,taskVersion:null,status:'coordinating',date:'2026-09-10',assigneeId:'staff-park-jungyu',plannedStartTime:'09:00',plannedEndTime:'10:00'},a);
 assert.equal(integrated.task.title,'integrated 라운딩');assert.equal(integrated.task.status,'open');
 assert.equal(integrated.task.sourceDesignId,'system:social-worker-visits');
 assert.equal((await store.list(a,'all','all')).find(row=>row.id===integrated.task.id).sourceDesignId,'system:social-worker-visits');
 let board=await store.taskMaps('2026-09');
 assert.equal(board.templates.filter(row=>row.id==='system:social-worker-visits').length,1);
 assert.equal(board.templates.find(row=>row.id==='system:social-worker-visits').title,'사회복지사 방문 업무');
 let run=board.runs.find(row=>row.sourceRecipientId==='integrated');
 assert.equal(run.steps[0].title,'integrated 라운딩');assert.equal(run.date,'2026-09-10');assert.equal(run.assigneeId,'staff-park-jungyu');
 let day=await store.day('2026-09-10','all',a),linkedPlan=day.plans.find(row=>row.taskId===integrated.task.id);
 assert.equal(linkedPlan.period,'morning');assert.equal(linkedPlan.snapshot.plannedStartTime,'09:00');assert.equal(day.executions.some(row=>row.taskId===integrated.task.id),false);
 integrated=await store.saveServiceRounding('2026-09','integrated',{...integrated.rounding,status:'coordinating',date:'2026-09-11',assigneeId:'staff-hwang-youngsang',plannedStartTime:'14:00',plannedEndTime:'15:00'},b);
 const moved=(await store.day('2026-09-11','all',b)).plans.find(row=>row.taskId===integrated.task.id);
 assert.equal(moved.id,linkedPlan.id);assert.equal(moved.assigneeId,'staff-hwang-youngsang');assert.equal(moved.period,'afternoon');
 assert(!(await store.day('2026-09-10','all',a)).plans.some(row=>row.taskId===integrated.task.id));
 await assert.rejects(store.checkTaskMap(run.id,{version:run.version,step:0,actualDate:'2026-09-12'},b),{status:409});
 run=(await store.taskMaps('2026-09')).runs.find(row=>row.sourceRecipientId==='integrated');
 const checked=await store.checkTaskMap(run.id,{version:run.version,step:0,actualDate:'2026-09-12'},b);
 assert(checked.steps[0].completedAt);assert.equal(checked.steps[0].completedById,b.me.id);assert.equal(checked.steps[0].performedDate,'2026-09-12');
 const actual=(await store.day('2026-09-12','all',a)).executions.filter(row=>row.taskId===integrated.task.id);
 assert.equal(actual.length,1);assert.equal(actual[0].planId,moved.id);assert.equal(actual[0].assigneeId,'staff-hwang-youngsang');assert.equal(actual[0].content,'integrated 라운딩');
 assert.equal((await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='integrated').rounding.status,'visited');
 assert.equal((await store.recipientServiceMonth('2026-09')).rows.find(row=>row.id==='integrated').rounding.status,'visited');
 await assert.rejects(store.checkTaskMap(checked.id,{version:checked.version,step:0,actualDate:'2026-09-12'},a),{status:409});
 assert.equal(db.prepare('SELECT count(*) n FROM work_executions WHERE task_id=?').get(integrated.task.id).n,1);
 assert.equal(db.prepare('SELECT count(*) n FROM work_plans WHERE task_id=?').get(integrated.task.id).n,1);
 assert.equal((await store.taskMaps('2026-09')).runs.filter(row=>row.sourceRecipientId==='integrated').length,1);
 await assert.rejects(store.saveTaskMap({id:'system:social-worker-visits',version:1,title:'변경 시도',kind:'event',category:'service',steps:[{title:'방문',guide:''}]},a),{status:400});
 // The daily plan's quick-execution action is the same completion path, including undo and correction.
 person('daily-visit');
 const daily=await store.saveServiceRounding('2026-09','daily-visit',{version:0,taskVersion:null,status:'coordinating',date:'2026-09-17',assigneeId:'staff-park-jungyu'},a);
 const dailyPlan=(await store.day('2026-09-17','all',a)).plans.find(row=>row.taskId===daily.task.id);
 const requestId='683b06ee-7631-45bb-a0b9-1c206dc99c55';
 const recorded=await store.recordPlan(dailyPlan.id,{period:'morning',executionVersion:0,requestId,date:'2026-09-18'},a);
 assert.equal(recorded.planId,dailyPlan.id);assert.equal(recorded.period,'morning');
 assert.equal((await store.recordPlan(dailyPlan.id,{period:'morning',executionVersion:0,requestId,date:'2026-09-18'},b)).id,recorded.id);
 assert((await store.taskMaps('2026-09')).runs.find(row=>row.sourceRecipientId==='daily-visit').steps[0].completedAt);
 let corrected=await store.updateExecution(recorded.id,{version:recorded.version,date:'2026-09-19',period:'afternoon',content:'방문 결과 확인',assigneeId:'staff-hwang-youngsang'},a);
 assert.equal((await store.day('2026-09-17','all',a)).plans.find(row=>row.id===dailyPlan.id).assigneeId,'staff-park-jungyu');
 assert.equal(corrected.date,'2026-09-19');assert.equal(corrected.content,'방문 결과 확인');
 assert.equal((await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='daily-visit').rounding.date,'2026-09-19');
 await store.cancelExecution(corrected.id,corrected.version,a);
 assert.equal((await store.taskMaps('2026-09')).runs.find(row=>row.sourceRecipientId==='daily-visit').steps[0].completedAt,null);
 assert.equal((await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='daily-visit').rounding.status,'coordinating');
 assert.equal(db.prepare('SELECT count(*) n FROM work_executions WHERE task_id=?').get(daily.task.id).n,1);
 // Existing scheduled records are linked on the first map read, without requiring a new visit save.
 person('legacy-plan');
 const legacy={status:'coordinating',date:'2026-09-16',assigneeId:'staff-park-jungyu',updatedBy:a.me.id,updatedAt:'2026-09-01'};
 db.prepare('INSERT INTO recipient_service_rounding(month,recipient_id,payload,version) VALUES(?,?,?,1)').run('2026-09','legacy-plan',JSON.stringify(legacy));
 board=await store.taskMaps('2026-09',true,a);
 assert.equal(board.runs.filter(row=>row.sourceRecipientId==='legacy-plan').length,1);
 assert.equal((await store.day('2026-09-16','all',a)).plans.filter(row=>row.snapshot.title==='legacy-plan 라운딩').length,1);
 await store.taskMaps('2026-09',true,b);
 assert.equal((await store.taskMaps('2026-09')).runs.filter(row=>row.sourceRecipientId==='legacy-plan').length,1);

 // Pause keeps the same task, blocks ordinary completion and planned/manual execution,
 // and resumes only uncompleted work from the actual return month.
 const visit=await store.startVisit('2026-09',{...body,recipientId:'midmonth'},a);
 const plan=await store.createPlan({requestId:'a146857e-d5f4-421b-916a-961b1ff1376f',taskId:visit.id,assigneeId:body.assigneeId,date:'2026-09-21',period:'morning'},a);
 const paused=await store.pauseService('midmonth',{startDate:'2026-09-20',expectedReturnDate:null,reason:'입원'},a);
 let held=(await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='midmonth');assert.equal(held.task.onHold,true);assert.equal(held.servicePause.reason,'입원');assert.equal(held.servicePause.expectedReturnDate,null);
 assert.equal((await store.list(b,'all','open')).find(row=>row.id===visit.id).onHold,true);
 await assert.rejects(store.complete(visit.id,held.task.version,b),{status:409});await assert.rejects(store.startVisit('2026-09',{...body,recipientId:'midmonth'},b),{status:409});
 await assert.rejects(store.pauseService('midmonth',{startDate:'2026-09-21',reason:'중복'},b),{status:409});
 await assert.rejects(store.recordPlan(plan.id,{requestId:'bbb5c057-2283-4141-8ec0-25cd63052abf',period:'morning',executionVersion:0,date:'2026-09-21'},b),{status:409});
 await assert.rejects(store.recordManual({requestId:'adb5c057-2283-4141-8ec0-25cd63052abf',taskId:visit.id,date:'2026-09-21',assigneeId:body.assigneeId,period:'morning',content:'우회 수행',category:'service',related:[]},b),{status:409});
 await assert.rejects(store.resumeService('midmonth',{pauseId:paused.id,version:0,returnedDate:'2026-09-25'},b),{status:409});
 await assert.rejects(store.resumeService('midmonth',{pauseId:paused.id,version:1,returnedDate:'2026-09-19'},b),{status:400});
 await store.resumeService('midmonth',{pauseId:paused.id,version:1,returnedDate:'2026-09-25'},b);
 held=(await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='midmonth');assert.equal(held.task.id,visit.id);assert.equal(held.task.onHold,false);assert.equal(held.servicePause,null);assert.equal(held.lastServicePause.returnedDate,'2026-09-25');
 await store.complete(visit.id,held.task.version,b);
 const pausedAgain=await store.pauseService('midmonth',{startDate:'2026-09-26',expectedReturnDate:'2026-09-29',reason:'개인 사유'},a);
 await store.resumeService('midmonth',{pauseId:pausedAgain.id,version:1,returnedDate:'2026-09-29'},a);
 held=(await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='midmonth');assert.equal(held.task.status,'done');assert.equal((await store.startVisit('2026-09',{...body,recipientId:'midmonth'},b)).id,visit.id);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM recipient_service_pause_events').get().n,4);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM recipient_service_pause_events WHERE actor_id=?").get(b.me.id).n,1);
 person('crossmonth');const cross=await store.startVisit('2026-09',{...body,recipientId:'crossmonth'},a);const crossPause=await store.pauseService('crossmonth',{startDate:'2026-09-28',reason:'개인 사유'},a);
 await store.resumeService('crossmonth',{pauseId:crossPause.id,version:1,returnedDate:'2026-10-01'},b);assert.equal((await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='crossmonth').task.onHold,true);
 await assert.rejects(store.complete(cross.id,(await store.visitMonth('2026-09')).rows.find(row=>row.recipientId==='crossmonth').task.version,a),{status:409});
});
