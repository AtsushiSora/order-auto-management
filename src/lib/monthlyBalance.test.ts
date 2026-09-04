import { describe, expect, it } from "vitest";
import type { Cashflow, CashflowEvent } from "../types";
import { calculateMonthlyBalance, calculateMonthlyMovement, monthlyBalanceNeedsRecheck } from "./monthlyBalance";

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

describe("monthlyBalanceNeedsRecheck", () => {
  const confirmed = {
    status: "確定",
    cashMovement: 15_000,
    bankMovement: 200_000,
  } as Parameters<typeof monthlyBalanceNeedsRecheck>[0];

  it("確定後に現金または口座の増減が変わった場合は再確認にする", () => {
    expect(monthlyBalanceNeedsRecheck(confirmed, { cash: 15_000, bank: 455_000, excluded: 0 })).toBe(true);
  });

  it("確定時と増減が同じ場合は確定を維持する", () => {
    expect(monthlyBalanceNeedsRecheck(confirmed, { cash: 15_000, bank: 200_000, excluded: 0 })).toBe(false);
  });
});
