import { requestJson } from '../storage';
import { workApiError } from '../../shared/work-api-error.mjs';

export const workCategoryLabels: Record<string, string> = {
  unclassified: '미분류 · 나중에 정리', recipient: '수급자 관리', service: '서비스 관리',
  staff: '인력 관리', operations: '기관 운영', rights: '권익·안전 관리'
} as const;
export type WorkCategory = string;
export type WorkMember = { id: string; name: string; email: string; linked: boolean };
export type WorkReference = { id: string; type: 'recipient' | 'worker'; name: string; info: string; isDraft?: boolean };
export type WorkAssignee = { id: string; name: string };
export type WorkContext = { me: WorkMember; members: WorkMember[]; assignees: WorkAssignee[]; references: WorkReference[]; categories: WorkCategory[]; categoryLabels?: Record<string, string>; canManageCategories?: boolean };
export type WorkTask = {
  id: string; requesterId: string; assigneeId: string | null; title: string; description: string;
  category: WorkCategory; dueDate: string | null; related: WorkReference[]; status: 'open' | 'done' | 'cancelled'; completedAt: string | null;
  version: number; createdAt: string; updatedAt: string; updatedBy: string; canEdit: boolean;
};
export type WorkTaskInput = { title: string; description: string; assigneeId: string; category: WorkCategory; dueDate: string; related: Pick<WorkReference, 'id' | 'type'>[]; requestId?: string };
async function workRequest<T>(path: string, options?: RequestInit): Promise<T> {
  try { return await requestJson<T>(path, options); }
  catch (error) {
    throw workApiError(error, import.meta.env.DEV);
  }
}
export const loadWorkContext = () => workRequest<WorkContext>('/api/work/context').then(context => {
  if (!Array.isArray(context.assignees)) throw new Error('담당자 목록을 갱신하려면 API 서버를 재시작해 주세요.');
  if (context.categoryLabels) Object.assign(workCategoryLabels, context.categoryLabels);
  return context;
});
export const loadWorkTasks = (assignee = 'all', status = 'open') => workRequest<WorkTask[]>(`/api/work/tasks?${new URLSearchParams({ assignee, status })}`);
export const createWorkTask = (input: WorkTaskInput) => workRequest<WorkTask>('/api/work/tasks', { method: 'POST', body: JSON.stringify(input) });
export const updateWorkTask = (id: string, input: WorkTaskInput, version: number) => workRequest<WorkTask>(`/api/work/tasks/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...input, version }) });
export const cancelWorkTask = (task: WorkTask) => workRequest<WorkTask>(`/api/work/tasks/${encodeURIComponent(task.id)}/cancel`, { method: 'POST', body: JSON.stringify({ version: task.version }) });
export type WorkTaskEvent = { version: number; kind: 'created' | 'updated' | 'cancelled'; actorName: string; createdAt: string; task: WorkTask };
export const loadWorkTaskHistory = (id: string) => workRequest<WorkTaskEvent[]>(`/api/work/tasks/${encodeURIComponent(id)}/history`);
export type WorkPeriod = 'morning' | 'afternoon' | 'unknown';
export type WorkSnapshot = { title: string; category: WorkCategory; related: WorkReference[] };
export type WorkPlan = { id: string; taskId: string; assigneeId: string; date: string; period: WorkPeriod; snapshot: WorkSnapshot; status: 'planned' | 'cancelled'; version: number; createdBy: string; updatedBy: string; createdAt: string; updatedAt: string };
export type WorkExecution = Omit<WorkPlan, 'taskId' | 'status'> & { taskId: string | null; planId: string | null; content: string; status: 'recorded' | 'voided' };
export type WorkDay = { date: string; assignee: string; plans: WorkPlan[]; executions: WorkExecution[]; linkedExecutions?: WorkExecution[] };
export type WorkCalendarTask = Pick<WorkTask, 'id' | 'title' | 'category' | 'dueDate' | 'assigneeId' | 'related'>;
export type WorkCalendarData = { from: string; to: string; assignee: string; plans: WorkPlan[]; executions: WorkExecution[]; deadlines: WorkCalendarTask[]; unplanned: WorkCalendarTask[] };
export const loadWorkCalendar = (from: string, to: string, assignee: string) => workRequest<WorkCalendarData>(`/api/work/calendar?${new URLSearchParams({ from, to, assignee })}`);
export const workPeriods: Record<WorkPeriod, string> = { morning: '오전', afternoon: '오후', unknown: '미정·미확인' };
export const workToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const shiftWorkDay = (date: string, offset: number) => { const result = new Date(date+'T12:00:00Z'); result.setUTCDate(result.getUTCDate()+offset); return result.toISOString().slice(0, 10); };
export const loadWorkDay = (date: string, assignee = 'all') => workRequest<WorkDay>(`/api/work/day?${new URLSearchParams({ date, assignee })}`);
export const createWorkPlan = (input: { taskId: string; assigneeId: string; date: string; period: WorkPeriod; requestId: string }) => workRequest<WorkPlan>('/api/work/plans', { method: 'POST', body: JSON.stringify(input) });
export const cancelWorkPlan = (plan: WorkPlan) => workRequest<WorkPlan>(`/api/work/plans/${plan.id}/cancel`, { method: 'POST', body: JSON.stringify({ version: plan.version }) });
export const executeWorkPlan = (plan: WorkPlan, period: WorkPeriod, executionVersion: number, requestId: string, date?: string) => workRequest<WorkExecution>(`/api/work/plans/${plan.id}/execute`, { method: 'POST', body: JSON.stringify({ period, executionVersion, requestId, date }) });
export const createWorkExecution = (input: { taskId?: string; assigneeId: string; date: string; period: WorkPeriod; content: string; category: WorkCategory; related: Pick<WorkReference, 'id' | 'type'>[]; requestId: string }) => workRequest<WorkExecution>('/api/work/executions', { method: 'POST', body: JSON.stringify(input) });
export const updateWorkExecution = (execution: WorkExecution, input: { content: string; period: WorkPeriod; assigneeId: string; date?: string }) => workRequest<WorkExecution>(`/api/work/executions/${execution.id}`, { method: 'PUT', body: JSON.stringify({ ...input, version: execution.version }) });
export const cancelWorkExecution = (execution: WorkExecution) => workRequest<WorkExecution>(`/api/work/executions/${execution.id}/cancel`, { method: 'POST', body: JSON.stringify({ version: execution.version }) });
export const completeWorkTask = (task: WorkTask, reopen = false) => workRequest<WorkTask>(`/api/work/tasks/${task.id}/${reopen ? 'reopen' : 'complete'}`, { method: 'POST', body: JSON.stringify({ version: task.version }) });
