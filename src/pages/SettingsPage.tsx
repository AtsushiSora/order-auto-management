import { useEffect, useState } from "react";
import { Database, HardDrive, KeyRound, MailPlus, RotateCcw, ShieldCheck, UserCog } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { staffRoleLabels, validateStaffInvitationInput } from "../lib/staffProfiles";
import { useAuth } from "../state/AuthContext";
import { useAppData } from "../state/AppDataContext";
import type { StaffProfile, StaffRole } from "../types";

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
          <span className="setting-icon"><HardDrive size={25} /></span>
          <div><h2>バックアップ</h2><p>SupabaseとGoogle WorkspaceのGoogle Driveへ保存する予定です。</p><span className="setting-status pending">接続前</span></div>
        </article>
        <article className="setting-card panel">
          <span className="setting-icon"><ShieldCheck size={25} /></span>
          <div><h2>アクセス制御</h2><p>画面とデータベースの両方で利用者権限を確認します。</p><span className="setting-status planned">実装済み</span></div>
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
