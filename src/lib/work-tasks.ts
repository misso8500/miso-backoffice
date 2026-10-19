import { requestJson } from '../storage';

export const workCategoryLabels = {
  unclassified: '미분류 · 나중에 정리', recipient: '수급자 관리', service: '서비스 관리',
  staff: '인력 관리', operations: '기관 운영', rights: '권익·안전 관리'
} as const;
export type WorkCategory = keyof typeof workCategoryLabels;
export type WorkMember = { id: string; name: string; email: string; linked: boolean };
export type WorkReference = { id: string; type: 'recipient' | 'worker'; name: string; info: string; isDraft?: boolean };
export type WorkAssignee = { id: string; name: string };
export type WorkContext = { me: WorkMember; members: WorkMember[]; assignees: WorkAssignee[]; references: WorkReference[]; categories: WorkCategory[] };
export type WorkTask = {
  id: string; requesterId: string; assigneeId: string | null; title: string; description: string;
  category: WorkCategory; dueDate: string | null; related: WorkReference[]; status: 'open' | 'cancelled';
  version: number; createdAt: string; updatedAt: string; updatedBy: string; canEdit: boolean;
};
export type WorkTaskInput = { title: string; description: string; assigneeId: string; category: WorkCategory; dueDate: string; related: Pick<WorkReference, 'id' | 'type'>[]; requestId?: string };
async function workRequest<T>(path: string, options?: RequestInit): Promise<T> {
  try { return await requestJson<T>(path, options); }
  catch (error) {
    if (error instanceof Error && error.message === 'Not found') throw new Error('공동 업무 API를 찾을 수 없습니다. API 서버를 재시작한 뒤 다시 불러와 주세요.');
    throw error;
  }
}
export const loadWorkContext = () => workRequest<WorkContext>('/api/work/context').then(context => {
  if (!Array.isArray(context.assignees)) throw new Error('담당자 목록을 갱신하려면 API 서버를 재시작해 주세요.');
  return context;
});
export const loadWorkTasks = (assignee = 'all', status = 'open') => workRequest<WorkTask[]>(`/api/work/tasks?${new URLSearchParams({ assignee, status })}`);
export const createWorkTask = (input: WorkTaskInput) => requestJson<WorkTask>('/api/work/tasks', { method: 'POST', body: JSON.stringify(input) });
export const updateWorkTask = (id: string, input: WorkTaskInput, version: number) => requestJson<WorkTask>(`/api/work/tasks/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ ...input, version }) });
export const cancelWorkTask = (task: WorkTask) => requestJson<WorkTask>(`/api/work/tasks/${encodeURIComponent(task.id)}/cancel`, { method: 'POST', body: JSON.stringify({ version: task.version }) });
export type WorkTaskEvent = { version: number; kind: 'created' | 'updated' | 'cancelled'; actorName: string; createdAt: string; task: WorkTask };
export const loadWorkTaskHistory = (id: string) => requestJson<WorkTaskEvent[]>(`/api/work/tasks/${encodeURIComponent(id)}/history`);
