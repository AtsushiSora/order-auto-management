import { useEffect, useRef, useState } from "react";
import { CloudUpload, Database, Download, ExternalLink, HardDrive, KeyRound, MailPlus, Plus, RotateCcw, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { Drawer } from "../components/Drawer";
import { PageHeader } from "../components/PageHeader";
import { StaffDetailsForm } from "../components/StaffDetailsForm";
import { formatDateTime } from "../lib/format";
import { requestGoogleDriveAccessToken } from "../lib/googleDrive";
import { formatEmployeeNumber, staffEmploymentLabels } from "../lib/staffDetails";
import { staffRoleLabels, validateStaffInvitationInput } from "../lib/staffProfiles";
import { useAuth } from "../state/AuthContext";
import { useAppData } from "../state/AppDataContext";
import type { BackupRestoreMode, StaffEmploymentStatus, StaffProfile, StaffRole } from "../types";

const staffRoles = Object.keys(staffRoleLabels) as StaffRole[];
const inviteRoles = ["accounting", "regular", "spot"] as const;

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const attachmentBackupLabel = (backup: { attachmentBackupStatus: string; attachmentFileCount: number; attachmentTotalBytes: number }) => {
  if (backup.attachmentBackupStatus === "complete") {
    return `添付${backup.attachmentFileCount}件（${formatFileSize(backup.attachmentTotalBytes)}）も保全済み`;
  }
  if (backup.attachmentBackupStatus === "none") return "添付ファイルなし";
  if (backup.attachmentBackupStatus === "partial") return `添付${backup.attachmentFileCount}件のみ保全・要確認`;
  if (backup.attachmentBackupStatus === "failed") return "添付ファイルの保全に失敗・要確認";
  return "旧方式：添付ファイル本体は未保全";
};

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
  const { updateStaffProfile, saveStaffProfileDetails, getStaffLicenseUrl, deleteStaffProfile } = useAppData();
  const [displayName, setDisplayName] = useState(staff.displayName);
  const [role, setRole] = useState<StaffRole>(staff.role);
  const [employmentStatus, setEmploymentStatus] = useState<StaffEmploymentStatus>(staff.employmentStatus ?? (staff.isActive ? "active" : "paused"));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isCurrentUser = staff.id === currentUserId;
  const isActive = employmentStatus === "active";
  const changed = displayName.trim() !== staff.displayName
    || role !== staff.role
    || employmentStatus !== (staff.employmentStatus ?? (staff.isActive ? "active" : "paused"));

  useEffect(() => {
    setDisplayName(staff.displayName);
    setRole(staff.role);
    setEmploymentStatus(staff.employmentStatus ?? (staff.isActive ? "active" : "paused"));
  }, [staff.displayName, staff.employmentStatus, staff.isActive, staff.role]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await updateStaffProfile({ staffId: staff.id, displayName, role, isActive, employmentStatus });
      setMessage("変更を保存しました。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "変更を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`${staff.displayName}（社員番号 ${formatEmployeeNumber(staff.employeeNumber)}）を完全に削除しますか？\n\n契約・経費・精算などの履歴がある場合は削除されません。`)) return;
    if (window.prompt("最終確認です。削除する場合は「削除」と入力してください。") !== "削除") return;
    setDeleting(true);
    setMessage(null);
    setError(null);
    try {
      await deleteStaffProfile(staff.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "スタッフを削除できませんでした。");
      setDeleting(false);
    }
  };

  return (
    <article className={`staff-profile-card ${isActive ? "active" : "inactive"}`}>
      <div className="staff-profile-heading">
        <div>
          <strong><span className="staff-number">#{formatEmployeeNumber(staff.employeeNumber)}</span>{staff.displayName}</strong>
          <span>{staffRoleLabels[staff.role]}{isCurrentUser ? "・ログイン中" : ""}</span>
        </div>
        <span className={`staff-status ${isActive ? "active" : "inactive"}`}>{staffEmploymentLabels[employmentStatus]}</span>
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
        <label className="field-label">在籍情報
          <select value={employmentStatus} disabled={isCurrentUser} onChange={(event) => setEmploymentStatus(event.target.value as StaffEmploymentStatus)}>
            <option value="active">在籍</option>
            <option value="paused">休止</option>
            <option value="retired">退職</option>
          </select>
        </label>
      </div>

      {!isActive ? <p className="staff-stop-note">休止・退職中は管理システムへログインできません。「在籍」へ戻すと利用を再開できます。</p> : null}
      {isCurrentUser ? <p className="staff-self-note">安全のため、ログイン中の事業主自身の権限と利用状態は変更できません。</p> : null}
      <dl className="staff-summary-details">
        <div><dt>氏名</dt><dd>{staff.lastName || staff.firstName ? `${staff.lastName ?? ""} ${staff.firstName ?? ""}` : "未登録"}</dd></div>
        <div><dt>電話番号</dt><dd>{staff.phone || "未登録"}</dd></div>
        <div><dt>免許証</dt><dd>{staff.licenseFrontPath && staff.licenseBackPath ? "表・裏 登録済み" : "未登録"}</dd></div>
      </dl>
      {error ? <p className="inline-error">{error}</p> : null}
      {message ? <p className="inline-success">{message}</p> : null}
      <div className="staff-profile-actions">
        {staff.employmentStatus === "retired" && !isCurrentUser && staff.role !== "owner" ? <button type="button" className="danger-button" disabled={deleting} onClick={() => void remove()}><Trash2 size={17} />{deleting ? "削除中…" : "完全削除"}</button> : null}
        <button type="button" className="secondary-button" onClick={() => setDetailsOpen(true)}>スタッフ情報</button>
        <button type="button" className="primary-button" disabled={!changed || saving} onClick={() => void save()}>
          {saving ? "保存中…" : "変更を保存"}
        </button>
      </div>
      {detailsOpen ? <Drawer title="スタッフ情報" subtitle={`社員番号 ${formatEmployeeNumber(staff.employeeNumber)}・${staff.displayName}`} onClose={() => setDetailsOpen(false)}>
        <StaffDetailsForm staff={staff} submitting={detailsSaving} onCancel={() => setDetailsOpen(false)} onSubmit={async (input, front, back) => {
          setDetailsSaving(true);
          try {
            await saveStaffProfileDetails(input, front, back);
            setDetailsOpen(false);
          } finally {
            setDetailsSaving(false);
          }
        }} />
        {staff.licenseFrontPath || staff.licenseBackPath ? <div className="staff-license-links">
          <strong>登録済み免許証を確認</strong>
          {(["front", "back"] as const).map((side) => (side === "front" ? staff.licenseFrontPath : staff.licenseBackPath) ? <button key={side} type="button" className="text-button" onClick={() => void getStaffLicenseUrl(staff.id, side).then((url) => window.open(url, "_blank", "noopener,noreferrer")).catch((reason) => setError(reason instanceof Error ? reason.message : "画像を開けませんでした。"))}>{side === "front" ? "表面を開く" : "裏面を開く"}</button> : null)}
        </div> : null}
      </Drawer> : null}
    </article>
  );
}

