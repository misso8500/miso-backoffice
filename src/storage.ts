import type {
  Recipient,
  RecipientInput,
  RestoreRecipientInput,
  TerminateContractInput
} from "./types";

export const API_UNAVAILABLE_MESSAGE =
  "API 서버에 연결할 수 없습니다. 터미널에서 `npm run api`를 실행한 뒤 다시 시도하세요.";

const requestJson = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(path, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers
      },
      ...options
    });
  } catch {
    throw new Error(API_UNAVAILABLE_MESSAGE);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? API_UNAVAILABLE_MESSAGE);
  }

  return response.json() as Promise<T>;
};

const normalizeRecipient = (recipient: Recipient): Recipient => ({
  ...recipient,
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
