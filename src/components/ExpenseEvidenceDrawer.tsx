import { Camera, ExternalLink, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
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
  const [preview, setPreview] = useState<{ attachment: Attachment; url: string } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const uploadFile = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      await uploadExpenseAttachment(expense.id, category, file);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "証憑を添付できませんでした。");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await uploadFile(file);
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    setCameraStarting(false);
    setCameraReady(false);
  };

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const startCamera = async () => {
    setError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("このブラウザでは画面内カメラを利用できません。「写真・PDFを選ぶ」から撮影済みの写真を選んでください。");
      return;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setCameraOpen(true);
    setCameraStarting(true);
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      requestAnimationFrame(() => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        void videoRef.current.play();
      });
    } catch {
      stopCamera();
      setError("カメラを開始できませんでした。Chromeのカメラ許可を確認するか、「写真・PDFを選ぶ」を使用してください。");
    } finally {
      setCameraStarting(false);
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setError("カメラの準備が完了していません。映像が表示されてからもう一度お試しください。");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) {
      setError("写真を作成できませんでした。もう一度お試しください。");
      return;
    }
    const file = new File([blob], `receipt-${new Date().toISOString().replaceAll(":", "-")}.jpg`, { type: "image/jpeg" });
    if (await uploadFile(file)) stopCamera();
  };

  const open = async (attachment: Attachment) => {
    setError("");
    setBusy(true);
    try {
      const url = await getAttachmentUrl(attachment.id);
      setPreview({ attachment, url });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "証憑を開けませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (attachment: Attachment) => {
    if (!window.confirm(`「${attachment.originalFileName}」を完全に削除しますか？`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteAttachment(attachment.id);
      if (preview?.attachment.id === attachment.id) setPreview(null);
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
              <button type="button" className="primary-button" disabled={busy || cameraStarting} onClick={() => void startCamera()}>
                <Camera size={18} />写真を撮る
              </button>
              <label className="secondary-button file-button">
                <Upload size={18} />写真・PDFを選ぶ
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif" disabled={busy} onChange={(event) => void upload(event)} />
              </label>
            </div>
            {cameraOpen ? (
              <div className="evidence-camera-panel" aria-label="証憑写真の撮影">
                <video ref={videoRef} autoPlay muted playsInline onCanPlay={() => setCameraReady(true)} />
                {cameraStarting ? <p>カメラを準備しています…</p> : null}
                <div className="evidence-camera-actions">
                  <button type="button" className="primary-button" disabled={busy || !cameraReady} onClick={() => void capturePhoto()}><Camera size={18} />この写真を保存</button>
                  <button type="button" className="secondary-button" disabled={busy} onClick={stopCamera}>カメラを閉じる</button>
                </div>
              </div>
            ) : null}
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

        {preview ? (
          <section className="detail-section evidence-preview" aria-label="証憑プレビュー">
            <div className="section-heading">
              <div>
                <h3>{preview.attachment.category}を表示</h3>
                <p>{preview.attachment.originalFileName}</p>
              </div>
              <button type="button" className="secondary-button" onClick={() => setPreview(null)}>表示を閉じる</button>
            </div>
            {preview.attachment.mimeType === "application/pdf" ? (
              <iframe src={preview.url} title={preview.attachment.originalFileName} />
            ) : (
              <img src={preview.url} alt={`${preview.attachment.category}：${preview.attachment.originalFileName}`} />
            )}
            <a className="secondary-button evidence-preview-external" href={preview.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={17} />別タブで開く
            </a>
          </section>
        ) : null}

        {busy ? <p className="form-hint">ファイルを処理しています。画面を閉じずにお待ちください。</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </div>
    </Drawer>
  );
}
