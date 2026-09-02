import { describe, expect, it } from "vitest";
import { seedData } from "../data/seed";
import { buildAntiqueLedgerEntries, describeVehicleFeatures } from "./antiqueLedger";

describe("古物台帳の自動連携", () => {
  it("車両・買取契約・補足情報を1件の台帳記録へまとめる", () => {
    const entries = buildAntiqueLedgerEntries(seedData);
    const entry = entries.find((item) => item.vehicleId === "vehicle-26-0001");

    expect(entry).toMatchObject({
      receivedOn: "2026-08-20",
      sellerName: "個人のお客様 A",
      purchaseAmount: 820000,
      status: "記録済み",
    });
    expect(entry && describeVehicleFeatures(entry)).toContain("TEST-CHASSIS-0001");
  });

  it("0円買取も除外せず、入庫前は入庫待ちにする", () => {
    const data = structuredClone(seedData);
    data.vehicles[0].purchasePrice = 0;
    data.vehicles[0].arrivedAt = null;
    data.vehicles[0].status = "入庫予定";
    data.antiqueLedgerDetails[0].receivedOnOverride = null;

    const entry = buildAntiqueLedgerEntries(data).find((item) => item.vehicleId === "vehicle-26-0001");

    expect(entry?.purchaseAmount).toBe(0);
    expect(entry?.status).toBe("入庫待ち");
    expect(entry?.missingItems).toContain("受入年月日");
  });

  it("法人・オークションでは年齢を必須にしない", () => {
    const entries = buildAntiqueLedgerEntries(seedData);
    const auctionEntry = entries.find((item) => item.vehicleId === "vehicle-26-0002");

    expect(auctionEntry?.missingItems).not.toContain("受入相手方の年齢");
    expect(auctionEntry?.missingItems).toContain("登録番号・車両番号");
  });
});

