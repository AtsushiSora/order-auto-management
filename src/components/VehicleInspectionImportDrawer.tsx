import type { IScannerControls } from "@zxing/browser";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  FileJson,
  Image as ImageIcon,
  RotateCcw,
  Save,
  ScanLine,
  ShieldCheck,
  Undo2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { parseOfficialVehicleInspectionText, parseQrPayloads } from "../lib/vehicleInspection";
import { qrGuideProgress, vehicleQrGuides, type VehicleQrKind } from "../lib/vehicleQrGuide";
import type {
  AntiqueLedgerDetail,
  Vehicle,
  VehicleInspectionData,
  VehicleInspectionImportInput,
} from "../types";
import { Drawer } from "./Drawer";

type ImportMethod = "file" | "qr";

const blankResult = (): VehicleInspectionData => ({
  vehicleName: "",
  chassisNumber: "",
  registrationNumber: "",
  registeredOwnerName: "",
  firstRegistration: "",
  inspectionExpiry: "",
  modelType: "",
  rawSource: "",
  sourceType: "QRコード",
});

const mergeDetected = (
  current: VehicleInspectionData,
  detected: VehicleInspectionData,
): VehicleInspectionData => ({
  ...current,
  ...Object.fromEntries(
    Object.entries(detected).filter(([key, value]) => key === "sourceType" || key === "rawSource" || String(value).trim()),
  ),
  rawSource: detected.rawSource,
  sourceType: detected.sourceType,
});

