import { describe, expect, it } from "vitest";
import { emptyProductionReadiness, normalizeProductionReadiness, productionReadinessItems, readinessProgress, statusToDb } from "./productionReadiness";

describe("production readiness", () => {
  it("normalizes database values and ignores unknown keys", () => {
    const result = normalizeProductionReadiness({
      checks: {
        purchase_standard: { status: "passed", note: "確認", checkedAt: "2026-09-02T10:00:00Z" },
        unknown: { status: "passed" },
      },
      approvedAt: "2026-09-02T11:00:00Z",
    }, "2026-09-02T12:00:00Z");
    expect(result.checks.purchase_standard?.status).toBe("確認済み");
    expect(Object.keys(result.checks)).toEqual(["purchase_standard"]);
    expect(result.updatedAt).toBe("2026-09-02T12:00:00Z");
  });

  it("counts confirmed and needs-fix items", () => {
    const readiness = emptyProductionReadiness();
    readiness.checks.purchase_standard = { status: "確認済み", note: "", checkedAt: null };
    readiness.checks.purchase_zero = { status: "要修正", note: "修正中", checkedAt: null };
    expect(readinessProgress(readiness)).toEqual({ confirmed: 1, needsFix: 1, total: productionReadinessItems.length, complete: false });
  });

  it("converts display statuses for RPC input", () => {
    expect(statusToDb("未確認")).toBe("pending");
    expect(statusToDb("確認済み")).toBe("passed");
    expect(statusToDb("要修正")).toBe("needs_fix");
  });

  it("すべての確認項目に具体的な手順と重複しないキーがある", () => {
    expect(new Set(productionReadinessItems.map((item) => item.key)).size).toBe(productionReadinessItems.length);
    for (const item of productionReadinessItems) {
      expect(item.steps.length).toBeGreaterThanOrEqual(3);
      expect(item.steps.every((step) => step.trim().length > 0)).toBe(true);
    }
  });
});
