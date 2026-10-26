import type { WorkDay, WorkTask } from '../src/lib/work-tasks';
export function groupDayTasks(tasks: WorkTask[], date: string, activity: WorkDay | null): { title: string; rows: WorkTask[] }[];
