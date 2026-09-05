import {
  Banknote,
  Camera,
  CheckCircle2,
  ExternalLink,
  FileText,
  Paperclip,
  RotateCcw,
  Send,
  Upload,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { isPotentialExpenseRequestDuplicate, validateExpenseRequest } from "../lib/expenseRequests";
import { formatFileSize } from "../lib/evidence";
import { formatCurrency, formatDate } from "../lib/format";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
import type { Approval, Attachment, ExpenseRequestDecision, SaveExpenseRequestInput } from "../types";
import { Drawer } from "./Drawer";
import { StatusBadge } from "./StatusBadge";

const requestCategories = ["部品代", "外注費", "陸送費", "登録費用", "仕入手数料", "販売手数料", "備品費", "その他"];

const initialRequest = (): SaveExpenseRequestInput => ({
  approvalId: null,
  vehicleId: null,
  category: "部品代",
  description: "",
  amount: 0,
  incurredOn: new Date().toISOString().slice(0, 10),
  evidenceMissingReason: "",
});

const attachmentAccept = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif";

export function ExpenseRequestsSection() {
  const {
    data,
    saveExpenseRequest,
    uploadExpenseRequestAttachment,
    decideExpenseRequest,
    cancelExpenseRequest,
    getAttachmentUrl,
    completeCashflow,
  } = useAppData();
  const { profile } = useAuth();
  const isOwner = profile?.role === "owner";
  const canRequest = profile?.role === "regular" || profile?.role === "accounting";
  const requests = useMemo(
    () => data.approvals.filter((item) => item.approvalType === "経費申請"),
    [data.approvals],
  );
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<Approval | null>(null);
  const [form, setForm] = useState<SaveExpenseRequestInput>(initialRequest);
  const [files, setFiles] = useState<File[]>([]);
  const [savedApprovalId, setSavedApprovalId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"現金" | "振込">("振込");
  const [decisionNote, setDecisionNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ attachment: Attachment; url: string } | null>(null);

  const pendingCount = requests.filter((item) => item.status === "承認待ち").length;
  const returnedCount = requests.filter((item) => item.status === "差し戻し").length;

  const vehicleLabel = (vehicleId: string | null) => {
    if (!vehicleId) return "事業全体";
    const vehicle = data.vehicles.find((item) => item.id === vehicleId);
    return vehicle ? `${vehicle.managementNumber}　${vehicle.name}` : "削除・非表示の車両";
  };

  const applicantName = (request: Approval) => (
    data.staffProfiles.find((item) => item.id === request.requestedById)?.displayName ?? request.requestedBy
  );

  const requestAttachments = (requestId: string) => {
    const request = requests.find((item) => item.id === requestId);
    return data.attachments.filter((item) => item.approvalId === requestId || (request?.expenseId && item.expenseId === request.expenseId));
  };

  const openNew = () => {
    setForm(initialRequest());
    setFiles([]);
    setSavedApprovalId(null);
    setError("");
    setFormOpen(true);
  };

  const openReturned = (request: Approval) => {
    setForm({
      approvalId: request.id,
      vehicleId: request.vehicleId,
      category: request.category,
      description: request.description,
      amount: request.amount,
      incurredOn: request.incurredOn,
      evidenceMissingReason: request.evidenceMissingReason,
    });
    setFiles([]);
    setSavedApprovalId(null);
    setError("");
    setSelected(null);
    setFormOpen(true);
  };

  const appendFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (next.length) setFiles((current) => [...current, ...next]);
  };

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const existingCount = form.approvalId ? requestAttachments(form.approvalId).length : 0;
    const validation = validateExpenseRequest(form, existingCount + files.length);
    if (validation) {
      setError(validation);
      return;
    }
    if (!savedApprovalId && requests.some((item) => isPotentialExpenseRequestDuplicate(item, form))) {
      const proceed = window.confirm("同じ車両・日付・金額の申請があります。重複していないことを確認して、このまま申請しますか？");
      if (!proceed) return;
    }
    setBusy(true);
    setError("");
    try {
      const approvalId = savedApprovalId ?? await saveExpenseRequest(form);
      setSavedApprovalId(approvalId);
      const pendingFiles = [...files];
      for (const file of pendingFiles) {
        await uploadExpenseRequestAttachment(approvalId, "領収書", file);
        setFiles((current) => current.filter((item) => item !== file));
      }
      setFormOpen(false);
      setSavedApprovalId(null);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "経費を申請できませんでした。";
      setError(savedApprovalId ? `申請は保存されています。添付を再試行してください：${message}` : message);
    } finally {
      setBusy(false);
    }
  };

  const openDetail = (request: Approval) => {
    setSelected(request);
    setPaymentMethod(request.paymentMethod === "現金" ? "現金" : "振込");
    setDecisionNote(request.decisionNote);
    setError("");
    setPreview(null);
  };

  const decide = async (decision: ExpenseRequestDecision) => {
    if (decision === "承認" && requestAttachments(selected?.id ?? "").length === 0 && !selected?.evidenceMissingReason) {
      setError("証憑も添付できない理由もないため、差し戻して確認してください。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!selected) return;
      await decideExpenseRequest(selected.id, decision, paymentMethod, decisionNote);
      setSelected(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "申請を処理できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (request: Approval) => {
    if (!window.confirm("この経費申請を取り消しますか？")) return;
    setBusy(true);
    setError("");
    try {
      await cancelExpenseRequest(request.id);
      setSelected(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "申請を取り消せませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const openAttachment = async (attachment: Attachment) => {
    setBusy(true);
    setError("");
    try {
      const url = await getAttachmentUrl(attachment.id);
      setPreview({ attachment, url });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "証憑を開けませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async (request: Approval) => {
    const cashflow = data.cashflows.find((item) => item.expenseId === request.expenseId && item.kind === "経費支払い");
    if (!cashflow || cashflow.status === "完了") return;
    if (!window.confirm(`${formatCurrency(cashflow.amount)}を${cashflow.method}で支払済みにしますか？`)) return;
    setBusy(true);
    setError("");
    try {
      await completeCashflow(cashflow.id, new Date().toISOString().slice(0, 10));
      setSelected(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "支払済みにできませんでした。");
    } finally {
      setBusy(false);
    }
  };

  if (!isOwner && !canRequest) return null;

  return (
    <>
      <section className="expense-request-panel panel">
        <div className="expense-request-heading">
          <div>
            <h2>経費申請</h2>
            <p>{isOwner ? "スタッフから届いた申請を確認し、支払い方法を決めます。" : "立て替えた経費を、領収書・レシートと一緒に申請します。"}</p>
          </div>
          {canRequest ? <button type="button" className="primary-button" onClick={openNew}><Send size={18} />経費を申請</button> : null}
        </div>

        <div className="expense-request-counts">
          <span><strong>{pendingCount}</strong>件 承認待ち</span>
          <span><strong>{returnedCount}</strong>件 差し戻し</span>
        </div>

        {requests.length ? (
          <div className="expense-request-list">
            {requests.map((request) => (
              <button type="button" className="expense-request-row" key={request.id} onClick={() => openDetail(request)}>
                <span className="expense-request-row-main">
                  <strong>{request.category}　{request.description}</strong>
                  <small>{formatDate(request.incurredOn)}・{vehicleLabel(request.vehicleId)}・{applicantName(request)}</small>
                </span>
                <span className="expense-request-row-evidence"><Paperclip size={14} />{requestAttachments(request.id).length}</span>
                <strong className="expense-request-amount">{formatCurrency(request.amount)}</strong>
                <StatusBadge>{request.status}</StatusBadge>
              </button>
            ))}
          </div>
        ) : <p className="expense-request-empty">経費申請はまだありません。</p>}
      </section>

      {formOpen ? (
        <Drawer title={form.approvalId ? "経費を修正して再申請" : "経費を申請"} subtitle="事業主が承認すると、正式な経費と支払い予定に登録されます。" onClose={() => !busy && setFormOpen(false)}>
          <form className="form-stack" onSubmit={submitRequest}>
            <section className="form-section">
              <h3>対象と内容</h3>
              <label className="field-label">対象車両
                <select value={form.vehicleId ?? ""} onChange={(event) => setForm({ ...form, vehicleId: event.target.value || null })}>
                  <option value="">車両に関係しない経費</option>
                  {data.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.managementNumber}　{vehicle.name}</option>)}
                </select>
              </label>
              <div className="form-row">
                <label className="field-label">費用項目
                  <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{requestCategories.map((item) => <option key={item}>{item}</option>)}</select>
                </label>
                <label className="field-label">発生日 <span className="required">必須</span>
                  <input type="date" value={form.incurredOn} onChange={(event) => setForm({ ...form, incurredOn: event.target.value })} />
                </label>
              </div>
              <label className="field-label">内容 <span className="required">必須</span>
                <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="購入した物や依頼した作業など" />
              </label>
              <label className="field-label">金額（税込） <span className="required">必須</span>
                <input type="number" min="1" step="1" inputMode="numeric" value={form.amount || ""} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} />
              </label>
            </section>

            <section className="form-section evidence-upload-section">
              <h3>領収書・レシート</h3>
              <div className="evidence-upload-actions">
                <label className="primary-button file-button"><Camera size={18} />写真を撮る<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={appendFiles} /></label>
                <label className="secondary-button file-button"><Upload size={18} />写真・PDFを選ぶ<input type="file" accept={attachmentAccept} multiple disabled={busy} onChange={appendFiles} /></label>
              </div>
              {files.length ? <div className="expense-request-file-list">{files.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`}><FileText size={16} /><span>{file.name}<small>{formatFileSize(file.size)}</small></span><button type="button" className="icon-button" aria-label={`${file.name}を外す`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><XCircle size={17} /></button></div>)}</div> : null}
              {form.approvalId && requestAttachments(form.approvalId).length ? <p className="form-hint">保存済みの証憑が{requestAttachments(form.approvalId).length}件あります。</p> : null}
              <label className="field-label">添付できない理由
                <textarea value={form.evidenceMissingReason} onChange={(event) => setForm({ ...form, evidenceMissingReason: event.target.value })} placeholder="領収書がない場合だけ理由を入力" />
              </label>
              <p className="form-hint">領収書・レシートの添付、または添付できない理由の入力が必要です。</p>
            </section>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => setFormOpen(false)}>キャンセル</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "送信中" : form.approvalId ? "再申請する" : "申請する"}</button></div>
          </form>
        </Drawer>
      ) : null}

      {selected ? (
        <Drawer title="経費申請を確認" subtitle={`${applicantName(selected)}・${formatDate(selected.incurredOn)}`} onClose={() => !busy && setSelected(null)}>
          <div className="form-stack">
            <section className="detail-section expense-request-detail">
              <div><span>状態</span><StatusBadge>{selected.status}</StatusBadge></div>
              <div><span>対象</span><strong>{vehicleLabel(selected.vehicleId)}</strong></div>
              <div><span>費用項目</span><strong>{selected.category}</strong></div>
              <div><span>内容</span><strong>{selected.description}</strong></div>
              <div><span>金額</span><strong>{formatCurrency(selected.amount)}</strong></div>
              {selected.evidenceMissingReason ? <div><span>証憑がない理由</span><strong>{selected.evidenceMissingReason}</strong></div> : null}
              {selected.decisionNote ? <div><span>確認メモ</span><strong>{selected.decisionNote}</strong></div> : null}
            </section>

            <section className="detail-section">
              <div className="section-heading"><h3>領収書・レシート</h3><span className="evidence-count"><Paperclip size={14} />{requestAttachments(selected.id).length}件</span></div>
              {requestAttachments(selected.id).length ? <div className="evidence-list">{requestAttachments(selected.id).map((attachment) => <article className="evidence-item" key={attachment.id}><FileText size={22} /><div className="evidence-item-copy"><strong>{attachment.category}</strong><span>{attachment.originalFileName}</span><small>{formatFileSize(attachment.byteSize)}</small></div><button type="button" className="icon-button" title="開く" disabled={busy} onClick={() => void openAttachment(attachment)}><ExternalLink size={17} /></button></article>)}</div> : <p className="expense-request-empty">証憑は添付されていません。</p>}
            </section>

            {preview ? <section className="detail-section evidence-preview"><div className="section-heading"><div><h3>証憑を表示</h3><p>{preview.attachment.originalFileName}</p></div><button type="button" className="secondary-button" onClick={() => setPreview(null)}>閉じる</button></div>{preview.attachment.mimeType === "application/pdf" ? <iframe src={preview.url} title={preview.attachment.originalFileName} /> : <img src={preview.url} alt={preview.attachment.originalFileName} />}</section> : null}

            {isOwner && selected.status === "承認待ち" ? <section className="form-section"><h3>事業主の確認</h3><label className="field-label">支払い方法<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "現金" | "振込")}><option>振込</option><option>現金</option></select></label><label className="field-label">確認メモ<textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="差し戻し・却下の場合は理由を入力" /></label><p className="form-hint">承認すると正式な経費と入出金の支払い予定が自動で作成されます。</p></section> : null}

            {error ? <p className="form-error">{error}</p> : null}
            {isOwner && selected.status === "承認待ち" ? <div className="expense-request-decision-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => void decide("差し戻し")}><RotateCcw size={17} />差し戻す</button><button type="button" className="secondary-button danger-button" disabled={busy} onClick={() => void decide("却下")}><XCircle size={17} />却下</button><button type="button" className="primary-button" disabled={busy} onClick={() => void decide("承認")}><CheckCircle2 size={17} />承認する</button></div> : null}
            {isOwner && selected.status === "承認" ? (() => { const cashflow = data.cashflows.find((item) => item.expenseId === selected.expenseId && item.kind === "経費支払い"); return cashflow?.status !== "完了" ? <button type="button" className="primary-button full-button" disabled={busy} onClick={() => void markPaid(selected)}>{selected.paymentMethod === "現金" ? <Banknote size={18} /> : <WalletCards size={18} />}支払済みにする</button> : <p className="expense-request-paid"><CheckCircle2 size={18} />{cashflow.method}で支払済みです。</p>; })() : null}
            {canRequest && selected.requestedById === profile?.id && selected.status === "差し戻し" ? <button type="button" className="primary-button full-button" disabled={busy} onClick={() => openReturned(selected)}><RotateCcw size={18} />修正して再申請</button> : null}
            {canRequest && selected.requestedById === profile?.id && ["承認待ち", "差し戻し"].includes(selected.status) ? <button type="button" className="secondary-button full-button" disabled={busy} onClick={() => void cancel(selected)}>申請を取り消す</button> : null}
          </div>
        </Drawer>
      ) : null}
    </>
  );
}
