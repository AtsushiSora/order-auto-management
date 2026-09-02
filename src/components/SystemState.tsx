import { AlertTriangle, FlaskConical, LoaderCircle, LogOut, RotateCw, ShieldX } from "lucide-react";

export function SystemLoading({ message = "データを確認しています" }: { message?: string }) {
  return (
    <main className="system-state-page">
      <LoaderCircle className="spin" size={34} />
      <p>{message}</p>
    </main>
  );
}

export function AccessBlocked({ message, onLogout }: { message: string; onLogout: () => void }) {
  return (
    <main className="system-state-page">
      <section className="system-state-card">
        <ShieldX size={38} />
        <h1>この画面は利用できません</h1>
        <p>{message}</p>
        <button type="button" className="secondary-button" onClick={onLogout}><LogOut size={18} />ログアウト</button>
      </section>
    </main>
  );
}

export function DataLoadError({
  message,
  onRetry,
  onLogout,
  onUseTestMode,
}: {
  message: string;
  onRetry: () => void;
  onLogout: () => void;
  onUseTestMode?: () => void;
}) {
  return (
    <main className="system-state-page inset">
      <section className="system-state-card">
        <AlertTriangle size={38} />
        <h1>共有データを読み込めませんでした</h1>
        <p>{message}</p>
        <div className="system-state-actions">
          <button type="button" className="secondary-button" onClick={onRetry}><RotateCw size={17} />もう一度試す</button>
          {onUseTestMode ? <button type="button" className="primary-button" onClick={onUseTestMode}><FlaskConical size={17} />架空データで開く</button> : null}
          <button type="button" className="text-button" onClick={onLogout}><LogOut size={17} />ログイン画面へ戻る</button>
        </div>
      </section>
    </main>
  );
}
