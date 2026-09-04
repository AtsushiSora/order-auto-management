import type { IScannerControls } from "@zxing/browser";
import { Camera, Image as ImageIcon, ScanLine } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { parseQrPayloads } from "../lib/vehicleInspection";
import type { VehicleInspectionData } from "../types";
import { Drawer } from "./Drawer";

export function VehicleQrReaderDrawer({
  onRead,
  onClose,
}: {
  onRead: (data: VehicleInspectionData) => void;
  onClose: () => void;
}) {
  const [payloads, setPayloads] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("QRコードを読み取ると、取得できた項目が登録画面へすぐ反映されます。");
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  };

  useEffect(() => () => controlsRef.current?.stop(), []);

  const accept = (raw: string) => {
    const payload = raw.trim();
    if (!payload) return;
    const next = payloads.includes(payload) ? payloads : [...payloads, payload];
    setPayloads(next);
    const result = parseQrPayloads(next);
    onRead(result);
    setError("");
    setMessage(`QRコードを${next.length}件読み取り、取得項目を反映しました。複数ある場合は続けて読み取ってください。`);
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setError("カメラはHTTPSの公開URLで利用できます。QR画像からの読み取りも使用できます。");
      return;
    }
    stopCamera();
    setError("");
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

  return (
    <Drawer title="車検証QRを読み取る" subtitle="読み取れた情報を車両登録へ自動反映します" onClose={onClose}>
      <div className="form-stack inspection-import">
        <section className="form-section inspection-read-panel qr-panel">
          <div><ScanLine size={26} /><strong>車検証のQRコード</strong><p>QR2の①→②、QR3の③→④→⑤の順に、あるものを続けて読み取ってください。</p></div>
          <video ref={videoRef} className={`inspection-camera ${scanning ? "" : "hidden"}`} muted playsInline />
          <div className="inspection-read-actions">
            <button type="button" className={scanning ? "secondary-button" : "primary-button"} disabled={busy} onClick={() => void (scanning ? stopCamera() : startCamera())}><Camera size={18} />{scanning ? "カメラを止める" : payloads.length ? "次のQRを読む" : "カメラで読む"}</button>
            <label className="secondary-button file-button"><ImageIcon size={18} />QR画像を選ぶ<input type="file" accept="image/*" disabled={busy} onChange={(event) => void readImage(event)} /></label>
          </div>
          <p className="form-hint">{message}</p>
          {error ? <p className="form-error">{error}</p> : null}
        </section>
        <div className="form-actions"><button type="button" className="primary-button" onClick={onClose}>登録画面へ戻る</button></div>
      </div>
    </Drawer>
  );
}
