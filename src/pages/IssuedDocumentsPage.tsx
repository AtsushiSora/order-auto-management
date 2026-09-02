import { Ban, Eye, FileOutput, Plus, Printer } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Drawer } from "../components/Drawer";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { canIssueDocument, writeIssuedDocumentWindow } from "../lib/issuedDocuments";
import { formatCurrency, formatDate } from "../lib/format";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
import type { IssueDocumentInput, IssuedDocument, IssuedDocumentType } from "../types";

const initialForm = (): IssueDocumentInput => ({
  contractId: "",
  documentType: "S",
  issuedOn: new Date().toISOString().slice(0, 10),
  deliveryMethod: "電子・PDF",
  showTaxBreakdown: false,
  stampDutyAmount: 0,
  note: "",
});

export function IssuedDocumentsPage() {
  const { data, issueDocument, voidIssuedDocument } = useAppData();
  const { profile } = useAuth();
  const canIssue = profile?.role === "owner" || profile?.role === "regular" || profile?.role === "accounting";
  const isOwner = profile?.role === "owner";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<IssueDocumentInput>(initialForm);
  const [filter, setFilter] = useState<"すべて" | IssuedDocumentType>("すべて");
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const eligibleContracts = useMemo(() => data.contracts.filter((contract) =>
    canIssueDocument(data, contract, form.documentType),
  ), [data, form.documentType]);
  const selectedContract = data.contracts.find((contract) => contract.id === form.contractId) ?? null;
  const selectedVehicle = data.vehicles.find((vehicle) => vehicle.id === selectedContract?.vehicleId) ?? null;
  const filteredDocuments = data.issuedDocuments.filter((document) => filter === "すべて" || document.documentType === filter);

  const openNew = () => {
    const next = initialForm();
    const firstContract = data.contracts.find((contract) => canIssueDocument(data, contract, "S"));
    next.contractId = firstContract?.id ?? "";
    setForm(next);
    setError("");
    setDrawerOpen(true);
  };

  const changeType = (documentType: IssuedDocumentType) => {
    const firstContract = data.contracts.find((contract) => canIssueDocument(data, contract, documentType));
    setForm({
      ...form,
      documentType,
      contractId: firstContract?.id ?? "",
      stampDutyAmount: 0,
    });
    setError("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const printWindow = window.open("about:blank", "_blank");
    setSubmitting(true);
    setError("");
    try {
      const saved = await issueDocument(form);
      if (printWindow) writeIssuedDocumentWindow(printWindow, saved);
      setDrawerOpen(false);
      if (!printWindow) setListError(`${saved.documentNumber}を発行しました。ポップアップが開かなかったため、一覧の「表示・PDF」から開いてください。`);
    } catch (reason) {
      printWindow?.close();
      setError(reason instanceof Error ? reason.message : "S・Rを発行できませんでした。");
    } finally {
      setSubmitting(false);
    }
  };

  const showDocument = (document: IssuedDocument) => {
    const printWindow = window.open("about:blank", "_blank");
    if (!printWindow) {
      setListError("ポップアップがブロックされました。このサイトのポップアップを許可してください。");
      return;
    }
    setListError("");
    writeIssuedDocumentWindow(printWindow, document);
  };

  const voidDocument = async (document: IssuedDocument) => {
    if (!window.confirm(`${document.documentNumber}を無効にしますか？履歴は削除せず残ります。`)) return;
    setListError("");
    try {
      await voidIssuedDocument(document.id);
    } catch (reason) {
      setListError(reason instanceof Error ? reason.message : "発行履歴を無効にできませんでした。");
    }
  };

  const activeS = data.issuedDocuments.filter((document) => document.documentType === "S" && document.status === "有効").length;
  const activeR = data.issuedDocuments.filter((document) => document.documentType === "R" && document.status === "有効").length;

  return (
    <>
      <PageHeader
        title="S・R発行"
        description="販売契約からS（請求）を、入金完了後にR（領収）を発行し、番号と内容を履歴に残します。"
        action={canIssue ? <button type="button" className="primary-button" onClick={openNew}><Plus size={20} />S・Rを発行</button> : undefined}
      />

      <section className="mini-summary-grid">
        <div className="mini-summary-card"><small>有効なS</small><strong>{activeS}件</strong></div>
        <div className="mini-summary-card green"><small>有効なR</small><strong>{activeR}件</strong></div>
        <div className="mini-summary-card amber"><small>無効履歴</small><strong>{data.issuedDocuments.filter((document) => document.status === "無効").length}件</strong></div>
      </section>

      <div className="filter-bar panel">
        <div className="segmented-control" aria-label="帳票区分">
          {(["すべて", "S", "R"] as const).map((item) => <button key={item} type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}
        </div>
        <div className="result-count">{filteredDocuments.length}件</div>
      </div>

      {listError ? <p className="form-error list-error">{listError}</p> : null}

      <section className="panel table-panel">
        <div className="table-scroll">
          <table className="data-table issued-document-table">
            <thead><tr><th>発行日</th><th>番号</th><th>宛名・対象</th><th>方法</th><th>状態</th><th className="number-cell">金額</th><th>操作</th></tr></thead>
            <tbody>
              {filteredDocuments.map((document) => (
                <tr key={document.id}>
                  <td className="muted-cell">{formatDate(document.issuedOn)}</td>
                  <td><strong className={`document-number ${document.documentType.toLowerCase()}`}>{document.documentNumber}</strong></td>
                  <td><strong>{document.customerName}</strong><span className="cell-note">{document.vehicleLabel}</span></td>
                  <td>{document.deliveryMethod}</td>
                  <td><StatusBadge>{document.status}</StatusBadge></td>
                  <td className="number-cell"><strong>{formatCurrency(document.amount)}</strong></td>
                  <td className="issued-document-actions">
                    <button type="button" className="table-action-button" onClick={() => showDocument(document)}><Eye size={14} />表示・PDF</button>
                    {isOwner && document.status === "有効" ? <button type="button" className="table-action-button danger-table-button" onClick={() => void voidDocument(document)}><Ban size={14} />無効化</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filteredDocuments.length ? <div className="table-empty"><FileOutput size={28} /><p>発行履歴はまだありません。</p></div> : null}
      </section>

      {drawerOpen ? (
        <Drawer title="S・Rを発行" subtitle="発行すると番号と内容が固定され、履歴に残ります。" onClose={() => setDrawerOpen(false)}>
          <form className="form-stack" onSubmit={submit}>
            <section className="form-section">
              <h3>1. 種類と販売契約</h3>
              <div className="segmented-control large document-type-tabs">
                <button type="button" className={form.documentType === "S" ? "active" : ""} onClick={() => changeType("S")}><FileOutput size={17} />S（請求）</button>
                <button type="button" className={form.documentType === "R" ? "active" : ""} onClick={() => changeType("R")}><Printer size={17} />R（領収）</button>
              </div>
              <label className="field-label">
                対象の販売契約 <span className="required">必須</span>
                <select value={form.contractId} onChange={(event) => setForm({ ...form, contractId: event.target.value })}>
                  <option value="">選択してください</option>
                  {eligibleContracts.map((contract) => {
                    const vehicle = data.vehicles.find((item) => item.id === contract.vehicleId);
                    return <option key={contract.id} value={contract.id}>{contract.customerLabel}　{vehicle?.managementNumber} {vehicle?.name}　{formatCurrency(contract.amount)}</option>;
                  })}
                </select>
              </label>
              {!eligibleContracts.length ? <p className="form-hint">{form.documentType === "R" ? "Rを発行できる入金完了済みの販売契約がありません。先に入出金を完了してください。" : "Sを発行できる契約済みの販売契約がありません。"}</p> : null}
              {selectedContract ? <div className="document-source-preview"><span>宛名<strong>{selectedContract.customerLabel}</strong></span><span>対象<strong>{selectedVehicle?.managementNumber} {selectedVehicle?.name}</strong></span><span>金額<strong>{formatCurrency(selectedContract.amount)}</strong></span></div> : null}
            </section>

            <section className="form-section">
              <h3>2. 発行内容</h3>
              <div className="form-row">
                <label className="field-label">発行日 <span className="required">必須</span><input type="date" max={new Date().toISOString().slice(0, 10)} value={form.issuedOn} onChange={(event) => setForm({ ...form, issuedOn: event.target.value })} /></label>
                <label className="field-label">発行方法<select value={form.deliveryMethod} onChange={(event) => setForm({ ...form, deliveryMethod: event.target.value as IssueDocumentInput["deliveryMethod"], stampDutyAmount: 0 })}><option>電子・PDF</option><option>紙</option></select></label>
              </div>
              <label className="document-check tax-breakdown-check"><input type="checkbox" checked={form.showTaxBreakdown} onChange={(event) => setForm({ ...form, showTaxBreakdown: event.target.checked })} /><span><strong>内消費税相当額（10%）を表示する</strong><small>税込金額から1円未満を切り捨てて計算します</small></span></label>
              {form.documentType === "R" && form.deliveryMethod === "紙" ? <label className="field-label">印紙確認額<input type="number" min="0" step="1" value={form.stampDutyAmount} onChange={(event) => setForm({ ...form, stampDutyAmount: Number(event.target.value) })} /><small className="field-note">印紙が必要か、金額はいくらかを妻・税理士へ確認して入力してください。</small></label> : null}
              <label className="field-label">備考<textarea maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="必要な場合だけ入力" /></label>
              <p className="form-hint">インボイス登録番号は表示しません。発行後の訂正は、事業主が元の履歴を無効にして新しい番号で発行します。</p>
            </section>

            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setDrawerOpen(false)}>キャンセル</button><button type="submit" className="primary-button" disabled={submitting || !form.contractId}>{submitting ? "発行中" : "発行して表示"}</button></div>
          </form>
        </Drawer>
      ) : null}
    </>
  );
}
