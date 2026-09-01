import { describe, expect, it } from "vitest";
import { seedData } from "../data/seed";
import {
  calculateVehicleProfit,
  getDashboardCounts,
  outstandingAmount,
} from "./calculations";

describe("calculateVehicleProfit", () => {
  it("確定費用と予定費用を分けて利益を計算する", () => {
    const vehicle = seedData.vehicles[0];
    const result = calculateVehicleProfit(vehicle, seedData.expenses);

    expect(result.confirmedExpenses).toBe(35000);
    expect(result.plannedExpenses).toBe(180000);
    expect(result.provisionalProfit).toBe(425000);
    expect(result.expectedProfit).toBe(245000);
  });
});

describe("getDashboardCounts", () => {
  it("確認が必要な件数をデータから集計する", () => {
    const counts = getDashboardCounts(seedData);

    expect(counts.inventory).toBe(4);
    expect(counts.plannedArrival).toBe(1);
    expect(counts.reserved).toBe(1);
    expect(counts.unpaidIncoming).toBe(1);
    expect(counts.unpaidOutgoing).toBe(1);
    expect(counts.missingDocuments).toBe(1);
    expect(counts.pendingApprovals).toBe(1);
  });
});

describe("outstandingAmount", () => {
  it("処理済み額を差し引き、マイナスにはしない", () => {
    expect(outstandingAmount(100000, 30000)).toBe(70000);
    expect(outstandingAmount(100000, 120000)).toBe(0);
  });
});

