import { describe, expect, it } from "vitest";
import type { Cashflow, CashflowEvent } from "../types";
import { calculateMonthlyBalance, calculateMonthlyMovement } from "./monthlyBalance";

const cashflows = [
  { id: "in", direction: "入金", method: "現金" },
  { id: "out", direction: "支払い", method: "振込" },
  { id: "card", direction: "入金", method: "カード" },
] as Cashflow[];
const events = [
  { id: "e1", cashflowId: "in", amount: 100_000, method: "現金", processedOn: "2026-09-05" },
  { id: "e2", cashflowId: "out", amount: 30_000, method: "振込", processedOn: "2026-09-06" },
  { id: "e3", cashflowId: "card", amount: 20_000, method: "カード", processedOn: "2026-09-07" },
  { id: "e4", cashflowId: "in", amount: 50_000, method: "現金", processedOn: "2026-08-31" },
] as CashflowEvent[];

describe("calculateMonthlyMovement", () => {
  it("対象月の現金と振込だけを口座別に集計する", () => {
    expect(calculateMonthlyMovement(cashflows, events, "2026-09")).toEqual({
      cash: 100_000,
      bank: -30_000,
      excluded: 20_000,
    });
  });
});

describe("calculateMonthlyBalance", () => {
  const input = {
    targetMonth: "2026-09",
    openingCashBalance: 10_000,
    openingBankBalance: 100_000,
    actualCashBalance: 110_000,
    actualBankBalance: 70_000,
    note: "",
    confirm: true,
  };

  it("前月末残高と月内増減から差額を計算する", () => {
    expect(calculateMonthlyBalance(input, { cash: 100_000, bank: -30_000, excluded: 0 })).toEqual({
      systemCashBalance: 110_000,
      systemBankBalance: 70_000,
      cashDifference: 0,
      bankDifference: 0,
    });
  });

  it("差額がある月の確定を拒否する", () => {
    expect(() => calculateMonthlyBalance(
      { ...input, actualCashBalance: 100_000 },
      { cash: 100_000, bank: -30_000, excluded: 0 },
    )).toThrow("差額が0円");
  });
});
