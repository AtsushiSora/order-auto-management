import { describe, expect, it } from "vitest";
import { calculateStaffPlannedAmount, staffSettlementDisplayAmount } from "./staffSettlements";

describe("スタッフ精算", () => {
  it("粗利率の予定額は1円未満を切り捨てる", () => {
    expect(calculateStaffPlannedAmount("粗利率", 333333, 7.5, 0)).toBe(24999);
  });

  it("固定額・手入力は入力金額を使用し、マイナスにはしない", () => {
    expect(calculateStaffPlannedAmount("固定額", 500000, 10, 30000)).toBe(30000);
    expect(calculateStaffPlannedAmount("手入力", 0, 0, -1)).toBe(0);
  });

  it("確定後は予定額ではなく確定額を表示する", () => {
    expect(staffSettlementDisplayAmount({ plannedAmount: 30000, confirmedAmount: 28000 } as never)).toBe(28000);
  });
});