export function VehicleInspectionImportDrawer({
  vehicles,
  antiqueLedgerDetails,
  onApply,
  onClose,
}: {
  vehicles: Vehicle[];
  antiqueLedgerDetails: AntiqueLedgerDetail[];
  onApply: (input: VehicleInspectionImportInput) => Promise<void>;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<ImportMethod>("file");
  const [vehicleId, setVehicleId] = useState("");
  const [result, setResult] = useState<VehicleInspectionData>(blankResult);
  const [hasRead, setHasRead] = useState(false);
  const [qrPayloads, setQrPayloads] = useState<string[]>([]);
  const [qrKind, setQrKind] = useState<VehicleQrKind | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const qrProgress = useMemo(() => qrKind ? qrGuideProgress(qrKind, qrPayloads.length) : null, [qrKind, qrPayloads.length]);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null,
    [vehicleId, vehicles],
  );

  const baseForVehicle = (target: Vehicle | null): VehicleInspectionData => {
    const ledger = antiqueLedgerDetails.find((item) => item.vehicleId === target?.id);
    return {
      ...blankResult(),
      vehicleName: target?.name ?? "",
      chassisNumber: target?.chassisNumber ?? "",
      registrationNumber: ledger?.registrationNumber ?? "",
      registeredOwnerName: ledger?.registeredOwnerName ?? "",
    };
  };

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  };

  useEffect(() => () => controlsRef.current?.stop(), []);

  const resetRead = () => {
    stopCamera();
    setQrPayloads([]);
    setHasRead(false);
    setResult(baseForVehicle(selectedVehicle));
    setError("");
    setMessage("");
  };

  const selectVehicle = (nextVehicleId: string) => {
    const target = vehicles.find((vehicle) => vehicle.id === nextVehicleId) ?? null;
    setVehicleId(nextVehicleId);
    if (!hasRead) setResult(baseForVehicle(target));
  };

  const applyDetected = (detected: VehicleInspectionData) => {
    setResult((current) => mergeDetected(hasRead ? current : baseForVehicle(selectedVehicle), detected));
    setHasRead(true);
    setError("");
    setMessage(`${detected.sourceType}を読み取りました。内容を確認してから反映してください。`);
  };

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(json|csv)$/i.test(file.name)) {
      setError("公式アプリから保存したJSONまたはCSVファイルを選んでください。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      applyDetected(parseOfficialVehicleInspectionText(file.name, await file.text()));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ファイルを読み取れませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const acceptQrText = (text: string) => {
    if (!qrKind) return setError("普通車か軽自動車を先に選択してください。");
    const payload = text.trim();
    if (!payload) return;
    if (qrPayloads.includes(payload)) return setError("同じQRコードは読み取り済みです。次のQRコードを写してください。");
    if (qrGuideProgress(qrKind, qrPayloads.length).isComplete) return setError("必要なQRコードはすべて読み取り済みです。");
    const next = [...qrPayloads, payload];
    setQrPayloads(next);
    setResult(mergeDetected(baseForVehicle(selectedVehicle), parseQrPayloads(next)));
    setHasRead(true);
    setError("");
    const nextProgress = qrGuideProgress(qrKind, next.length);
    setMessage(nextProgress.isComplete ? "必要なQRコードをすべて読み取りました。内容を確認してから反映してください。" : `次は「${nextProgress.nextStep}」を写してください。`);
  };

  const startCamera = async () => {
    if (!qrKind) return setError("普通車か軽自動車を先に選択してください。");
    if (qrProgress?.isComplete) return setError("必要なQRコードはすべて読み取り済みです。");
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setError("カメラはHTTPSの公開URLまたはlocalhostで利用できます。画像からの読み取りも使用できます。");
      return;
    }
    stopCamera();
    setError("");
    setMessage(`「${qrProgress?.nextStep}」を白い枠の中央に合わせてください。`);
    setScanning(true);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        videoRef.current ?? undefined,
        (decoded, _scanError, activeControls) => {
          if (!decoded) return;
          activeControls.stop();
          controlsRef.current = null;
          setScanning(false);
          acceptQrText(decoded.getText());
        },
      );
      controlsRef.current = controls;
    } catch {
      setScanning(false);
      setError("カメラを開始できませんでした。カメラの許可を確認するか、QR画像を選んでください。");
    }
  };

  const chooseQrKind = (nextKind: VehicleQrKind) => {
    stopCamera();
    setQrKind(nextKind);
    setQrPayloads([]);
    setHasRead(false);
    setResult(baseForVehicle(selectedVehicle));
    setError("");
    setMessage(`最初は「${qrGuideProgress(nextKind, 0).nextStep}」を写してください。`);
  };

  const undoLastQr = () => {
    stopCamera();
    const next = qrPayloads.slice(0, -1);
    setQrPayloads(next);
    setHasRead(next.length > 0);
    setResult(next.length ? mergeDetected(baseForVehicle(selectedVehicle), parseQrPayloads(next)) : baseForVehicle(selectedVehicle));
    setError("");
    if (qrKind) setMessage(next.length ? `次は「${qrGuideProgress(qrKind, next.length).nextStep}」を写してください。` : `最初は「${qrGuideProgress(qrKind, 0).nextStep}」を写してください。`);
  };

  const readQrImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    const imageUrl = URL.createObjectURL(file);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const decoded = await new BrowserQRCodeReader().decodeFromImageUrl(imageUrl);
      acceptQrText(decoded.getText());
    } catch {
      setError("画像からQRコードを確認できませんでした。QRを大きく写した画像で再度お試しください。");
    } finally {
      URL.revokeObjectURL(imageUrl);
      setBusy(false);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!vehicleId) return setError("反映先の車両を選択してください。");
    if (!hasRead) return setError("車検証ファイルまたはQRコードを先に読み取ってください。");
    setBusy(true);
    setError("");
    try {
      await onApply({
        vehicleId,
        vehicleName: result.vehicleName,
        chassisNumber: result.chassisNumber,
        registrationNumber: result.registrationNumber,
        registeredOwnerName: result.registeredOwnerName,
        firstRegistration: result.firstRegistration,
        inspectionExpiry: result.inspectionExpiry,
        modelType: result.modelType,
      });
      setMessage("車両情報と古物台帳へ反映しました。");
      window.setTimeout(onClose, 500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "車検証情報を反映できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer title="車検証を読み取る" subtitle="確認してから在庫車と古物台帳へ反映します" onClose={onClose}>
      <form className="form-stack inspection-import" onSubmit={save}>
        <section className="form-section">
          <h3>1. 反映する車両</h3>
          <label className="field-label">在庫車 <span className="required">必須</span>
            <select value={vehicleId} onChange={(event) => selectVehicle(event.target.value)}>
              <option value="">選択してください</option>
              {vehicles.map((vehicle) => <option value={vehicle.id} key={vehicle.id}>{vehicle.managementNumber}　{vehicle.name}</option>)}
            </select>
          </label>
          <p className="form-hint">先に買取契約または在庫登録を行い、その車両を選びます。重複する在庫は作りません。</p>
        </section>

        <section className="form-section">
          <h3>2. 読み取り方法</h3>
          <div className="inspection-method-tabs" role="tablist" aria-label="読み取り方法">
            <button type="button" className={method === "file" ? "active" : ""} onClick={() => { stopCamera(); setMethod("file"); }}><FileJson size={18} />公式アプリのファイル</button>
            <button type="button" className={method === "qr" ? "active" : ""} onClick={() => setMethod("qr")}><ScanLine size={18} />QRコード</button>
          </div>

          {method === "file" ? (
            <div className="inspection-read-panel">
              <div><strong>電子車検証はこちら</strong><p>国土交通省「車検証閲覧アプリ」で保存したJSONまたはCSVを選択します。</p></div>
              <label className="primary-button file-button"><Upload size={18} />{busy ? "読み取り中" : "ファイルを選ぶ"}<input type="file" accept=".json,.csv,application/json,text/csv" disabled={busy} onChange={(event) => void readFile(event)} /></label>
            </div>
          ) : !qrKind ? (
            <div className="inspection-read-panel qr-kind-section">
              <strong>車検証の種類を選択</strong>
              <p>QRコードの個数と撮影位置を正しく案内します。</p>
              <div className="qr-kind-options">
                {(Object.keys(vehicleQrGuides) as VehicleQrKind[]).map((option) => <button type="button" key={option} onClick={() => chooseQrKind(option)}><ScanLine size={24} /><strong>{vehicleQrGuides[option].label}</strong><span>{vehicleQrGuides[option].description}</span></button>)}
              </div>
            </div>
          ) : (
            <div className="inspection-read-panel qr-panel">
              <div className="qr-guide-heading"><div><strong>{qrProgress?.label}のQRコード</strong><p>{qrProgress?.description}</p></div><button type="button" className="text-button" onClick={() => { resetRead(); setQrKind(null); }}><ArrowLeft size={15} />種類を選び直す</button></div>
              <div className="qr-progress">{qrProgress?.steps.map((step, index) => <span key={step} className={index < qrPayloads.length ? "complete" : index === qrPayloads.length ? "current" : ""}>{index < qrPayloads.length ? <CheckCircle2 size={16} /> : index + 1}<small>{step}</small></span>)}</div>
              <div className={`inspection-camera-frame ${scanning ? "active" : "hidden"}`}><video ref={videoRef} className="inspection-camera" muted playsInline /><div className="inspection-camera-target"><span>次に読む場所</span><strong>{qrProgress?.nextStep}</strong></div></div>
              <div className="inspection-read-actions">
                <button type="button" className={scanning ? "secondary-button" : "primary-button"} disabled={busy || qrProgress?.isComplete} onClick={() => void (scanning ? stopCamera() : startCamera())}><Camera size={18} />{scanning ? "カメラを止める" : qrPayloads.length ? "次のQRを読む" : "カメラで読む"}</button>
                <label className={`secondary-button file-button ${qrProgress?.isComplete ? "disabled" : ""}`}><ImageIcon size={18} />QR画像を選ぶ<input type="file" accept="image/*" disabled={busy || qrProgress?.isComplete} onChange={(event) => void readQrImage(event)} /></label>
              </div>
              <p className={`qr-read-count ${qrProgress?.isComplete ? "complete" : ""}`}>{qrProgress?.completedCount}/{qrProgress?.expectedCount}件 読み取り済み</p>
              {qrPayloads.length ? <div className="qr-correction-actions"><button type="button" className="secondary-button" onClick={undoLastQr}><Undo2 size={17} />1つ前を取り消す</button><button type="button" className="text-button" onClick={resetRead}><RotateCcw size={16} />最初からやり直す</button></div> : null}
            </div>
          )}
          <div className="privacy-note"><ShieldCheck size={18} /><p>選択したファイルやQR全文は端末内だけで解析します。確認後は下の4項目だけを保存します。</p></div>
        </section>

        {hasRead ? (
          <section className="form-section inspection-preview">
            <div className="section-heading"><div><h3>3. 内容を確認・修正</h3><p className="section-note">読み取り間違いがないか、車検証の券面と照合してください。</p></div><button type="button" className="text-button" onClick={resetRead}><RotateCcw size={15} />やり直す</button></div>
            <label className="field-label">車名<input value={result.vehicleName} onChange={(event) => setResult({ ...result, vehicleName: event.target.value })} /></label>
            <label className="field-label">車台番号<input value={result.chassisNumber} onChange={(event) => setResult({ ...result, chassisNumber: event.target.value })} /></label>
            <label className="field-label">登録番号・車両番号<input value={result.registrationNumber} onChange={(event) => setResult({ ...result, registrationNumber: event.target.value })} /></label>
            <label className="field-label">車検証上の所有者<input value={result.registeredOwnerName} onChange={(event) => setResult({ ...result, registeredOwnerName: event.target.value })} /></label>
            {(result.firstRegistration || result.inspectionExpiry || result.modelType) ? <dl className="inspection-reference"><div><dt>初度登録・検査</dt><dd>{result.firstRegistration || "—"}</dd></div><div><dt>車検満了日</dt><dd>{result.inspectionExpiry || "—"}</dd></div><div><dt>型式</dt><dd>{result.modelType || "—"}</dd></div></dl> : null}
            <p className="form-hint">読み取れた項目だけを保存し、入力済みの項目は消しません。</p>
          </section>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="form-success">{message}</p> : null}
        <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button type="submit" className="primary-button" disabled={busy || !hasRead || !vehicleId || (method === "qr" && !qrProgress?.isComplete)}><Save size={18} />{busy ? "反映中" : "確認して反映"}</button></div>
      </form>
    </Drawer>
  );
}
