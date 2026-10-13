import { test } from "node:test";
import assert from "node:assert/strict";
import { AuthError, getPublicAuthConfig, requireGoogleUser, handleAuthRequest } from "../server/auth.mjs";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  AUTH_ALLOWED_EMAILS: " one@example.com, TWO@example.com "
};
const request = { headers: { authorization: "Bearer valid-token" } };
const googleUser = {
  id: "google-user-id", email: "one@example.com", email_confirmed_at: "2026-01-01",
  app_metadata: { provider: "google" }, identities: [{ provider: "google" }],
  user_metadata: { full_name: "사용자" }
};
const fetchUser = (user = googleUser, status = 200) => async () => new Response(JSON.stringify(user), { status });
const failsWith = (status) => (error) => error instanceof AuthError && error.status === status;

test("missing and malformed bearer tokens fail before contacting the auth provider", async () => {
  for (const authorization of [undefined, "", "Basic x", "Bearer a b"]) {
    await assert.rejects(requireGoogleUser({ headers: { authorization } }, env, () => assert.fail("must not fetch")), failsWith(401));
  }
});

test("only server-verified Google identities with allowed emails can access data", async () => {
  const user = await requireGoogleUser(request, env, async (url, options) => {
    assert.equal(url, "https://test.supabase.co/auth/v1/user");
    assert.equal(options.headers.Authorization, "Bearer valid-token");
    assert.equal(options.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
    return new Response(JSON.stringify(googleUser));
  });
  assert.deepEqual(user, { id: "google-user-id", email: "one@example.com", name: "사용자" });
  assert.equal((await requireGoogleUser(request, env, fetchUser({ ...googleUser, email: "TWO@example.com" }))).email, "TWO@example.com");
  for (const invalid of [
    { ...googleUser, email: "outsider@example.com" },
    { ...googleUser, email_confirmed_at: null },
    { ...googleUser, app_metadata: { provider: "email" } },
    { ...googleUser, identities: [] }
  ]) await assert.rejects(requireGoogleUser(request, env, fetchUser(invalid)), failsWith(403));
});

test("empty allowlist, invalid sessions and auth outages fail closed", async () => {
  await assert.rejects(requireGoogleUser(request, { ...env, AUTH_ALLOWED_EMAILS: "" }, fetchUser()), failsWith(503));
  await assert.rejects(requireGoogleUser(request, env, fetchUser({}, 401)), failsWith(401));
  await assert.rejects(requireGoogleUser(request, env, fetchUser({}, 500)), failsWith(503));
  await assert.rejects(requireGoogleUser(request, env, async () => { throw new Error("network"); }), failsWith(503));
});

test("public auth config never exposes allowlist, DB password or secret keys", () => {
  assert.deepEqual(getPublicAuthConfig({ ...env, DATABASE_URL: "private", SERVICE_ROLE_KEY: "private" }), {
    url: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY
  });
  const jwt = (role) => `eyJheader.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  for (const key of ["sb_secret_private", jwt("service_role"), "invalid"]) {
    assert.throws(() => getPublicAuthConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: key }), failsWith(503));
  }
  assert.equal(getPublicAuthConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: jwt("anon") }).publishableKey, jwt("anon"));
});

test("data, health and old user-selection routes require authentication", async () => {
  for (const url of ["/api/recipients", "/api/employment-contracts", "/api/health", "/api/backoffice-users/sessions/device", "/api/auth/me"]) {
    await assert.rejects(handleAuthRequest({ url, method: "GET", headers: {} }, {}, () => assert.fail("must not respond with data")), failsWith(401));
  }
});
