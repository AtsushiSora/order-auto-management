import { useState, type FormEvent } from "react";
import { CarFront, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { validateNewPassword } from "../lib/authFlow";
import { useAuth } from "../state/AuthContext";

export function PasswordSetupPage() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationError = validateNewPassword(password, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      await updatePassword(password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "パスワードを設定できませんでした。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand-mark"><CarFront size={33} /></div>
        <p className="login-eyebrow">ORDER AUTO</p>
        <h1>パスワード設定</h1>
        <p className="login-description">この管理システム専用のパスワードを設定してください。</p>

        <form className="login-form" onSubmit={submit}>
          <label className="field-label">
            新しいパスワード
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="field-label">
            新しいパスワード（確認）
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </label>
          <p className="password-hint">8文字以上で設定してください。</p>
          {error ? <p className="form-error">{error}</p> : null}
          <button type="submit" className="primary-button login-button" disabled={submitting}>
            {submitting ? <LoaderCircle className="spin" size={19} /> : <KeyRound size={19} />}
            {submitting ? "設定中" : "パスワードを設定"}
          </button>
        </form>

        <div className="login-security-note">
          <ShieldCheck size={18} />
          <span>パスワードはほかの利用者や管理者にも表示されません。</span>
        </div>
      </section>
    </main>
  );
}
