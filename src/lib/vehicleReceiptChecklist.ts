import type { VehicleDocument, VehicleDocumentInput, VehicleDocumentType } from "../types";

export type VehicleReceiptStatus = "未選択" | "受取済み" | "不要";

export const vehicleReceiptChecklistTypes: VehicleDocumentType[] = [
  "車両本体",
  "鍵の本数",
  "車検証",
  "譲渡書類",
  "印鑑証明",
  "住民票",
  "申請依頼書",
  "自賠責保険",
  "その他",
];

export const vehicleReceiptStatus = (document: VehicleDocument | undefined): VehicleReceiptStatus => {
  if (!document) return "未選択";
  if (document.isReceived) return "受取済み";
  if (!document.isRequired) return "不要";
  return "未選択";
};

export const isVehicleReceiptChecklistComplete = (documents: VehicleDocument[]): boolean =>
  vehicleReceiptChecklistTypes.every((type) => {
    const document = documents.find((item) => item.documentType === type);
    if (vehicleReceiptStatus(document) === "未選択") return false;
    if (type === "鍵の本数" && document?.isReceived) {
      return /^\d+$/.test(document.note) && Number(document.note) >= 1;
    }
    return true;
  });

export const vehicleDocumentInputForStatus = (
  vehicleId: string,
  documentType: VehicleDocumentType,
  status: VehicleReceiptStatus,
  currentNote = "",
): VehicleDocumentInput => ({
  vehicleId,
  documentType,
  isRequired: status !== "不要",
  isReceived: status === "受取済み",
  receivedAt: status === "受取済み" ? new Date().toISOString().slice(0, 10) : null,
  note: documentType === "鍵の本数" && status === "受取済み" ? (currentNote || "1") : currentNote,
});
