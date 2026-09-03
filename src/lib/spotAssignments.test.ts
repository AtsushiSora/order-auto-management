import { describe, expect, it } from "vitest";
import {
  requiresOwnerPurchaseAmount,
  requiresSpotSaleVehicle,
  spotAssignmentNextStep,
  validateSpotAssignment,
} from "./spotAssignments";

describe("スポットスタッフの担当フロー", () => {
  it("販売を全て担当する場合は在庫車両を必須にする", () => {
    const flow = { engagementType: "契約から全て担当", businessType: "販売" } as const;
    expect(requiresSpotSaleVehicle(flow)).toBe(true);
    expect(validateSpotAssignment({ ...flow, vehicleId: null, contractAmount: null })).toContain("対象車両");
    expect(validateSpotAssignment({ ...flow, vehicleId: "vehicle-1", contractAmount: null })).toBeNull();
  });

  it("買取と廃車を全て担当する場合は事業主設定額を必須にし、0円も認める", () => {
    for (const businessType of ["買取・オークション", "廃車"] as const) {
      const flow = { engagementType: "契約から全て担当", businessType } as const;
      expect(requiresOwnerPurchaseAmount(flow)).toBe(true);
      expect(validateSpotAssignment({ ...flow, vehicleId: null, contractAmount: null })).toContain("事業主");
      expect(validateSpotAssignment({ ...flow, vehicleId: null, contractAmount: 0 })).toBeNull();
      expect(validateSpotAssignment({ ...flow, vehicleId: null, contractAmount: -1 })).toContain("0円以上");
    }
  });

  it("紹介のみは契約入力を求めず、事業主が契約と紹介料処理を行う", () => {
    const flow = { engagementType: "紹介のみ", businessType: "販売" } as const;
    expect(validateSpotAssignment({ ...flow, vehicleId: null, contractAmount: null })).toBeNull();
    expect(spotAssignmentNextStep(flow, "owner")).toContain("事業主が契約");
    expect(spotAssignmentNextStep(flow, "spot")).toContain("紹介料確認");
  });

  it("販売と買取ではスポットスタッフ向けの次の操作を分ける", () => {
    expect(spotAssignmentNextStep({ engagementType: "契約から全て担当", businessType: "販売" }, "spot")).toContain("販売契約");
    expect(spotAssignmentNextStep({ engagementType: "契約から全て担当", businessType: "廃車" }, "spot")).toContain("金額は変更できません");
  });
});
