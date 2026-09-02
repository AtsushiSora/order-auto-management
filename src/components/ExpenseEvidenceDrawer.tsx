import { Camera, ExternalLink, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { attachmentCategories, formatFileSize } from "../lib/evidence";
import { formatDate } from "../lib/format";
import { useAppData } from "../state/AppDataContext";
import type { Attachment, AttachmentCategory, Expense } from "../types";
import { Drawer } from "./Drawer";

type Props = {
  expense: Expense;
  attachments: Attachment[];
  canUpload: boolean;
  isOwner: boolean;
  onClose: () => void;
};

export function ExpenseEvidenceDrawer({ expense, attachments, canUpload, isOwner, onClose }: Props) {
  const { uploadExpenseAttachment, getAttachmentUrl, deleteAttachment } = useAppData();
  const [category, setCategory] = useState<AttachmentCategory>("領収書");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await uploadExpenseAttachment(expense.id, category, file);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "証憑を添付できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const open = async (attachment: Attachment) => {
    setError("");
    const newTab = window.open("about:blank", "_blank");
    try {
      const url = await getAttachmentUrl(attachment.id);
      if (newTab) newTab.location.href = url;
      else window.location.assign(url);
    } catch (reason) {
      newTab?.close();
      setError(reason instanceof Error ? reason.message : "証憑を開けませんでした。");
    }
  };

  const remove = async (attachment: Attachment) => {
    if (!window.confirm(`「${attachment.originalFileName}」を完全に削除しますか？`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteAttachment(attachment.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "証憑を削除できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer title="証憑を管理" subtitle={`${expense.category}・${expense.description}`} onClose={onClose}>
      <div className="form-stack">
        {canUpload ? (
          <section className="form-section evidence-upload-section">
            <h3>領収書・請求書を追加</h3>
            <label className="field-label">
              書類の種類
              <select value={category} onChange={(event) => setCategory(event.target.value as AttachmentCategory)} disabled={busy}>
                {attachmentCategories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <div className="evidence-upload-actions">
              <label className="primary-button file-button">
                <Camera size={18} />写真を撮る
                <input type="file" accept="image/*" capture="environment" disabled={busy} onChange={(event) => void upload(event)} />
              </label>
              <label className="secondary-button file-button">
                <Upload size={18} />写真・PDFを選ぶ
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif" disabled={busy} onChange={(event) => void upload(event)} />
              </label>
            </div>
            <p className="form-hint">PDFまたは写真を25MBまで保存できます。ファイルは非公開で、閲覧時だけ1分間有効なURLを発行します。</p>
          </section>
        ) : null}

        <section className="detail-section">
          <div className="section-heading">
            <h3>保存済みの証憑</h3>
            <span className="evidence-count"><Paperclip size={14} />{attachments.length}件</span>
          </div>
          {attachments.length ? (
            <div className="evidence-list">
              {attachments.map((attachment) => (
                <article className="evidence-item" key={attachment.id}>
                  <FileText size={22} />
                  <div className="evidence-item-copy">
                    <strong>{attachment.category}</strong>
                    <span title={attachment.originalFileName}>{attachment.originalFileName}</span>
                    <small>{formatFileSize(attachment.byteSize)}・{formatDate(attachment.createdAt)}</small>
                  </div>
                  <div className="evidence-item-actions">
                    <button type="button" className="icon-button" title="開く" disabled={busy} onClick={() => void open(attachment)}><ExternalLink size={17} /></button>
                    {isOwner ? <button type="button" className="icon-button danger-icon-button" title="完全に削除" disabled={busy} onClick={() => void remove(attachment)}><Trash2 size={17} /></button> : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="evidence-empty"><FileText size={28} /><p>証憑はまだ添付されていません。</p></div>
          )}
        </section>

        {busy ? <p className="form-hint">ファイルを処理しています。画面を閉じずにお待ちください。</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </div>
    </Drawer>
  );
}
