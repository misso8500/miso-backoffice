export type TrafficState = 'red' | 'yellow' | 'green' | 'idle';
export type TrafficStep = { id?: string; title: string; guide: string; assigneeId?: string | null; dueOffsetDays?: number; dueDate?: string; completedAt?: string | null; completedBy?: string | null; completedById?: string | null };
export type TrafficTemplate = { id: string; version?: number; title: string; category: string; kind: 'daily' | 'monthly' | 'event'; steps: TrafficStep[]; dueDay?: number; scheduleHistory?: { schedule: { assigneeId: string; startDate: string; weekdays: number[]; enabled?: boolean }; dueDay?: number }[]; createdAt?: string; schedule?: { assigneeId: string; startDate: string; weekdays: number[]; enabled?: boolean } };
export type TrafficRun = TrafficTemplate & { templateId: string; date: string; dueDate?: string; assigneeId: string; related: { id: string; type: 'recipient' | 'worker'; name: string; info: string }[]; version: number };
export type TrafficNode = { template: TrafficTemplate; state: TrafficState; expected: number; due: number; completed: number; runs: TrafficRun[]; cells: { date: string; state: TrafficState; required: boolean; completed: boolean; runIds: string[] }[]; asOf: string };
export const trafficLabels: Record<TrafficState, string>;
export function monthDates(month: string): string[];
export function trafficBoard(templates: TrafficTemplate[], runs: TrafficRun[], month: string, today: string): TrafficNode[];
