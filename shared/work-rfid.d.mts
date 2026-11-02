export type RfidSettings = { totalDays: number | null; totalHours: number | null; pattern: 'weekdays' | 'monSat' | 'custom'; dates: string[]; notes: string };
export type RfidRecord = { checked: boolean; note: string; updatedAt?: string; updatedBy?: string };
export type RfidDocument = { version: number; settings: RfidSettings; records: Record<string, RfidRecord> };
export type RfidRecipient = { id: string; name: string; operationalName: string; serviceStartDate: string; serviceEndDate: string; selected: boolean; enabled: boolean; document: RfidDocument };
export function emptyRfidSettings(): RfidSettings;
export function rfidMonthDates(month: string): string[];
export function rfidScheduled(date: string, settings: RfidSettings, recipient: {serviceStartDate: string; serviceEndDate: string}): boolean;