function BackupPanel({ isDemo }: { isDemo: boolean }) {
  const { data, createSystemBackup, downloadSystemBackup, saveSystemBackupToDrive, restoreSystemBackup, deleteSystemBackup } = useAppData();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [restoreMode, setRestoreMode] = useState<BackupRestoreMode>("追加");
  const googleAccessToken = useRef("");
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
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

  const saveToDrive = (backupId: string) => run(`drive-${backupId}`, async () => {
    try {
      const token = googleAccessToken.current || await requestGoogleDriveAccessToken(googleClientId);
      googleAccessToken.current = token;
      await saveSystemBackupToDrive(backupId, token);
      setMessage("Google Driveへ直接保存しました。「Drive保存済み」から保存先を開けます。");
    } catch (reason) {
      googleAccessToken.current = "";
      throw reason;
    }
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

      <p className="backup-scope-note">対象：車両・契約・経費・入出金・古物台帳・仕訳・月次残高・添付ファイル本体など。ログインアカウントと監査履歴は対象外です。</p>
      {isDemo ? <p className="form-warning">テストモードのバックアップは、この画面を開いている間だけ復元できます。</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}
      {message ? <p className="inline-success">{message}</p> : null}

      <div className="backup-list">
        {data.systemBackups.map((backup) => <article className="backup-row" key={backup.id}>
          <div><strong>{formatDateTime(backup.createdAt)}</strong><span>{backup.rowCount}件・手動バックアップ</span><span className={`backup-file-status ${backup.attachmentBackupStatus}`}>{attachmentBackupLabel(backup)}</span></div>
          <div className="backup-row-actions">
            <button type="button" className="table-action-button" disabled={Boolean(busy)} onClick={() => void download(backup.id, backup.createdAt)}><Download size={16} />JSON保存</button>
            <button type="button" className="table-action-button drive-action-button" disabled={Boolean(busy) || isDemo || !googleClientId || !["none", "complete"].includes(backup.attachmentBackupStatus)} onClick={() => void saveToDrive(backup.id)}><CloudUpload size={16} />{busy === `drive-${backup.id}` ? "保存中…" : backup.driveSavedAt ? "Drive再保存" : "Drive保存"}</button>
            <button type="button" className="table-action-button" disabled={Boolean(busy)} onClick={() => { setRestoreId(backup.id); setRestoreMode("追加"); setMessage(null); setError(null); }}><RotateCcw size={16} />復元</button>
            <button type="button" className="table-action-button danger-table-button" disabled={Boolean(busy)} onClick={() => remove(backup.id)}><Trash2 size={16} />削除</button>
          </div>
          {backup.driveSavedAt && backup.driveFolderUrl ? <a className="backup-drive-link" href={backup.driveFolderUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />Drive保存済み：{formatDateTime(backup.driveSavedAt)}</a> : null}
        </article>)}
        {!data.systemBackups.length ? <div className="empty-state compact"><HardDrive size={28} /><h2>バックアップはありません</h2><p>「今すぐ作成」から最初のバックアップを作成してください。</p></div> : null}
      </div>

      {restoreId ? <div className="backup-restore-box">
        <div><strong>復元方法を選択</strong><p>「追加」は現在のデータを残します。「全上書き」はバックアップ時点へ戻します。</p></div>
        <select aria-label="復元方法" value={restoreMode} onChange={(event) => setRestoreMode(event.target.value as BackupRestoreMode)}><option>追加</option><option>全上書き</option></select>
        <div className="backup-restore-actions"><button type="button" className="secondary-button" onClick={() => setRestoreId(null)}>キャンセル</button><button type="button" className={restoreMode === "全上書き" ? "danger-button" : "primary-button"} disabled={Boolean(busy)} onClick={restore}>この方法で復元</button></div>
      </div> : null}

      <div className="backup-drive-box">
        <div><strong>Google Driveへの直接保存</strong><p>{googleClientId ? "各バックアップの「Drive保存」を押すとGoogleの確認画面が開き、専用フォルダへ業務データと添付ファイルを保存します。Googleの許可情報はシステムに保存しません。" : "保存処理は実装済みです。Google Cloudのウェブ用OAuthクライアントIDを設定すると利用できます。"}</p></div>
        <span className={`setting-status ${googleClientId ? "planned" : "pending"}`}>{googleClientId ? "利用可能" : "Google設定待ち"}</span>
      </div>
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
