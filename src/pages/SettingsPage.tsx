import { useEffect, useState } from "react";
import { Database, Download, HardDrive, KeyRound, MailPlus, Plus, RotateCcw, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { formatDateTime } from "../lib/format";
import { staffRoleLabels, validateStaffInvitationInput } from "../lib/staffProfiles";
import { useAuth } from "../state/AuthContext";
import { useAppData } from "../state/AppDataContext";
import type { BackupRestoreMode, StaffProfile, StaffRole } from "../types";

const staffRoles = Object.keys(staffRoleLabels) as StaffRole[];
const inviteRoles = ["accounting", "regular", "spot"] as const;

function StaffInvitePanel({ isDemo }: { isDemo: boolean }) {
  const { inviteStaffProfile } = useAppData();
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<(typeof inviteRoles)[number]>("regular");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prepareReview = () => {
    setMessage(null);
    setError(null);
    try {
      const checked = validateStaffInvitationInput({ email, displayName, role });
      setEmail(checked.email);
      setDisplayName(checked.displayName);
      setReviewing(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "入力内容を確認してください。");
    }
  };

  const sendInvitation = async () => {
    setSending(true);
    setError(null);
    try {
      await inviteStaffProfile({ email, displayName, role });
      setMessage(isDemo ? "テスト利用者を追加しました。" : `${email}へ招待メールを送りました。`);
      setEmail("");
      setDisplayName("");
      setRole("regular");
      setReviewing(false);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "招待メールを送信できませんでした。");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="staff-invite-panel">
      <div className="staff-invite-heading">
        <div>
          <strong>新しい利用者</strong>
          <span>{isDemo ? "架空の利用者を追加して画面を確認できます。" : "招待された本人がメールから8文字以上のパスワードを設定します。"}</span>
        </div>
        {!open ? <button type="button" className="secondary-button" onClick={() => { setOpen(true); setMessage(null); }}><MailPlus size={17} />利用者を招待</button> : null}
      </div>

      {message ? <p className="inline-success">{message}</p> : null}
      {open && !reviewing ? <div className="staff-invite-form">
        <label className="field-label">メールアドレス <span className="required">必須</span>
          <input type="email" autoComplete="off" value={email} placeholder="staff@example.com" onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="field-label">表示名 <span className="required">必須</span>
          <input value={displayName} maxLength={80} placeholder="例：妻・税務担当" onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <label className="field-label">最初の権限 <span className="required">必須</span>
          <select value={role} onChange={(event) => setRole(event.target.value as (typeof inviteRoles)[number])}>
            {inviteRoles.map((value) => <option key={value} value={value}>{staffRoleLabels[value]}</option>)}
          </select>
        </label>
        {error ? <p className="inline-error staff-invite-message">{error}</p> : null}
        <div className="staff-invite-actions">
          <button type="button" className="secondary-button" onClick={() => { setOpen(false); setError(null); }}>キャンセル</button>
          <button type="button" className="primary-button" onClick={prepareReview}>入力内容を確認</button>
        </div>
      </div> : null}

      {open && reviewing ? <div className="staff-invite-review">
        <strong>この内容で招待します</strong>
        <dl>
          <div><dt>メール</dt><dd>{email}</dd></div>
          <div><dt>表示名</dt><dd>{displayName}</dd></div>
          <div><dt>権限</dt><dd>{staffRoleLabels[role]}</dd></div>
        </dl>
        <p>{isDemo ? "テスト用の利用者として追加され、メールは送信されません。" : "確定すると招待メールが送信されます。送信先をもう一度確認してください。"}</p>
        {error ? <p className="inline-error staff-invite-message">{error}</p> : null}
        <div className="staff-invite-actions">
          <button type="button" className="secondary-button" disabled={sending} onClick={() => { setReviewing(false); setError(null); }}>入力へ戻る</button>
          <button type="button" className="primary-button" disabled={sending} onClick={() => void sendInvitation()}>{sending ? "送信中…" : isDemo ? "テスト利用者を追加" : "招待メールを送る"}</button>
        </div>
      </div> : null}
    </div>
  );
}

function StaffProfileEditor({ staff, currentUserId }: { staff: StaffProfile; currentUserId: string | undefined }) {
  const { updateStaffProfile } = useAppData();
  const [displayName, setDisplayName] = useState(staff.displayName);
  const [role, setRole] = useState<StaffRole>(staff.role);
  const [isActive, setIsActive] = useState(staff.isActive);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isCurrentUser = staff.id === currentUserId;
  const changed = displayName.trim() !== staff.displayName
    || role !== staff.role
    || isActive !== staff.isActive;

  useEffect(() => {
    setDisplayName(staff.displayName);
    setRole(staff.role);
    setIsActive(staff.isActive);
  }, [staff.displayName, staff.isActive, staff.role]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await updateStaffProfile({ staffId: staff.id, displayName, role, isActive });
      setMessage("変更を保存しました。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "変更を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className={`staff-profile-card ${isActive ? "active" : "inactive"}`}>
      <div className="staff-profile-heading">
        <div>
          <strong>{staff.displayName}</strong>
          <span>{staffRoleLabels[staff.role]}{isCurrentUser ? "・ログイン中" : ""}</span>
        </div>
        <span className={`staff-status ${isActive ? "active" : "inactive"}`}>{isActive ? "利用中" : "利用停止"}</span>
      </div>

      <div className="staff-profile-fields">
        <label className="field-label">表示名
          <input value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <label className="field-label">権限
          <select value={role} disabled={isCurrentUser} onChange={(event) => setRole(event.target.value as StaffRole)}>
            {staffRoles.map((value) => <option key={value} value={value}>{staffRoleLabels[value]}</option>)}
          </select>
        </label>
        <label className="field-label">利用状態
          <select value={isActive ? "active" : "inactive"} disabled={isCurrentUser} onChange={(event) => setIsActive(event.target.value === "active")}>
            <option value="active">利用中</option>
            <option value="inactive">利用停止</option>
          </select>
        </label>
      </div>

      {!isActive ? <p className="staff-stop-note">利用停止中は管理システムのデータへアクセスできません。利用中へ戻すと復活します。</p> : null}
      {isCurrentUser ? <p className="staff-self-note">安全のため、ログイン中の事業主自身の権限と利用状態は変更できません。</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}
      {message ? <p className="inline-success">{message}</p> : null}
      <div className="staff-profile-actions">
        <button type="button" className="primary-button" disabled={!changed || saving} onClick={() => void save()}>
          {saving ? "保存中…" : "変更を保存"}
        </button>
      </div>
    </article>
  );
}

function BackupPanel({ isDemo }: { isDemo: boolean }) {
  const { data, createSystemBackup, downloadSystemBackup, restoreSystemBackup, deleteSystemBackup } = useAppData();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [restoreMode, setRestoreMode] = useState<BackupRestoreMode>("追加");
  const latest = data.systemBackups[0];
  const due = !latest || Date.now() - new Date(latest.createdAt).getTime() >= 30 * 24 * 60 * 60 * 1000;

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    setMessage(null);
    setError(null);
    try {
      await task();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "バックアップ処理に失敗しました。");
    } finally {
      setBusy("");
    }
  };

  const create = () => run("create", async () => {
    const saved = await createSystemBackup();
    setMessage(`${formatDateTime(saved.createdAt)}のバックアップを作成しました。`);
  });

  const download = (backupId: string, createdAt: string) => run(`download-${backupId}`, async () => {
    const blob = await downloadSystemBackup(backupId);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `order-auto-backup_${createdAt.slice(0, 10)}_${backupId.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("バックアップファイルをダウンロードしました。Google Driveへ保存できます。");
  });

  const restore = () => {
    if (!restoreId) return;
    const warning = restoreMode === "全上書き"
      ? "現在の業務データをバックアップ時点の内容へ全上書きします。ログイン利用者と監査履歴は残ります。実行しますか？"
      : "現在のデータを残し、バックアップにしかないデータを追加します。実行しますか？";
    if (!window.confirm(warning)) return;
    void run(`restore-${restoreId}`, async () => {
      await restoreSystemBackup(restoreId, restoreMode);
      setRestoreId(null);
      setMessage(`${restoreMode}で復元しました。`);
    });
  };

  const remove = (backupId: string) => {
    if (!window.confirm("このバックアップ記録を削除しますか？削除後は元に戻せません。")) return;
    void run(`delete-${backupId}`, async () => {
      await deleteSystemBackup(backupId);
      setMessage("バックアップを削除しました。");
    });
  };

  return (
    <section className="panel backup-panel">
      <div className="section-heading backup-heading">
        <div><span className="section-kicker"><HardDrive size={16} />バックアップ</span><h2>業務データの保全</h2><p>30日ごとにTOPで作成を案内します。作成したデータは端末へダウンロードできます。</p></div>
        <button type="button" className="primary-button" disabled={Boolean(busy)} onClick={() => void create()}><Plus size={18} />今すぐ作成</button>
      </div>

      <div className={`backup-status-banner ${due ? "due" : "current"}`}>
        {due ? <><HardDrive size={22} /><span><strong>バックアップの作成が必要です</strong><small>{latest ? `最終作成：${formatDateTime(latest.createdAt)}` : "まだバックアップがありません"}</small></span></> : <><ShieldCheck size={22} /><span><strong>バックアップは正常です</strong><small>最終作成：{formatDateTime(latest.createdAt)}</small></span></>}
      </div>

      <p className="backup-scope-note">対象：車両・契約・経費・入出金・古物台帳・仕訳・月次残高など。ログインアカウント、監査履歴、添付ファイル本体は対象外です。添付ファイルの登録情報は含まれます。</p>
      {isDemo ? <p className="form-warning">テストモードのバックアップは、この画面を開いている間だけ復元できます。</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}
      {message ? <p className="inline-success">{message}</p> : null}

      <div className="backup-list">
        {data.systemBackups.map((backup) => <article className="backup-row" key={backup.id}>
          <div><strong>{formatDateTime(backup.createdAt)}</strong><span>{backup.rowCount}件・手動バックアップ</span></div>
          <div className="backup-row-actions">
            <button type="button" className="table-action-button" disabled={Boolean(busy)} onClick={() => void download(backup.id, backup.createdAt)}><Download size={16} />保存</button>
            <button type="button" className="table-action-button" disabled={Boolean(busy)} onClick={() => { setRestoreId(backup.id); setRestoreMode("追加"); setMessage(null); setError(null); }}><RotateCcw size={16} />復元</button>
            <button type="button" className="table-action-button danger-table-button" disabled={Boolean(busy)} onClick={() => remove(backup.id)}><Trash2 size={16} />削除</button>
          </div>
        </article>)}
        {!data.systemBackups.length ? <div className="empty-state compact"><HardDrive size={28} /><h2>バックアップはありません</h2><p>「今すぐ作成」から最初のバックアップを作成してください。</p></div> : null}
      </div>

      {restoreId ? <div className="backup-restore-box">
        <div><strong>復元方法を選択</strong><p>「追加」は現在のデータを残します。「全上書き」はバックアップ時点へ戻します。</p></div>
        <select aria-label="復元方法" value={restoreMode} onChange={(event) => setRestoreMode(event.target.value as BackupRestoreMode)}><option>追加</option><option>全上書き</option></select>
        <div className="backup-restore-actions"><button type="button" className="secondary-button" onClick={() => setRestoreId(null)}>キャンセル</button><button type="button" className={restoreMode === "全上書き" ? "danger-button" : "primary-button"} disabled={Boolean(busy)} onClick={restore}>この方法で復元</button></div>
      </div> : null}
    </section>
  );
}

export function SettingsPage() {
  const { profile } = useAuth();
  const { data, isDemo, resetDemoData } = useAppData();
  const activeCount = data.staffProfiles.filter((staff) => staff.isActive).length;

  return (
    <>
      <PageHeader title="設定" description="利用者の権限・利用状態と、システムの接続状況を管理します。" />

      <section className="panel staff-management-panel">
        <div className="section-heading staff-management-heading">
          <div>
            <span className="section-kicker"><UserCog size={16} />利用者管理</span>
            <h2>社内利用者</h2>
            <p>事業主だけが権限変更、利用停止、復活を行えます。現在の利用中は{activeCount}人です。</p>
          </div>
        </div>
        <StaffInvitePanel isDemo={isDemo} />
        <div className="staff-profile-list">
          {data.staffProfiles.map((staff) => (
            <StaffProfileEditor key={staff.id} staff={staff} currentUserId={profile?.id} />
          ))}
        </div>
        <p className="staff-invite-note">事業主権限は招待時に付けません。必要な場合は、招待後に登録済み利用者の権限から変更します。</p>
      </section>

      <section className="settings-grid">
        <article className="setting-card panel">
          <span className="setting-icon"><Database size={25} /></span>
          <div><h2>データ保存</h2><p>{isDemo ? "現在はこの端末のブラウザ内に架空データを保存しています。" : "新しい共通Supabaseへ暗号化通信で保存します。"}</p><span className={`setting-status ${isDemo ? "pending" : "planned"}`}>{isDemo ? "Supabase接続前" : "Supabase接続済み"}</span></div>
        </article>
        <article className="setting-card panel">
          <span className="setting-icon"><KeyRound size={25} /></span>
          <div><h2>共通ログイン</h2><p>事業主・経理担当・通常スタッフ・スポットスタッフを1つの認証で管理します。</p><span className={`setting-status ${isDemo ? "pending" : "planned"}`}>{isDemo ? "接続前" : "認証中"}</span></div>
        </article>
        <article className="setting-card panel">
          <span className="setting-icon"><ShieldCheck size={25} /></span>
          <div><h2>アクセス制御</h2><p>画面とデータベースの両方で利用者権限を確認します。</p><span className="setting-status planned">実装済み</span></div>
        </article>
      </section>

      <BackupPanel isDemo={isDemo} />

      {isDemo ? <section className="panel danger-zone">
        <div><h2>初期デモデータ</h2><p>この端末で追加・変更した架空データを、最初の状態へ戻します。</p></div>
        <button type="button" className="secondary-button" onClick={() => {
          if (window.confirm("初期デモデータへ戻しますか？この端末で追加した内容は消えます。")) resetDemoData();
        }}><RotateCcw size={18} />デモデータを戻す</button>
      </section> : null}
    </>
  );
}
