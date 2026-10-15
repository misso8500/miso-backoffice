import { useEffect, useRef, useState } from "react";
import { LogIn, RefreshCw, ShieldCheck } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import App from "./App";
import { authFailureEvent, getAuthClient, type AuthUser } from "./auth";

export default function AuthGate() {
  const verifiedId = useRef<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let disposed = false;
    let revision = 0;
    let unsubscribe: (() => void) | undefined;
    const verify = async (session: Session | null) => {
      const current = ++revision;
      verifiedId.current = null;
      setUser(null);
      setHasSession(Boolean(session));
      if (!session) { setLoading(false); return; }
      setLoading(true);
      try {
        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(15000)
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "로그인을 확인하지 못했습니다.");
        if (!disposed && current === revision) { verifiedId.current = payload.id; setUser(payload); setError(""); }
      } catch (cause) {
        if (!disposed && current === revision) setError(cause instanceof Error ? cause.message : "로그인 확인에 실패했습니다.");
      } finally {
        if (!disposed && current === revision) setLoading(false);
      }
    };
    const recheck = () => {
      setUser(null);
      setLoading(true);
      void getAuthClient().then(async (client) => {
        const { data, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        if (!disposed) await verify(data.session);
      }).catch(() => { if (!disposed) { setError("다시 로그인해 주세요."); setLoading(false); } });
    };
    const callbackUrl = new URL(window.location.href);
    if (callbackUrl.searchParams.has("error")) {
      setError("구글 로그인이 취소되었거나 완료되지 않았습니다. 다시 시도해 주세요.");
      for (const key of ["error", "error_code", "error_description"]) callbackUrl.searchParams.delete(key);
      window.history.replaceState(null, "", callbackUrl);
    }
    setLoading(true);
    void getAuthClient().then((client) => {
      if (disposed) return;
      const { data } = client.auth.onAuthStateChange((event, session) => {
        // Token refresh does not unmount the current page or erase in-progress forms.
        if (event === "SIGNED_IN" && session?.user.id === verifiedId.current) return;
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT") void verify(session);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch((cause) => {
      if (!disposed) { setError(cause instanceof Error ? cause.message : "로그인을 준비하지 못했습니다."); setLoading(false); }
    });
    window.addEventListener(authFailureEvent, recheck);
    return () => { disposed = true; revision++; unsubscribe?.(); window.removeEventListener(authFailureEvent, recheck); };
  }, [retry]);

  const signOut = async () => {
    verifiedId.current = null;
    setUser(null); setLoading(true);
    try {
      const client = await getAuthClient();
      const { error: signOutError } = await client.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      setUser(null); setHasSession(false); setError("");
    } catch { setError("로그아웃하지 못했습니다. 다시 시도해 주세요."); }
    finally { setLoading(false); }
  };

  const signIn = async () => {
    setError(""); setLoading(true);
    try {
      const client = await getAuthClient();
      const { error: loginError } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/`, queryParams: { prompt: "select_account" } }
      });
      if (loginError) throw loginError;
    } catch {
      setError("구글 로그인에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setLoading(false);
    }
  };

  if (user) return <App key={user.id} authUser={user} onSignOut={signOut} />;
  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <ShieldCheck size={36} aria-hidden="true" />
        <span className="eyebrow">Miso Backoffice</span>
        <h1 id="login-title">미소 업무 관리</h1>
        <p>사용 중인 구글 계정으로 로그인해 주세요.<br />승인된 계정만 이용할 수 있습니다.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {loading ? <p role="status"><RefreshCw className="spin" size={18} /> 로그인 확인 중…</p> : (
          <>
            <button type="button" className="google-login-button" onClick={() => void signIn()}>
              <LogIn size={20} /> {hasSession ? "다른 구글 계정으로 로그인" : "구글 계정으로 로그인"}
            </button>
            {hasSession && <button type="button" className="secondary-button" onClick={() => void signOut()}>로그아웃</button>}
            {error && <button type="button" className="secondary-button" onClick={() => setRetry((value) => value + 1)}>다시 확인</button>}
          </>
        )}
      </section>
    </main>
  );
}
