import { describe, expect, it } from "vitest";
import type { CompleteVehicleDispositionInput, Vehicle } from "../types";
import { validateVehicleDispositionCompletion } from "./vehicleDisposition";

const vehicle = (patch: Partial<Vehicle> = {}) => ({
  id: "vehicle-1",
  status: "入庫済み",
  arrivedAt: "2026-09-01",
  disposition: "オークション",
  ...patch,
}) as Vehicle;

const input = (patch: Partial<CompleteVehicleDispositionInput> = {}): CompleteVehicleDispositionInput => ({
  vehicleId: "vehicle-1",
  disposition: "オークション",
  counterparty: "テストオークション",
  proceedsAmount: 500000,
  feeAmount: 30000,
  completedOn: "2026-09-03",
  incomeMethod: "振込",
  feePaymentMethod: "振込",
  ...patch,
});

describe("買取後の振り分け処理", () => {
  it("入庫前は完了処理できない", () => {
    expect(validateVehicleDispositionCompletion(vehicle({ status: "入庫予定", arrivedAt: null }), input(), "2026-09-03")).toContain("入庫を確定");
  });

  it("オークションは売却金額を必須にする", () => {
    expect(validateVehicleDispositionCompletion(vehicle(), input({ proceedsAmount: 0 }), "2026-09-03")).toContain("1円以上");
  });

  it("廃車は入金0円・処分費0円でも完了できる", () => {
    const scrapVehicle = vehicle({ disposition: "廃車" });
    expect(validateVehicleDispositionCompletion(scrapVehicle, input({ disposition: "廃車", proceedsAmount: 0, feeAmount: 0 }), "2026-09-03")).toBeNull();
  });
});
