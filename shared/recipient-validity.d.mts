import type {Recipient,RecognitionPeriod} from '../src/types';
export function renewalDate(end: string): string | null;
export function recognitionPeriods(recipient: Recipient): RecognitionPeriod[];
export function currentRecognition(periods: RecognitionPeriod[], today: string): RecognitionPeriod | null;
export function recognitionStatus(period: RecognitionPeriod | null,today: string): string;
export function previousPeriod(event: {memo?:string}): {startDate:string;endDate:string};
export function institutionStatus(recipient: Recipient,today: string): string;
