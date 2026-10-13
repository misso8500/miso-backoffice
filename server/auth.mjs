export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const getPublicAuthConfig = (env = process.env) => {
  const url = env.SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
  let safeKey = publishableKey?.startsWith("sb_publishable_");
  if (publishableKey?.startsWith("eyJ")) {
    try {
      safeKey = JSON.parse(Buffer.from(publishableKey.split(".")[1], "base64url").toString()).role === "anon";
    } catch { safeKey = false; }
  }
  if (!url || !safeKey) throw new AuthError(503, "로그인 설정을 확인해 주세요. 관리자에게 문의해 주세요.");
  return { url, publishableKey };
};

export const requireGoogleUser = async (request, env = process.env, fetchUser = fetch) => {
  const token = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? "")?.[1];
  if (!token) throw new AuthError(401, "구글 로그인이 필요합니다.");
  const allowedEmails = new Set((env.AUTH_ALLOWED_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
  if (!allowedEmails.size) throw new AuthError(503, "로그인 허용 계정이 설정되지 않았습니다. 관리자에게 문의해 주세요.");
  const { url, publishableKey } = getPublicAuthConfig(env);
  let response;
  try {
    response = await fetchUser(`${url}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new AuthError(503, "로그인 확인에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (response.status >= 500 || response.status === 429) throw new AuthError(503, "로그인 확인이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.");
  if (!response.ok) throw new AuthError(401, "로그인이 만료되었습니다. 다시 로그인해 주세요.");
  const user = await response.json();
  if (!user.id || !user.email_confirmed_at || user.app_metadata?.provider !== "google" ||
      !user.identities?.some((identity) => identity.provider === "google")) {
    throw new AuthError(403, "확인된 구글 계정으로 로그인해 주세요.");
  }
  if (!allowedEmails.has(user.email?.toLowerCase())) throw new AuthError(403, "사용 권한이 없는 계정입니다. 승인된 구글 계정으로 로그인해 주세요.");
  return { id: user.id, email: user.email, name: user.user_metadata?.full_name || user.email };
};

export const handleAuthRequest = async (request, response, sendJson) => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname;
  if (path === "/api/auth/config" && request.method === "GET") {
    sendJson(response, 200, getPublicAuthConfig());
    return { handled: true };
  }
  const user = await requireGoogleUser(request);
  if (path === "/api/auth/me" && request.method === "GET") {
    sendJson(response, 200, user);
    return { handled: true, user };
  }
  return { handled: false, user };
};
