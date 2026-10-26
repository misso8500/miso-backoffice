import type { WorkCalendarData, WorkTask } from '../src/lib/work-tasks';
export type CalendarEntry = { key: string; taskId: string | null; owner: string | null; title: string; kinds: ('plan' | 'execution' | 'deadline')[]; task: WorkTask | null };
export function calendarDayEntries(data: WorkCalendarData, tasks: WorkTask[], day: string): CalendarEntry[];
