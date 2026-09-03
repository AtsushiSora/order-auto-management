import { describe, expect, it } from "vitest";
import {
  CONTRACT_HANDOFF_PREFIX,
  CONTRACT_HANDOFF_TTL_MS,
  createContractHandoff,
  getEffectiveContractHandoffStatus,
  isSameOriginContractHandoff,
  mapSalePaymentMethod,
} from "./contractHandoff";

class MemoryStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("contract handoff", () => {
  it("stores only an opaque token in the destination URL", () => {
    const storage = new MemoryStorage();
    const token = "11111111-1111-4111-8111-111111111111";
    const result = createContractHandoff(storage, "sale", {
      assignmentId: "assignment-1", completionToken: "a".repeat(64), customerName: "山田 太郎", contractDate: "2026-09-02",
      vehicleName: "テスト車", vehicleMaker: "トヨタ", vehicleGrade: "G", vehicleYear: "2022",
      chassisNumber: "ABC-123", managementNumber: "26-0001", vehicleMileage: "12,000",
      vehicleColor: "白", inspectionDate: "2027-03",
      amount: 1_000_000, paymentMethod: "振込",
    }, { now: 1_000, token });

    expect(result.url).toBe(`https://atsushisora.github.io/hanbai-keiyakusho/contract-create.html?handoff=${token}`);
    expect(result.url).not.toContain(encodeURIComponent("山田 太郎"));
    expect(result.url).not.toContain("a".repeat(64));
    const saved = JSON.parse(storage.getItem(`${CONTRACT_HANDOFF_PREFIX}${token}`) ?? "null");
    expect(saved.payload.customerName).toBe("山田 太郎");
    expect(saved.payload.vehicleGrade).toBe("G");
    expect(Date.parse(saved.expiresAt) - Date.parse(saved.createdAt)).toBe(CONTRACT_HANDOFF_TTL_MS);
  });

  it("removes expired handoffs before storing a new one", () => {
    const storage = new MemoryStorage();
    storage.setItem(`${CONTRACT_HANDOFF_PREFIX}old`, JSON.stringify({ expiresAt: new Date(1_000).toISOString() }));
    createContractHandoff(storage, "purchase", {
      assignmentId: "assignment-2", completionToken: "b".repeat(64), customerName: "佐藤 花子", contractDate: "2026-09-02",
      vehicleName: "買取車", chassisNumber: "XYZ-999", amount: 0,
      plannedArrivalDate: "2026-09-03", storageLocation: "自宅", paymentMethod: "現金",
    }, { now: 2_000, token: "22222222-2222-4222-8222-222222222222" });
    expect(storage.getItem(`${CONTRACT_HANDOFF_PREFIX}old`)).toBeNull();
  });

  it("supports direct owner and regular-staff handoffs without an assignment", () => {
    const storage = new MemoryStorage();
    const token = "33333333-3333-4333-8333-333333333333";
    const result = createContractHandoff(storage, "purchase", {
      assignmentId: null, completionToken: "c".repeat(64), customerName: "直接契約テスト", contractDate: "2026-09-02",
      vehicleName: "直接買取車", chassisNumber: "DIRECT-001", amount: 100_000,
      plannedArrivalDate: "2026-09-03", storageLocation: "自宅", paymentMethod: "振込",
    }, { now: 3_000, token });

    const saved = JSON.parse(storage.getItem(`${CONTRACT_HANDOFF_PREFIX}${token}`) ?? "null");
    expect(saved.payload.assignmentId).toBeNull();
    expect(result.url).toBe(`https://atsushisora.github.io/kaitori-contract/contract.html?handoff=${token}#create`);
    expect(result.url).not.toContain("直接契約テスト");
  });

  it("requires the same browser origin and maps sale payment labels", () => {
    expect(isSameOriginContractHandoff("https://atsushisora.github.io", "https://atsushisora.github.io/kaitori-contract/contract.html")).toBe(true);
    expect(isSameOriginContractHandoff("http://127.0.0.1:5173", "https://atsushisora.github.io/kaitori-contract/contract.html")).toBe(false);
    expect(mapSalePaymentMethod("振込")).toBe("銀行振込");
    expect(mapSalePaymentMethod("ローン会社")).toBe("ローン");
  });

  it("shows an issued handoff as expired only after its deadline", () => {
    const expiresAt = "2026-09-02T01:00:00.000Z";
    expect(getEffectiveContractHandoffStatus({ status: "連携待ち", expiresAt, lastErrorCode: null }, Date.parse("2026-09-02T00:59:59.000Z"))).toBe("連携待ち");
    expect(getEffectiveContractHandoffStatus({ status: "連携待ち", expiresAt, lastErrorCode: "unexpected_error" }, Date.parse("2026-09-02T00:59:59.000Z"))).toBe("要確認");
    expect(getEffectiveContractHandoffStatus({ status: "連携待ち", expiresAt, lastErrorCode: "unexpected_error" }, Date.parse(expiresAt))).toBe("期限切れ");
    expect(getEffectiveContractHandoffStatus({ status: "完了", expiresAt, lastErrorCode: null }, Date.parse("2027-01-01T00:00:00.000Z"))).toBe("完了");
    expect(getEffectiveContractHandoffStatus({ status: "無効", expiresAt, lastErrorCode: null }, Date.parse("2027-01-01T00:00:00.000Z"))).toBe("無効");
  });
});
