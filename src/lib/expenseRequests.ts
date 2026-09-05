import type { Approval, SaveExpenseRequestInput } from "../types";

export const validateExpenseRequest = (
  input: SaveExpenseRequestInput,
  evidenceCount: number,
): string | null => {
  if (!input.category.trim()) return "費用項目を入力してください。";
  if (!input.description.trim()) return "内容を入力してください。";
  if (!input.incurredOn) return "発生日を入力してください。";
  if (!Number.isInteger(input.amount) || input.amount <= 0) return "金額は1円以上の整数で入力してください。";
  if (evidenceCount === 0 && !input.evidenceMissingReason.trim()) {
    return "領収書・レシートを添付するか、添付できない理由を入力してください。";
  }
  return null;
};

export const isPotentialExpenseRequestDuplicate = (
  request: Approval,
  input: SaveExpenseRequestInput,
): boolean => (
  request.approvalType === "経費申請"
  && request.id !== input.approvalId
  && ["承認待ち", "承認"].includes(request.status)
  && request.vehicleId === input.vehicleId
  && request.amount === input.amount
  && request.incurredOn === input.incurredOn
);
