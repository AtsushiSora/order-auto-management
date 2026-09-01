import { Database, HardDrive, KeyRound, RotateCcw, ShieldCheck } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { useAppData } from "../state/AppDataContext";

export function SettingsPage() {
  const { isDemo, resetDemoData } = useAppData();

  return (
    <>
      <PageHeader title="設定" description="初期デモ版の環境と、今後接続するサービスを確認します。" />
      <section className="settings-grid">
        <article className="setting-card panel">
          <span className="setting-icon"><Database size={25} /></span>
          <div><h2>データ保存</h2><p>{isDemo ? "現在はこの端末のブラウザ内に架空データを保存しています。" : "新しい共通Supabaseへ暗号化通信で保存します。"}</p><span className={`setting-status ${isDemo ? "pending" : "planned"}`}>{isDemo ? "Supabase接続前" : "Supabase接続済み"}</span></div>
        </article>
        <article className="setting-card panel">
          <span className="setting-icon"><KeyRound size={25} /></span>
          <div><h2>共通ログイン</h2><p>事業主・奥様・通常スタッフを1つの認証へ統合します。</p><span className={`setting-status ${isDemo ? "pending" : "planned"}`}>{isDemo ? "接続前" : "認証中"}</span></div>
        </article>
        <article className="setting-card panel">
          <span className="setting-icon"><HardDrive size={25} /></span>
          <div><h2>バックアップ</h2><p>SupabaseとGoogle WorkspaceのGoogle Driveへ保存する予定です。</p><span className="setting-status pending">接続前</span></div>
        </article>
        <article className="setting-card panel">
          <span className="setting-icon"><ShieldCheck size={25} /></span>
          <div><h2>アクセス制御</h2><p>画面とデータベースの両方で利用者権限を確認します。</p><span className="setting-status planned">計画済み</span></div>
        </article>
      </section>

      {isDemo ? <section className="panel danger-zone">
        <div><h2>初期デモデータ</h2><p>この端末で追加・変更した架空データを、最初の状態へ戻します。</p></div>
        <button type="button" className="secondary-button" onClick={() => {
          if (window.confirm("初期デモデータへ戻しますか？この端末で追加した内容は消えます。")) resetDemoData();
        }}><RotateCcw size={18} />デモデータを戻す</button>
      </section> : null}
    </>
  );
}
