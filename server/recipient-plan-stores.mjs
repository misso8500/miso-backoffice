import {attachRecipientPlan,buildPlanState,planFromRow,planToday,preparePlanVersions} from './recipient-plans.mjs';
const missing=()=>Object.assign(new Error('수급자를 찾을 수 없습니다.'),{status:404});
const columns='id,recipient_id,revision,payload,effective_date,change_reason,change_kind,source_revision,author_id,author_name,created_at,plan_id,schedule';
const values=(id,p)=>[p.id,id,p.version,JSON.stringify(p.notes),p.effectiveDate,p.changeReason,p.changeKind,p.sourceVersion,p.authorId,p.authorName,p.createdAt,p.planId??null,p.schedule?JSON.stringify(p.schedule):null];
function summarySql(){return `WITH latest_plans AS (
 SELECT *,ROW_NUMBER() OVER(PARTITION BY recipient_id,COALESCE(plan_id,id) ORDER BY revision DESC) AS logical_rank FROM recipient_plans)
 SELECT * FROM latest_plans WHERE logical_rank=1`;}
function enrich(recipients,rows){const byId=new Map();for(const row of rows){const group=byId.get(row.recipient_id)??[];group.push(row);byId.set(row.recipient_id,group);}return recipients.map(r=>attachRecipientPlan(r,byId.get(r.id)??[]));}
export function createPostgresPlanStore(pool,fromRow,recognitionFor=async()=>[]){
  const read=async(executor,id,locked=false)=>{
    const result=await executor.query(`SELECT * FROM recipients WHERE id=$1${locked?' FOR UPDATE':''}`,[id]);
    if(!result.rows[0])throw missing();
    const recipient=fromRow(result.rows[0]), records=await executor.query('SELECT * FROM recipient_plans WHERE recipient_id=$1 ORDER BY revision DESC',[id]);
    return {recipient,versions:records.rows.map(planFromRow)};
  };
  return {
    async get(id){const {recipient,versions}=await read(pool,id);return buildPlanState(recipient,versions,planToday(),await recognitionFor(pool,id));},
    async enrich(recipients){if(!recipients.length)return [];const result=await pool.query(summarySql());return enrich(recipients,result.rows);},
    async save(id,body,user){const client=await pool.connect();try{
      await client.query('BEGIN');const {recipient,versions}=await read(client,id,true);
      for(const p of preparePlanVersions(body,recipient,versions,user))await client.query(`INSERT INTO recipient_plans(${columns}) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,values(id,p));
      // A plan revision does not rewrite the portal/contract dates or registration state.
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
      return this.get(id);
    }
  };
}
export function createSqlitePlanStore(db,fromRow,recognitionFor=()=>[]){
  db.exec(`CREATE TABLE IF NOT EXISTS recipient_plans (
    id TEXT PRIMARY KEY,recipient_id TEXT NOT NULL REFERENCES recipients(id),revision INTEGER NOT NULL,payload TEXT NOT NULL,
    effective_date TEXT,change_reason TEXT NOT NULL,change_kind TEXT NOT NULL,source_revision INTEGER,
    author_id TEXT,author_name TEXT NOT NULL,created_at TEXT NOT NULL,plan_id TEXT,schedule TEXT,UNIQUE(recipient_id,revision));
    CREATE INDEX IF NOT EXISTS idx_recipient_plans_date ON recipient_plans(recipient_id,effective_date DESC,revision DESC);`);
  const columnsPresent=db.prepare('PRAGMA table_info(recipient_plans)').all();
  for(const [name,type] of [['plan_id','TEXT'],['schedule','TEXT']])if(!columnsPresent.some(c=>c.name===name))db.exec(`ALTER TABLE recipient_plans ADD COLUMN ${name} ${type}`);
  const read=id=>{const row=db.prepare('SELECT * FROM recipients WHERE id=?').get(id);if(!row)throw missing();return {recipient:fromRow(row),versions:db.prepare('SELECT * FROM recipient_plans WHERE recipient_id=? ORDER BY revision DESC').all(id).map(planFromRow)};};
  return {
    get(id){const {recipient,versions}=read(id);return buildPlanState(recipient,versions,planToday(),recognitionFor(db,id));},
    enrich(recipients){return enrich(recipients,db.prepare(summarySql()).all());},
    save(id,body,user){db.exec('BEGIN IMMEDIATE');try{
      const {recipient,versions}=read(id);for(const p of preparePlanVersions(body,recipient,versions,user))db.prepare(`INSERT INTO recipient_plans(${columns}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...values(id,p));
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}return this.get(id);}
  };
}
