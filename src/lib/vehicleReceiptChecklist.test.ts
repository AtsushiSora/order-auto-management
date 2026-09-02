import { describe, expect, it } from "vitest";
import type { VehicleDocument, VehicleDocumentType } from "../types";
import {
  isVehicleReceiptChecklistComplete,
  vehicleReceiptChecklistTypes,
  vehicleReceiptStatus,
} from "./vehicleReceiptChecklist";

const document = (
  documentType: VehicleDocumentType,
  status: "未選択" | "受取済み" | "不要",
  note = "",
): VehicleDocument => ({
  id: documentType,
  vehicleId: "vehicle",
  documentType,
  isRequired: status !== "不要",
  isReceived: status === "受取済み",
  receivedAt: status === "受取済み" ? "2026-09-03" : null,
  note,
  createdAt: "2026-09-03T00:00:00Z",
  updatedAt: "2026-09-03T00:00:00Z",
});

describe("vehicle receipt checklist", () => {
  it("missing and undecided items remain incomplete", () => {
    expect(isVehicleReceiptChecklistComplete([])).toBe(false);
    expect(vehicleReceiptStatus(document("車検証", "未選択"))).toBe("未選択");
  });

  it("accepts a checklist where every item is received or unnecessary", () => {
    const documents = vehicleReceiptChecklistTypes.map((type) =>
      document(type, type === "その他" ? "不要" : "受取済み", type === "鍵の本数" ? "2" : ""),
    );
    expect(isVehicleReceiptChecklistComplete(documents)).toBe(true);
  });

  it("requires a positive key count when keys are received", () => {
    const documents = vehicleReceiptChecklistTypes.map((type) =>
      document(type, type === "その他" ? "不要" : "受取済み", type === "鍵の本数" ? "0" : ""),
    );
    expect(isVehicleReceiptChecklistComplete(documents)).toBe(false);
  });
});
