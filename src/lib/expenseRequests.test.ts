import { describe, expect, it } from "vitest";
import { isPotentialExpenseRequestDuplicate, validateExpenseRequest } from "./expenseRequests";
import type { Approval, SaveExpenseRequestInput } from "../types";

const input: SaveExpenseRequestInput = {
  approvalId: null,
  vehicleId: "vehicle-1",
  category: "部品代",
  description: "ワイパー交換",
  amount: 2500,
  incurredOn: "2026-09-05",
  evidenceMissingReason: "",
};

const request: Approval = {
  id: "request-1",
  approvalType: "経費申請",
  vehicleId: "vehicle-1",
  title: "経費申請",
  requestedById: "staff-1",
  requestedBy: "スタッフ",
  decidedById: null,
  status: "承認待ち",
  decisionNote: "",
  expenseId: null,
  category: "部品代",
  description: "ワイパー交換",
  amount: 2500,
  incurredOn: "2026-09-05",
  paymentMethod: null,
  evidenceMissingReason: "",
  decidedAt: null,
  createdAt: "2026-09-05T00:00:00Z",
  updatedAt: "2026-09-05T00:00:00Z",
};

describe("validateExpenseRequest", () => {
  it("証憑も理由もない申請を拒否する", () => {
    expect(validateExpenseRequest(input, 0)).toContain("添付");
  });

  it("証憑がなくても理由があれば受け付ける", () => {
    expect(validateExpenseRequest({ ...input, evidenceMissingReason: "領収書を紛失" }, 0)).toBeNull();
  });

  it("証憑があれば理由なしで受け付ける", () => {
    expect(validateExpenseRequest(input, 1)).toBeNull();
  });
});

describe("isPotentialExpenseRequestDuplicate", () => {
  it("同じ車両・日付・金額の承認待ち申請を重複候補にする", () => {
    expect(isPotentialExpenseRequestDuplicate(request, input)).toBe(true);
  });

  it("取り消された申請は重複候補にしない", () => {
    expect(isPotentialExpenseRequestDuplicate({ ...request, status: "取消" }, input)).toBe(false);
  });
});
