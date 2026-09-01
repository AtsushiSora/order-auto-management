import { useState, type FormEvent } from "react";
import { CarFront, FlaskConical, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "../state/AuthContext";

export function LoginPage() {
  const { signIn, testSignIn } = useAuth();
  const testLoginEnabled =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_LOGIN === "true";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ログインできませんでした。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand-mark"><CarFront size={33} /></div>
        <p className="login-eyebrow">ORDER AUTO</p>
        <h1>管理システム</h1>
        <p className="login-description">登録されている社内利用者だけが使用できます。</p>

        <form className="login-form" onSubmit={submit}>
          <label className="field-label">
            メールアドレス
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="field-label">
            パスワード
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" className="primary-button login-button" disabled={submitting}>
            {submitting ? <LoaderCircle className="spin" size={19} /> : <KeyRound size={19} />}
            {submitting ? "確認中" : "ログイン"}
          </button>
        </form>

        {testLoginEnabled ? (
          <div className="test-login-area">
            <div className="login-divider"><span>または</span></div>
            <button type="button" className="test-login-button" onClick={testSignIn}>
              <FlaskConical size={19} />
              テストログイン
            </button>
            <p>メール・パスワード不要／架空データのみ使用します。</p>
          </div>
        ) : null}

        <div className="login-security-note">
          <ShieldCheck size={18} />
          <span>30分操作がない場合は自動でログアウトします。</span>
        </div>
      </section>
    </main>
  );
}
