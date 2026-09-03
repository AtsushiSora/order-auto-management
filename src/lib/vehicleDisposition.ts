import type { CompleteVehicleDispositionInput, Vehicle } from "../types";

export const validateVehicleDispositionCompletion = (
  vehicle: Vehicle | undefined,
  input: CompleteVehicleDispositionInput,
  today = new Date().toISOString().slice(0, 10),
) => {
  if (!vehicle) return "対象車両が見つかりません。";
  if (!vehicle.arrivedAt || vehicle.status === "入庫予定") return "入庫を確定してから処理してください。";
  if (!["入庫済み", "販売中"].includes(vehicle.status)) return "入庫済みまたは販売中の車両だけ処理できます。";
  if (vehicle.disposition !== input.disposition) return "車両の振り分けと処理内容が一致していません。";
  if (!input.counterparty.trim()) return "取引先・業者名を入力してください。";
  if (!input.completedOn || input.completedOn > today) return "処理日は今日以前で入力してください。";
  if (!Number.isInteger(input.proceedsAmount) || input.proceedsAmount < 0) return "入金額は0円以上の整数で入力してください。";
  if (input.disposition === "オークション" && input.proceedsAmount === 0) return "オークションの売却金額は1円以上で入力してください。";
  if (!Number.isInteger(input.feeAmount) || input.feeAmount < 0) return "手数料・処分費は0円以上の整数で入力してください。";
  return null;
};
