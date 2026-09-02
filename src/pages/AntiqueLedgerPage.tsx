import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock3,
  Printer,
  Save,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Drawer } from "../components/Drawer";
import { PageHeader } from "../components/PageHeader";
import { buildAntiqueLedgerEntries, describeVehicleFeatures } from "../lib/antiqueLedger";
import { formatCurrency, formatDate } from "../lib/format";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
import type {
  AntiqueLedgerEntry,
  AntiqueLedgerStatus,
  IdentityVerificationMethod,
  LedgerCounterpartyType,
  LedgerDispositionType,
  LedgerIntakeType,
  SaveAntiqueLedgerDetailInput,
} from "../types";

const identityMethods: IdentityVerificationMethod[] = [
  "運転免許証",
  "マイナンバーカード",
  "在留カード",
  "印鑑証明書等",
  "古物商許可証",
  "オークション会場の取引記録",
  "その他",
];
const counterpartyTypes: LedgerCounterpartyType[] = ["個人", "法人・業者", "オークション"];
const dispositionTypes: LedgerDispositionType[] = ["売却", "委託引渡し", "返還", "廃車"];

const statusTone: Record<AntiqueLedgerStatus, string> = {
  入庫待ち: "blue",
  要確認: "amber",
  記録済み: "green",
};

const toForm = (entry: AntiqueLedgerEntry): SaveAntiqueLedgerDetailInput => ({
  vehicleId: entry.vehicleId,
  intakeType: entry.detail.intakeType,
  receivedOnOverride: entry.detail.receivedOnOverride,
  registrationNumber: entry.detail.registrationNumber,
  registeredOwnerName: entry.detail.registeredOwnerName,
  itemFeatures: entry.detail.itemFeatures,
  counterpartyType: entry.detail.counterpartyType,
  sellerNameOverride: entry.detail.sellerNameOverride,
  sellerAddress: entry.detail.sellerAddress,
  sellerOccupation: entry.detail.sellerOccupation,
  sellerAge: entry.detail.sellerAge,
  identityVerificationMethod: entry.detail.identityVerificationMethod,
  identityVerificationNote: entry.detail.identityVerificationNote,
  disposalOnOverride: entry.detail.disposalOnOverride,
  disposalTypeOverride: entry.detail.disposalTypeOverride,
  buyerNameOverride: entry.detail.buyerNameOverride,
  note: entry.detail.note,
});

