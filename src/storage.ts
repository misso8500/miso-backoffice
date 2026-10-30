import {validatePlanResponse} from '../shared/validate-plan-response.mjs';
import { getAuthHeaders, authFailureEvent } from "./auth";
import { workOperationEvent } from './WorkOperationStatus';
import { workCache, useWorkCacheIdentity, applyWorkMutation } from './lib/work-cache';
import type {
  EmploymentContract,
  EmploymentContractInput,
  BackofficeState,
  Recipient,
  RecipientPlanState,
  RecipientPlanInput,
  RecipientInput,
  RestoreRecipientInput,
  TerminateContractInput
} from "./types";

export const API_UNAVAILABLE_MESSAGE =
  "API 서버에 연결할 수 없습니다. 터미널에서 `npm run api`를 실행한 뒤 다시 시도하세요.";

export const requestJson = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const method=(options?.method ?? 'GET').toUpperCase();
  const cached=/^\/api\/work\/(?:context|tasks|task-maps|day|calendar|recurrences|categories)(?:[/?]|$)/.test(path) && method==='GET';
  if(path.startsWith('/api/work/')) {
    try { useWorkCacheIdentity(JSON.stringify(await getAuthHeaders())); }
    catch(error) { workCache.clear(); throw error; }
  }
  const tracked = path.startsWith('/api/work/') && method!=='GET' || path === '/api/recipients/bulk-drafts' || path === '/api/employment-contracts/bulk-drafts';
  const id = crypto.randomUUID();
  const notify = (phase: 'start' | 'success' | 'error') => { if (tracked) window.dispatchEvent(new CustomEvent(workOperationEvent, { detail: { id, phase } })); };
  notify('start');
  try {
    const result = cached ? await workCache.get<T>(path,()=>requestJsonImpl<T>(path,options),{force:options?.cache==='reload'||options?.cache==='no-store'}) : await requestJsonImpl<T>(path, options);
    if(path.startsWith('/api/work/') && method!=='GET') applyWorkMutation(path,result);
    notify('success'); return result;
  }
  catch (error) {
    if(path.startsWith('/api/work/') && method!=='GET') workCache.invalidate(()=>true);
    notify('error'); throw error;
  }
};

if(typeof window!=='undefined') {
  window.addEventListener(authFailureEvent,()=>workCache.clear());
  window.addEventListener('miso-work-session-change',()=>workCache.clear());
  const revalidate=async()=>{try {useWorkCacheIdentity(JSON.stringify(await getAuthHeaders()));await workCache.revalidate();}catch{workCache.clear();}};
  window.addEventListener('focus',()=>{void revalidate();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void revalidate();});
}

const requestJsonImpl = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  let response: Response;
  const authHeaders = await getAuthHeaders();

  try {
    response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
        ...authHeaders
      }
    });
  } catch {
    throw new Error(API_UNAVAILABLE_MESSAGE);
  }

  if (response.status === 401 || response.status === 403) {
    window.dispatchEvent(new Event(authFailureEvent));
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? API_UNAVAILABLE_MESSAGE);
  }

  return response.json() as Promise<T>;
};

const normalizeRecipient = (recipient: Recipient): Recipient => ({
  ...recipient,
  serviceType: recipient.serviceType ?? "방문",
  caregiverRequirements: recipient.caregiverRequirements ?? "",
  reductionType: recipient.reductionType ?? "일반",
  relatedPeople: recipient.relatedPeople ?? "",
  enabled: recipient.enabled ?? true,
  recontractCount: recipient.recontractCount ?? 0
});

export const loadRecipients = async () => {
  const recipients = await requestJson<Recipient[]>("/api/recipients");
  return recipients.map(normalizeRecipient);
};

export const loadRecipient = (recipientId: string) =>
  requestJson<Recipient>(`/api/recipients/${recipientId}`).then(normalizeRecipient);

export const createRecipient = (recipient: RecipientInput) =>
  requestJson<Recipient>("/api/recipients", {
    method: "POST",
    body: JSON.stringify({ ...recipient, enabled: recipient.enabled ?? true })
  }).then(normalizeRecipient);

export type RecipientDraftRow = {
  id: string;
  name: string;
  birthDate: string;
  longTermCareNumber: string;
  careGrade: string;
  phone: string;
  address: string;
};

export const saveRecipientDraftRows = (rows: RecipientDraftRow[]) =>
  requestJson<{ recipients: Recipient[] }>("/api/recipients/bulk-drafts", {
    method: "POST", body: JSON.stringify({ rows })
  }).then(({ recipients }) => recipients.map(normalizeRecipient));

