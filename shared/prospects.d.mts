export const prospectStages:Record<'intake'|'consulting'|'visit_planned'|'waiting'|'deferred'|'lost'|'contracted',string>;
export const prospectActivityKinds:Record<'contact'|'consultation'|'visit'|'note',string>;
export function prospectClosed(stage:string):boolean;
export function prospectAttention(prospect:{archived:boolean;stage:string;nextDate:string},today:string):false|'overdue'|'today'|'scheduled';
