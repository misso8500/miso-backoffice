export function recurrenceToday(): string;
export function recurrenceDates(rule: {kind: 'monthly' | 'daily'; dueDay: number; includeSaturday: boolean; includeSunday: boolean; includeLeave: boolean}, month: string, leaveDates?: string[]): string[];
export function recurrenceTitle(template: string, date: string): string;
