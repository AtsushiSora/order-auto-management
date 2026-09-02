import type { StaffSettlement, StaffCalculationMethod } from "../types";

export const calculateStaffPlannedAmount = (
  method: StaffCalculationMethod,
  grossProfitBasis: number,
  ratePercent: number,
  manualAmount: number,
) => method === "粗利率"
  ? Math.floor(Math.max(0, grossProfitBasis) * Math.max(0, ratePercent) / 100)
  : Math.floor(Math.max(0, manualAmount));

export const staffSettlementDisplayAmount = (settlement: StaffSettlement) =>
  settlement.confirmedAmount ?? settlement.plannedAmount;

export const staffSettlementCondition = (settlement: StaffSettlement) => {
  if (settlement.calculationMethod === "粗利率") {
    return `粗利 ${settlement.grossProfitBasis.toLocaleString("ja-JP")}円 × ${settlement.ratePercent}%`;
  }
  return settlement.calculationMethod;
};
