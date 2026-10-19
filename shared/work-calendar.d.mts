export type WorkCalendarMode = 'day' | 'week' | 'month';
export function workCalendarRange(value: string, mode: WorkCalendarMode): { from: string; to: string; dates: string[] };
export function moveWorkCalendar(value: string, mode: WorkCalendarMode, direction: number): string;
export function workAssigneeInitial(name: string | null | undefined): string;
export function weeklyWorkRecords<P extends { taskId: string; assigneeId: string; status: string }, E extends { taskId: string | null; assigneeId: string; status: string }, T extends { id: string }>(data: { plans: P[]; executions: E[]; deadlines: T[] }): { plans: P[]; executions: E[]; deadlines: T[] };
