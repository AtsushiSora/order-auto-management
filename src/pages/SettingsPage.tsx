import { useEffect, useState } from "react";
import { Database, HardDrive, KeyRound, RotateCcw, ShieldCheck, UserCog } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { staffRoleLabels } from "../lib/staffProfiles";
import { useAuth } from "../state/AuthContext";
import { useAppData } from "../state/AppDataContext";
import type { StaffProfile, StaffRole } from "../types";

const staffRoles = Object.keys(staffRoleLabels) as StaffRole[];

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
        <div className="staff-profile-list">
          {data.staffProfiles.map((staff) => (
            <StaffProfileEditor key={staff.id} staff={staff} currentUserId={profile?.id} />
          ))}
        </div>
        <p className="staff-invite-note">新しい利用者の招待と最初の登録は、現在はSupabaseの管理画面で行います。ここでは登録後の権限と利用状態を変更できます。</p>
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
