export function isCalendarDate(value: unknown): value is string;
export function moveDate(value: string, days: number): string;
export function halfYearStart(value: string): string;
export function halfYearEnd(value: string): string;
export function nextHalfYearStart(value: string): string;
export function planDeadline(category: string, startDate: string): string | null;
export function deadlineLabel(schedule: {category: string; status: string; writtenDate: string | null; notifiedDate: string | null} | null, startDate: string, today: string): string;
