export type StaffRole = '사무원' | '사회복지사';
export type StaffEmployment = { hiredOn: string; payType: 'salary'|'hourly'; leaveMode: 'automatic'|'manual'|'none'; roles: {from:string;title:StaffRole}[] };
export function roleOn(employment: StaffEmployment, date: string) {
  return [...employment.roles].reverse().find(role=>role.from<=date)?.title;
}
export type StaffProfile = { staffId: string; name: string; organization: string; jobTitle: string; startTime: string; endTime: string; hours: number; employment?: StaffEmployment; version: number };
export type AttendanceKind = 'pending' | 'work' | 'off' | 'leave' | 'absent' | 'other';
export type StaffRow = { date: string; reviewed: boolean; kind: AttendanceKind; start: string; end: string; hours: number; leaveDays: number; note: string; signature: string; morning: string; afternoon: string; unknown: string; morningNote: string; afternoonNote: string; other: string };
export type StaffPayload = { profile: Omit<StaffProfile,'staffId'|'version'|'employment'>; rows: StaffRow[]; imported: string[]; attendance?: Pick<StaffRow,'date'|'kind'|'hours'|'leaveDays'>[] };
export type StaffDocument = { kind: 'attendance'|'journal'; period: string; payload: StaffPayload; version: number; status: 'draft'|'confirmed'; sourceHash: string; confirmedAt: string | null };
export type RecordSource = { id: string; version: number; date: string; period: 'morning'|'afternoon'|'unknown'; content: string };
export type StaffMonth = { document: StaffDocument; executions: RecordSource[]; journalCandidates?: RecordSource[]; leaveDates?: {date:string;days:number}[]; attendance: StaffDocument | null; sourceHash: string; sourceChanged: boolean };
export type LeavePlan = { id?: string; dates: {date: string; days: number}[]; leaveReason: string; contact: string; substitute: string; applicationDate: string; status: 'draft'|'confirmed'|'used'|'cancelled'; version: number; profile?: Pick<StaffProfile,'name'|'organization'|'jobTitle'>; reason?: string; signedFile?: {name:string;mime:string;previous?:boolean} };
export type LeaveLedger = { account: {granted: number; opening_used: number; version: number}; plans: LeavePlan[]; automatic?: {granted:number; incomplete:boolean}; override?: boolean; attendanceUses?: {date:string;days:number}[]; totals: { granted: number; used: number; remaining: number; planned: number; available: number } };
export const attendanceLabels: Record<AttendanceKind,string> = { pending:'확인 필요',work:'출근',off:'휴무',leave:'연차',absent:'결근',other:'기타' };
