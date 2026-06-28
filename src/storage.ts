import type { Recipient, RecipientInput } from "./types";

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

export const loadRecipients = () => requestJson<Recipient[]>("/api/recipients");

export const loadRecipient = (recipientId: string) =>
  requestJson<Recipient>(`/api/recipients/${recipientId}`);

export const createRecipient = (recipient: RecipientInput) =>
  requestJson<Recipient>("/api/recipients", {
    method: "POST",
    body: JSON.stringify(recipient)
  });

export const updateRecipient = (recipient: RecipientInput) =>
  requestJson<Recipient>(`/api/recipients/${recipient.id}`, {
    method: "PUT",
    body: JSON.stringify(recipient)
  });

export const deleteRecipient = (recipientId: string) =>
  requestJson<{ ok: boolean }>(`/api/recipients/${recipientId}`, {
    method: "DELETE"
  });
