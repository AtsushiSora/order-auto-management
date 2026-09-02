import type { IScannerControls } from "@zxing/browser";
import {
  Camera,
  FileJson,
  Image as ImageIcon,
  RotateCcw,
  Save,
  ScanLine,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { parseOfficialVehicleInspectionText, parseQrPayloads } from "../lib/vehicleInspection";
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
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

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
    const payload = text.trim();
    if (!payload) return;
    const next = qrPayloads.includes(payload) ? qrPayloads : [...qrPayloads, payload];
    setQrPayloads(next);
    applyDetected(parseQrPayloads(next));
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setError("カメラはHTTPSの公開URLまたはlocalhostで利用できます。画像からの読み取りも使用できます。");
      return;
    }
    stopCamera();
    setError("");
    setMessage("QRコードをカメラの中央に合わせてください。");
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
          ) : (
            <div className="inspection-read-panel qr-panel">
              <div><strong>券面のQRコード</strong><p>複数ある場合は、QR2の①→②、続けてQR3の③→④→⑤の順に読み取ります。読み取り後も必ず内容を確認してください。</p></div>
              <video ref={videoRef} className={`inspection-camera ${scanning ? "" : "hidden"}`} muted playsInline />
              <div className="inspection-read-actions">
                <button type="button" className={scanning ? "secondary-button" : "primary-button"} disabled={busy} onClick={() => void (scanning ? stopCamera() : startCamera())}><Camera size={18} />{scanning ? "カメラを止める" : qrPayloads.length ? "別のQRを読む" : "カメラで読む"}</button>
                <label className="secondary-button file-button"><ImageIcon size={18} />QR画像を選ぶ<input type="file" accept="image/*" capture="environment" disabled={busy} onChange={(event) => void readQrImage(event)} /></label>
              </div>
              {qrPayloads.length ? <p className="qr-read-count">QRコードを{qrPayloads.length}件読み取り済み</p> : null}
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
            <p className="form-hint">初度登録・車検満了日・型式は今回の確認用です。保存項目への追加は次の工程で対応できます。</p>
          </section>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="form-success">{message}</p> : null}
        <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>キャンセル</button><button type="submit" className="primary-button" disabled={busy || !hasRead || !vehicleId}><Save size={18} />{busy ? "反映中" : "確認して反映"}</button></div>
      </form>
    </Drawer>
  );
}
