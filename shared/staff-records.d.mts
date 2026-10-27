import type { StaffPayload, StaffProfile, RecordSource, LeavePlan, StaffRow } from '../src/lib/staff-records';
export function monthDays(month: string): string[];
export function documentDraft(kind: string, month: string, profile: StaffProfile, executions?: RecordSource[]): StaffPayload;
export function appendExecutionCandidates(payload: StaffPayload, executions: RecordSource[]): StaffPayload;
export function leaveTotals(granted: number, openingUsed: number, plans: LeavePlan[], attendanceRows?: StaffRow[]): {granted:number;used:number;remaining:number;planned:number;available:number};
