export type CopayRecipientRequest = {
  month: string; version: number; id: number; name: string; grade: string; code: string; rate: string;
  recipientId: string | null;
};

// Only source identity fields are prefilled. Billing amounts and claim months
// are not evidence of a person's birth date, address or service contract dates.
export function copayRecipientPrefill(row: CopayRecipientRequest) {
  return { name: row.name, careGrade: /^[1-5]$/.test(row.grade) ? `${row.grade}등급` : row.grade === '6' ? '인지지원등급' : '', longTermCareNumber: row.code || '' };
}
