import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AuthUser = { id: string; name: string; email: string };
let clientPromise: Promise<SupabaseClient> | undefined;

export const getAuthClient = () => {
  if (!clientPromise) {
    clientPromise = (async () => {
      const response = await fetch("/api/auth/config", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("로그인을 준비하지 못했습니다. 관리자에게 문의해 주세요.");
      const { url, publishableKey } = await response.json();
      return createClient(url, publishableKey, {
        auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
      });
    })().catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
};

export const getAuthHeaders = async () => {
  const client = await getAuthClient();
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new Error("구글 로그인이 필요합니다.");
  return { Authorization: `Bearer ${data.session.access_token}` };
};

export const authFailureEvent = "miso-auth-failure";
