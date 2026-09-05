import type { IScannerControls } from "@zxing/browser";
import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowLeft, Camera, CheckCircle2, Image as ImageIcon, QrCode, RotateCcw, ScanLine, Undo2 } from "lucide-react";
import { parseQrPayloads } from "../lib/vehicleInspection";
import { qrGuideProgress, vehicleQrGuides, type VehicleQrKind } from "../lib/vehicleQrGuide";
import type { VehicleInspectionData } from "../types";
import { Drawer } from "./Drawer";

function QrPlacementDiagram({ kind, readCount = 0, compact = false }: { kind: VehicleQrKind; readCount?: number; compact?: boolean }) {
  const guide = vehicleQrGuides[kind];
  const nextPosition = Math.min(readCount + 1, guide.steps.length);
  return (
    <div className={`qr-placement-diagram ${compact ? "compact" : ""}`} aria-label={`${guide.label}のQRコード配置と読み取り順`}>
      <div className="qr-paper-preview">
        <div className="qr-paper-title">車検証記録事項</div>
        <div className="qr-paper-lines" aria-hidden="true"><span /><span /><span /></div>
        <div className="qr-paper-bottom">
          <span className="qr-location-label">用紙の下側</span>
          <div className="qr-code-groups">
            {guide.groups.map((group, groupIndex) => (
              <Fragment key={group.label}>
                {groupIndex > 0 ? <span className="qr-group-arrow" aria-hidden="true">→</span> : null}
                <div className="qr-code-group">
                  <small>{group.label}</small>
                  <div>
                    {group.positions.map((position, index) => (
                      <Fragment key={position}>
                        {index > 0 ? <span className="qr-position-arrow" aria-hidden="true">→</span> : null}
                        <span className={`qr-position ${position <= readCount ? "complete" : position === nextPosition ? "current" : ""}`}>
                          <QrCode aria-hidden="true" />
                          <b>{position}</b>
                        </span>
                      </Fragment>
                    ))}
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </div>
      <p><strong>①から矢印の順</strong>に、1個ずつカメラの中央へ写します。</p>
    </div>
  );
}

export function VehicleQrReaderDrawer({
  onRead,
  onClose,
}: {
  onRead: (data: VehicleInspectionData) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<VehicleQrKind | null>(null);
  const [payloads, setPayloads] = useState<string[]>([]);
  const [preview, setPreview] = useState<VehicleInspectionData | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("普通車か軽自動車を選択してください。");
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const progress = useMemo(() => kind ? qrGuideProgress(kind, payloads.length) : null, [kind, payloads.length]);

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  };

  useEffect(() => () => controlsRef.current?.stop(), []);

  const updatePayloads = (next: string[]) => {
    setPayloads(next);
    setPreview(next.length ? parseQrPayloads(next) : null);
    setError("");
    if (!kind) return;
    const nextProgress = qrGuideProgress(kind, next.length);
    setMessage(nextProgress.isComplete
      ? `${nextProgress.expectedCount}件すべて読み取りました。内容を確認して反映してください。`
      : `${next.length}件読み取りました。次は「${nextProgress.nextStep}」を写してください。`);
  };

  const chooseKind = (nextKind: VehicleQrKind) => {
    stopCamera();
    setKind(nextKind);
    setPayloads([]);
    setPreview(null);
    setError("");
    setMessage(`最初は「${qrGuideProgress(nextKind, 0).nextStep}」を写してください。`);
  };

  const accept = (raw: string) => {
    if (!kind) return;
    const payload = raw.trim();
    if (!payload) return;
    if (payloads.includes(payload)) {
      setError("同じQRコードは読み取り済みです。案内を確認して次のQRコードを写してください。");
      return;
    }
    if (qrGuideProgress(kind, payloads.length).isComplete) {
      setError("必要なQRコードはすべて読み取り済みです。内容を確認して反映してください。");
      return;
    }
    updatePayloads([...payloads, payload]);
  };

  const startCamera = async () => {
    if (!kind) return setError("普通車か軽自動車を先に選択してください。");
    if (progress?.isComplete) return setError("必要なQRコードはすべて読み取り済みです。");
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setError("カメラはHTTPSの公開URLで利用できます。QR画像からの読み取りも使用できます。");
      return;
    }
    stopCamera();
    setError("");
    setMessage(`「${progress?.nextStep}」を白い枠の中央に合わせてください。`);
    setScanning(true);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });
      controlsRef.current = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        videoRef.current ?? undefined,
        (decoded, _scanError, controls) => {
          if (!decoded) return;
          controls.stop();
          controlsRef.current = null;
          setScanning(false);
          accept(decoded.getText());
        },
      );
    } catch {
      setScanning(false);
      setError("カメラを開始できませんでした。カメラの許可を確認するか、QR画像を選んでください。");
    }
  };

  const readImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!kind) return setError("普通車か軽自動車を先に選択してください。");
    setBusy(true);
    setError("");
    const imageUrl = URL.createObjectURL(file);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const result = await new BrowserQRCodeReader().decodeFromImageUrl(imageUrl);
      accept(result.getText());
    } catch {
      setError("画像からQRコードを確認できませんでした。QRを大きく写した画像で再度お試しください。");
    } finally {
      URL.revokeObjectURL(imageUrl);
      setBusy(false);
    }
  };

  const undoLast = () => {
    stopCamera();
    updatePayloads(payloads.slice(0, -1));
  };

  const reset = () => {
    stopCamera();
    updatePayloads([]);
  };

  const selectKindAgain = () => {
    stopCamera();
    setKind(null);
    setPayloads([]);
    setPreview(null);
    setError("");
    setMessage("普通車か軽自動車を選択してください。");
  };

  const apply = () => {
    if (!preview || !progress?.isComplete) return;
    onRead(preview);
    onClose();
  };

  return (
    <Drawer title="車検証QRを読み取る" subtitle="確認後に車両登録へ反映します" onClose={onClose}>
      <div className="form-stack inspection-import">
        {!kind ? (
          <section className="form-section qr-kind-section">
            <h3>車検証の種類を選択</h3>
            <p className="form-hint">QRコードの個数と撮影位置を正しく案内します。</p>
            <div className="qr-kind-options">
              {(Object.keys(vehicleQrGuides) as VehicleQrKind[]).map((option) => (
                <button type="button" key={option} onClick={() => chooseKind(option)}>
                  <ScanLine size={24} /><strong>{vehicleQrGuides[option].label}</strong><span>{vehicleQrGuides[option].description}</span>
                  <QrPlacementDiagram kind={option} compact />
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="form-section inspection-read-panel qr-panel">
            <div className="qr-guide-heading">
              <div><ScanLine size={26} /><strong>{progress?.label}のQRコード</strong><p>{progress?.description}</p></div>
              <button type="button" className="text-button" onClick={selectKindAgain}><ArrowLeft size={15} />種類を選び直す</button>
            </div>
            <QrPlacementDiagram kind={kind} readCount={payloads.length} />
            <div className="qr-progress" aria-label={`${progress?.completedCount}/${progress?.expectedCount}件読み取り済み`}>
              {progress?.steps.map((step, index) => <span key={step} className={index < payloads.length ? "complete" : index === payloads.length ? "current" : ""}>{index < payloads.length ? <CheckCircle2 size={16} /> : index + 1}<small>{step}</small></span>)}
            </div>
            <div className={`inspection-camera-frame ${scanning ? "active" : "hidden"}`}>
              <video ref={videoRef} className="inspection-camera" muted playsInline />
              <div className="inspection-camera-target"><span>次に読む場所</span><strong>{progress?.nextStep}</strong></div>
            </div>
            <div className="inspection-read-actions">
              <button type="button" className={scanning ? "secondary-button" : "primary-button"} disabled={busy || progress?.isComplete} onClick={() => void (scanning ? stopCamera() : startCamera())}><Camera size={18} />{scanning ? "カメラを止める" : payloads.length ? "次のQRを読む" : "カメラで読む"}</button>
              <label className={`secondary-button file-button ${progress?.isComplete ? "disabled" : ""}`}><ImageIcon size={18} />QR画像を選ぶ<input type="file" accept="image/*" disabled={busy || progress?.isComplete} onChange={(event) => void readImage(event)} /></label>
            </div>
            <p className={`qr-read-count ${progress?.isComplete ? "complete" : ""}`}>{progress?.completedCount}/{progress?.expectedCount}件 読み取り済み</p>
            <p className="form-hint">{message}</p>
            {progress?.isComplete && preview ? <div className="qr-detected-preview"><strong>反映する内容を確認</strong><dl className="inspection-reference"><div><dt>車台番号</dt><dd>{preview.chassisNumber || "読み取れませんでした"}</dd></div><div><dt>登録番号</dt><dd>{preview.registrationNumber || "読み取れませんでした"}</dd></div><div><dt>初度登録・検査</dt><dd>{preview.firstRegistration || "読み取れませんでした"}</dd></div><div><dt>車検満了日</dt><dd>{preview.inspectionExpiry || "読み取れませんでした"}</dd></div><div><dt>型式</dt><dd>{preview.modelType || "読み取れませんでした"}</dd></div></dl><p className="form-hint">車検証の記載と違う場合は取り消して読み直してください。反映後も登録画面で修正できます。</p></div> : null}
            {payloads.length ? <div className="qr-correction-actions"><button type="button" className="secondary-button" onClick={undoLast}><Undo2 size={17} />1つ前を取り消す</button><button type="button" className="text-button" onClick={reset}><RotateCcw size={16} />最初からやり直す</button></div> : null}
            {error ? <p className="form-error">{error}</p> : null}
          </section>
        )}
        <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button type="button" className="primary-button" disabled={!preview || !progress?.isComplete} onClick={apply}><CheckCircle2 size={18} />確認して車両情報へ反映</button></div>
      </div>
    </Drawer>
  );
}