export const updateRecipient = (recipient: RecipientInput) =>
  requestJson<Recipient>(`/api/recipients/${recipient.id}`, {
    method: "PUT",
    body: JSON.stringify({ ...recipient, enabled: recipient.enabled ?? true })
  }).then(normalizeRecipient);

export const terminateContract = (recipientId: string, input: TerminateContractInput) =>
  requestJson<Recipient>(`/api/recipients/${recipientId}/terminate`, {
    method: "POST",
    body: JSON.stringify(input)
  })
    .then(normalizeRecipient)
    .catch((error) => {
      if (error instanceof Error && error.message === "Not found") {
        throw new Error("계약해지 API를 찾을 수 없습니다. `npm run api`를 재시작하세요.");
      }

      throw error;
    });

export const restoreRecipient = (recipientId: string, input: RestoreRecipientInput) =>
  requestJson<Recipient>(`/api/recipients/${recipientId}/restore`, {
    method: "POST",
    body: JSON.stringify(input)
  })
    .then(normalizeRecipient)
    .catch((error) => {
      if (error instanceof Error && error.message === "Not found") {
        throw new Error("계약복구 API를 찾을 수 없습니다. `npm run api`를 재시작하세요.");
      }

      throw error;
    });

export const deleteRecipient = (recipientId: string) =>
  requestJson<{ ok: boolean }>(`/api/recipients/${recipientId}`, {
    method: "DELETE"
  });

export const loadBackofficeState = () =>
  requestJson<BackofficeState>("/api/backoffice-users");

const normalizeEmploymentContract = (contract: EmploymentContract): EmploymentContract => ({
  ...contract,
  enabled: contract.enabled ?? true,
  breakMinutes: Number(contract.breakMinutes ?? 0),
  wageAmount: Number(contract.wageAmount ?? 0),
  nonTaxableVehicleAllowance: Number(contract.nonTaxableVehicleAllowance ?? 0),
  nonTaxableMealAllowance: Number(contract.nonTaxableMealAllowance ?? 0),
  taxableExtraPay: Number(contract.taxableExtraPay ?? 0),
  workplaceType: contract.workplaceType ?? "office",
  recipientAssignments: contract.recipientAssignments ?? [],
  insuranceSnapshots: contract.insuranceSnapshots ?? [],
  contractTerms: contract.contractTerms ?? []
});

export const loadEmploymentContracts = async () => {
  const contracts = await requestJson<EmploymentContract[]>("/api/employment-contracts");
  return contracts.map(normalizeEmploymentContract);
};

export type EmploymentDraftRow = {
  id: string;
  workerName: string;
  residentRegistrationNumber: string;
  workerPhone: string;
  primaryBank: string;
  bankAccountNumber: string;
  contractStartDate: string;
  contractEndDate: string;
};

export const saveEmploymentDraftRows = (rows: EmploymentDraftRow[]) =>
  requestJson<{ contracts: EmploymentContract[] }>("/api/employment-contracts/bulk-drafts", {
    method: "POST", body: JSON.stringify({ rows })
  }).then(({ contracts }) => contracts.map(normalizeEmploymentContract));

export const createEmploymentContract = (contract: EmploymentContractInput) =>
  requestJson<EmploymentContract>("/api/employment-contracts", {
    method: "POST",
    body: JSON.stringify({ ...contract, enabled: contract.enabled ?? true })
  }).then(normalizeEmploymentContract);

export const updateEmploymentContract = (contract: EmploymentContractInput) =>
  requestJson<EmploymentContract>(`/api/employment-contracts/${contract.id}`, {
    method: "PUT",
    body: JSON.stringify({ ...contract, enabled: contract.enabled ?? true })
  }).then(normalizeEmploymentContract);

export const updateRecipientServicePeriod = (id: string, input: { serviceStartDate: string; serviceEndDate: string; reason: 'renewal' | 'correction'; updatedAt: string }) =>
  requestJson<Recipient>(`/api/recipients/${id}/service-period`, { method: 'PUT', body: JSON.stringify(input) });

export type RecipientPeriodEvent = { id: string; type: string; serviceStartDate: string; serviceEndDate: string; memo?: string; createdAt: string; contractExpiredDate?: string };
export const loadRecipientPeriodEvents = (id: string) => requestJson<RecipientPeriodEvent[]>(`/api/recipients/${id}/contract-events`);

export const loadRecipientPlan = (id: string) => requestJson<RecipientPlanState>(`/api/recipients/${id}/plan`).then(validatePlanResponse);
export const saveRecipientPlan = (id: string, input: RecipientPlanInput) => requestJson<RecipientPlanState>(`/api/recipients/${id}/plan`, { method: 'PUT', body: JSON.stringify(input) }).then(validatePlanResponse);
