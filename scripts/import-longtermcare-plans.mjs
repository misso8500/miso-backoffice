// Source-first import runner. Default is a PostgreSQL READ ONLY preview.
// --apply requires the exact fingerprint from a preview, and writes a backup first.
import pg from 'pg';
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadEnv} from '../server/load-env.mjs';
import {createCarePlanImportStore,parseCarePlanWorkbook} from '../server/care-plan-import.mjs';
loadEnv(process.cwd());
const args=process.argv.slice(2),apply=args.includes('--apply'),option=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
const filename=(await readdir('tmp')).find(name=>name.normalize('NFC').includes('급여제공계획서')&&name.endsWith('.xlsx'));if(!filename)throw Error('tmp의 급여제공계획서 내역 파일이 필요합니다.');
const bytes=await readFile(resolve('tmp',filename)),source={filename,file:bytes.toString('base64')},output=resolve(option('--output')||`handoff/longtermcare-plan-import-${new Date().toISOString().replaceAll(':','-')}`);
if(apply&&!option('--fingerprint'))throw Error('--apply에는 미리보기의 --fingerprint가 필요합니다.');
const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:10000,ssl:process.env.PGSSLMODE==='require'||process.env.DATABASE_URL?.includes('sslmode=require')?{rejectUnauthorized:false}:undefined});
try{
 await client.connect();const existing=Boolean((await client.query("SELECT to_regclass('public.recipient_plan_imports') AS name")).rows[0].name);await mkdir(output,{recursive:true});
 const transaction=async fn=>{await client.query(apply?'BEGIN':'BEGIN READ ONLY');try{
  if(apply){await client.query(await readFile(new URL('../server/care-plan-import-schema.sql',import.meta.url),'utf8'));await client.query('ALTER TABLE recipient_plan_imports ENABLE ROW LEVEL SECURITY');await client.query('REVOKE ALL ON TABLE recipient_plan_imports FROM anon, authenticated');await client.query('LOCK TABLE recipients IN SHARE ROW EXCLUSIVE MODE');await client.query('SELECT id FROM recipients ORDER BY id FOR UPDATE');}
  const q=async(sql,values=[])=>!apply&&!existing&&sql==='SELECT * FROM recipient_plan_imports ORDER BY source_key'?{rows:[]}:client.query(sql,values);if(apply)q.forUpdate=' FOR UPDATE';
  if(apply){const backup={createdAt:new Date().toISOString(),sourceFilename:filename,sourceBase64:source.file,tables:{}};for(const name of ['recipients','recipient_plans','recipient_contract_events','recipient_deletions','recipient_plan_imports'])backup.tables[name]=(await client.query(`SELECT * FROM ${name}`)).rows;await writeFile(resolve(output,'backup.json'),JSON.stringify(backup,null,2)+'\n');}
  const value=await fn(q);await client.query(apply?'COMMIT':'ROLLBACK');return value;
 }catch(error){await client.query('ROLLBACK');throw error;}};
 const store=createCarePlanImportStore(transaction);
 if(!apply){const preview=await store.previewCarePlanImport(source);const summary={readOnly:true,fingerprint:preview.fingerprint,source:filename.normalize('NFC'),people:preview.groups.length,newRecipients:preview.groups.filter(g=>g.action==='create').length,restoredRecipients:preview.groups.filter(g=>g.action==='restore').length,recipientsWithUpdates:preview.groups.filter(g=>g.recipientId&&g.changes.length).length,recognitionNumbersToFill:preview.groups.filter(g=>g.recipientId&&g.changes.some(c=>c.column==='long_term_care_number'&&(!c.before||c.before.startsWith('__draft__:')))).length,planRows:preview.rows.length,newPlans:preview.rows.filter(r=>r.action==='create').length,updatedPlans:preview.rows.filter(r=>r.action==='update').length,unchangedPlans:preview.rows.filter(r=>r.action==='unchanged').length,errorRows:preview.rows.filter(r=>r.errors.length).length,peopleWithMissingBasicInfo:preview.groups.filter(g=>g.missing.length).length,output};await writeFile(resolve(output,'preview.json'),JSON.stringify(preview,null,2)+'\n');await writeFile(resolve(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));}
 else{const parsed=await parseCarePlanWorkbook(source);if(parsed.rows.some(row=>row.errors.length))throw Error('원본 식별 오류가 있어 반영하지 않았습니다.');const manifest=await store.applyCarePlanImport({...source,fingerprint:option('--fingerprint'),selectedKeys:parsed.rows.map(row=>row.key)}, {me:{id:'longtermcare-source-import',name:'롱텀케어 원본 데이터 이관'}});await writeFile(resolve(output,'result.json'),JSON.stringify(manifest,null,2)+'\n');const counts=(await client.query('SELECT (SELECT COUNT(*)::int FROM recipients WHERE NOT EXISTS(SELECT 1 FROM recipient_deletions d WHERE d.recipient_id=recipients.id)) AS visible_recipients,(SELECT COUNT(*)::int FROM recipient_plan_imports) AS source_plans,(SELECT COUNT(*)::int FROM recipient_plans) AS plan_versions')).rows[0];await writeFile(resolve(output,'verification.json'),JSON.stringify(counts,null,2)+'\n');console.log(JSON.stringify({applied:true,...manifest,verification:counts,backup:resolve(output,'backup.json')},null,2));}
}finally{await client.end();}