export function AntiqueLedgerPage() {
  const { data, saveAntiqueLedgerDetail } = useAppData();
  const { profile } = useAuth();
  const canEdit = profile?.role === "owner" || profile?.role === "regular";
  const entries = useMemo(() => buildAntiqueLedgerEntries(data), [data]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"すべて" | AntiqueLedgerStatus>("すべて");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [form, setForm] = useState<SaveAntiqueLedgerDetailInput | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedEntry = entries.find((entry) => entry.vehicleId === selectedVehicleId) ?? null;
  const filtered = entries.filter((entry) => {
    const keyword = search.trim().toLowerCase();
    const matchesSearch = !keyword || [
      entry.managementNumber,
      entry.itemName,
      entry.chassisNumber,
      entry.sellerName,
      entry.buyerName,
    ].some((value) => value.toLowerCase().includes(keyword));
    return matchesSearch && (statusFilter === "すべて" || entry.status === statusFilter);
  });
  const counts = entries.reduce(
    (result, entry) => ({ ...result, [entry.status]: result[entry.status] + 1 }),
    { 入庫待ち: 0, 要確認: 0, 記録済み: 0 } as Record<AntiqueLedgerStatus, number>,
  );

  const openEntry = (entry: AntiqueLedgerEntry) => {
    setSelectedVehicleId(entry.vehicleId);
    setForm(toForm(entry));
    setError("");
  };

  const closeEntry = () => {
    setSelectedVehicleId(null);
    setForm(null);
    setError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    setSubmitting(true);
    setError("");
    try {
      await saveAntiqueLedgerDetail(form);
      closeEntry();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "古物台帳を保存できませんでした。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="古物台帳"
        description="買取・入庫・販売・納車の情報を自動連携し、不足する法定項目だけ補います。"
        action={(
          <button type="button" className="secondary-button" onClick={() => window.print()}>
            <Printer size={18} />
            印刷
          </button>
        )}
      />

      <section className="integration-note panel ledger-legal-note">
        <ShieldCheck size={24} />
        <div>
          <strong>1台につき1件を自動表示します</strong>
          <p>0円買取も含め、入庫日を受入年月日、納車日を払出年月日として連携します。訂正が必要な場合だけ台帳側の日付を指定できます。</p>
        </div>
      </section>

      <section className="mini-summary-grid ledger-summary-grid">
        <button type="button" className="mini-summary-card blue" onClick={() => setStatusFilter("入庫待ち")}>
          <Clock3 size={22} /><small>入庫待ち</small><strong>{counts.入庫待ち}件</strong>
        </button>
        <button type="button" className="mini-summary-card amber" onClick={() => setStatusFilter("要確認")}>
          <AlertTriangle size={22} /><small>要確認</small><strong>{counts.要確認}件</strong>
        </button>
        <button type="button" className="mini-summary-card teal" onClick={() => setStatusFilter("記録済み")}>
          <CheckCircle2 size={22} /><small>記録済み</small><strong>{counts.記録済み}件</strong>
        </button>
      </section>

      <div className="filter-bar panel ledger-filter-bar">
        <label className="search-field">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="管理番号・車名・車台番号・取引先で検索" />
        </label>
        <div className="segmented-control" aria-label="台帳状態">
          {(["すべて", "入庫待ち", "要確認", "記録済み"] as const).map((status) => (
            <button key={status} type="button" className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)}>{status}</button>
          ))}
        </div>
        <div className="result-count">{filtered.length}件</div>
      </div>

      <section className="panel table-panel ledger-table-panel">
        <div className="table-scroll">
          <table className="data-table ledger-table">
            <thead>
              <tr>
                <th>受入年月日</th>
                <th>車両</th>
                <th>受入区分・相手方</th>
                <th className="number-cell">受入金額</th>
                <th>払出し</th>
                <th>状態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.vehicleId}>
                  <td>{formatDate(entry.receivedOn)}</td>
                  <td>
                    <strong>{entry.managementNumber}　{entry.itemName}</strong>
                    <span className="cell-note">車台番号：{entry.chassisNumber || "未登録"}</span>
                    <span className="ledger-print-detail">登録番号・車両番号：{entry.detail.registrationNumber || "未登録"}</span>
                    <span className="ledger-print-detail">車検証上の所有者：{entry.detail.registeredOwnerName || "未登録"}</span>
                    <span className="ledger-print-detail">その他の特徴：{entry.detail.itemFeatures || "なし"}</span>
                  </td>
                  <td>
                    <strong>{entry.detail.intakeType}・{entry.acquisitionSource}</strong>
                    <span className="cell-note">{entry.sellerName || "相手方未登録"}</span>
                    <span className="ledger-print-detail">相手方区分：{entry.detail.counterpartyType}</span>
                    <span className="ledger-print-detail">住所：{entry.detail.sellerAddress || "未登録"}</span>
                    <span className="ledger-print-detail">職業・業種：{entry.detail.sellerOccupation || "未登録"}</span>
                    <span className="ledger-print-detail">年齢：{entry.detail.counterpartyType === "個人" ? entry.detail.sellerAge ?? "未登録" : "対象外"}</span>
                    <span className="ledger-print-detail">本人確認方法：{entry.detail.identityVerificationMethod || "未登録"}</span>
                    <span className="ledger-print-detail">確認方法の詳細：{entry.detail.identityVerificationNote || "なし"}</span>
                  </td>
                  <td className="number-cell">{formatCurrency(entry.purchaseAmount)}</td>
                  <td>
                    <strong>{entry.dispositionType}</strong>
                    <span className="cell-note">{formatDate(entry.disposedOn)}{entry.buyerName ? `　${entry.buyerName}` : ""}</span>
                    <span className="ledger-print-detail">備考：{entry.detail.note || "なし"}</span>
                  </td>
                  <td>
                    <span className={`status-badge ${statusTone[entry.status]}`}>{entry.status}</span>
                    {entry.missingItems.length > 0 ? <span className="cell-note">不足 {entry.missingItems.length}項目</span> : null}
                  </td>
                  <td><button type="button" className="small-action-button" onClick={() => openEntry(entry)}>{canEdit ? "確認・編集" : "確認"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="empty-state panel"><BookOpen size={34} /><h2>該当する台帳記録はありません</h2><p>表示条件を変更してください。</p></div>
      ) : null}

      {selectedEntry && form ? (
        <Drawer title={`${selectedEntry.managementNumber} 古物台帳`} subtitle="既存の車両・契約情報と一体で保存します。" onClose={closeEntry}>
          <form className="form-stack" onSubmit={submit}>
            <div className="form-section ledger-linked-section">
              <h3>自動連携された取引</h3>
              <dl className="ledger-linked-grid">
                <div><dt>受入年月日</dt><dd>{formatDate(selectedEntry.receivedOn)}</dd></div>
                <div><dt>品目・数量</dt><dd>{selectedEntry.itemName}・1台</dd></div>
                <div><dt>受入相手方</dt><dd>{selectedEntry.sellerName || "未登録"}</dd></div>
                <div><dt>受入金額</dt><dd>{formatCurrency(selectedEntry.purchaseAmount)}</dd></div>
                <div className="wide"><dt>車両の特徴</dt><dd>{describeVehicleFeatures(selectedEntry)}</dd></div>
              </dl>
              <p className="form-hint">車名・車台番号・金額は在庫、相手方名は買取契約から自動取得します。</p>
            </div>

            {selectedEntry.missingItems.length > 0 ? (
              <div className="ledger-missing-box">
                <strong><AlertTriangle size={17} />現在の不足項目</strong>
                <p>{selectedEntry.missingItems.join("、")}</p>
              </div>
            ) : (
              <div className="ledger-complete-box"><CheckCircle2 size={18} /><strong>法定項目を記録済みです</strong></div>
            )}

            <div className="form-section">
              <h3>受入れ・車検証情報</h3>
              <div className="form-row">
                <label className="field-label">受入区分<select value={form.intakeType} disabled={!canEdit} onChange={(event) => setForm({ ...form, intakeType: event.target.value as LedgerIntakeType })}><option>買受け</option><option>委託</option></select></label>
                <label className="field-label">受入年月日の訂正<input type="date" value={form.receivedOnOverride ?? ""} disabled={!canEdit} onChange={(event) => setForm({ ...form, receivedOnOverride: event.target.value || null })} /></label>
              </div>
              <p className="form-hint">空欄なら在庫の実際の入庫日（{formatDate(data.vehicles.find((vehicle) => vehicle.id === selectedEntry.vehicleId)?.arrivedAt ?? null)}）を使用します。</p>
              <label className="field-label">登録番号・車両番号 <span className="required">必須</span><input value={form.registrationNumber} disabled={!canEdit} onChange={(event) => setForm({ ...form, registrationNumber: event.target.value })} placeholder="例：品川 300 あ 12-34／登録なし" /></label>
              <label className="field-label">車検証上の所有者氏名・名称 <span className="required">必須</span><input value={form.registeredOwnerName} disabled={!canEdit} onChange={(event) => setForm({ ...form, registeredOwnerName: event.target.value })} /></label>
              <label className="field-label">その他の特徴<textarea rows={3} value={form.itemFeatures} disabled={!canEdit} onChange={(event) => setForm({ ...form, itemFeatures: event.target.value })} placeholder="色、傷、装備など識別に役立つ特徴" /></label>
            </div>

            <div className="form-section">
              <h3>受入相手方・本人確認</h3>
              <label className="field-label">相手方区分<select value={form.counterpartyType} disabled={!canEdit} onChange={(event) => setForm({ ...form, counterpartyType: event.target.value as LedgerCounterpartyType, sellerAge: event.target.value === "個人" ? form.sellerAge : null })}>{counterpartyTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label className="field-label">氏名・名称の訂正<input value={form.sellerNameOverride} disabled={!canEdit} onChange={(event) => setForm({ ...form, sellerNameOverride: event.target.value })} placeholder={`空欄なら契約の「${selectedEntry.sellerName || "未登録"}」を使用`} /></label>
              <label className="field-label">住所 <span className="required">必須</span><input value={form.sellerAddress} disabled={!canEdit} onChange={(event) => setForm({ ...form, sellerAddress: event.target.value })} /></label>
              <div className="form-row">
                <label className="field-label">職業・業種 <span className="required">必須</span><input value={form.sellerOccupation} disabled={!canEdit} onChange={(event) => setForm({ ...form, sellerOccupation: event.target.value })} /></label>
                <label className="field-label">年齢 {form.counterpartyType === "個人" ? <span className="required">必須</span> : <span>（対象外）</span>}<input type="number" min="0" max="120" value={form.sellerAge ?? ""} disabled={!canEdit || form.counterpartyType !== "個人"} onChange={(event) => setForm({ ...form, sellerAge: event.target.value === "" ? null : Number(event.target.value) })} /></label>
              </div>
              <label className="field-label">本人確認方法 <span className="required">必須</span><select value={form.identityVerificationMethod ?? ""} disabled={!canEdit} onChange={(event) => setForm({ ...form, identityVerificationMethod: event.target.value ? event.target.value as IdentityVerificationMethod : null })}><option value="">選択してください</option>{identityMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
              <label className="field-label">確認方法の詳細<textarea rows={3} value={form.identityVerificationNote} disabled={!canEdit} onChange={(event) => setForm({ ...form, identityVerificationNote: event.target.value })} placeholder="対面で原本確認、会場の取引番号など。証明書番号そのものは必要な範囲だけ記録してください。" /></label>
            </div>

            <div className="form-section">
              <h3>払出し・備考</h3>
              <div className="form-row">
                <label className="field-label">払出区分の訂正<select value={form.disposalTypeOverride ?? ""} disabled={!canEdit} onChange={(event) => setForm({ ...form, disposalTypeOverride: event.target.value ? event.target.value as LedgerDispositionType : null })}><option value="">車両状態から自動</option>{dispositionTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                <label className="field-label">払出年月日の訂正<input type="date" value={form.disposalOnOverride ?? ""} disabled={!canEdit} onChange={(event) => setForm({ ...form, disposalOnOverride: event.target.value || null })} /></label>
              </div>
              <label className="field-label">払出相手方名の訂正（任意）<input value={form.buyerNameOverride} disabled={!canEdit} onChange={(event) => setForm({ ...form, buyerNameOverride: event.target.value })} placeholder={`空欄なら販売契約の「${selectedEntry.buyerName || "未登録"}」を使用`} /></label>
              <p className="form-hint">自動車の払出しでは、相手方の住所・氏名・職業・年齢の記載を省略できるため、社内参照用の氏名だけ表示します。</p>
              <label className="field-label">備考<textarea rows={4} value={form.note} disabled={!canEdit} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
            </div>

            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={closeEntry}>{canEdit ? "キャンセル" : "閉じる"}</button>
              {canEdit ? <button type="submit" className="primary-button" disabled={submitting}><Save size={17} />{submitting ? "保存中" : "台帳情報を保存"}</button> : null}
            </div>
          </form>
        </Drawer>
      ) : null}
    </>
  );
}
