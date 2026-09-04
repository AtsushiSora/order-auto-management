import type { Cashflow, CashflowEvent, MonthlyBalanceCheck, SaveMonthlyBalanceCheckInput } from "../types";

export type MonthlyMovement = {
  cash: number;
  bank: number;
  excluded: number;
};

/**
 * 月次確定後に入出金が追加・訂正された場合は、以前の確定をそのまま
 * 信用せず、実残高との照合をやり直す。
 */
export function monthlyBalanceNeedsRecheck(
  check: MonthlyBalanceCheck | undefined,
  movement: MonthlyMovement,
) {
  return check?.status === "確定"
    && (check.cashMovement !== movement.cash || check.bankMovement !== movement.bank);
}

export function calculateMonthlyMovement(
  cashflows: Cashflow[],
  events: CashflowEvent[],
  targetMonth: string,
): MonthlyMovement {
  const cashflowById = new Map(cashflows.map((cashflow) => [cashflow.id, cashflow]));
  return events
    .filter((event) => event.processedOn.startsWith(targetMonth))
    .reduce<MonthlyMovement>((result, event) => {
      const cashflow = cashflowById.get(event.cashflowId);
      if (!cashflow) return result;
      const signedAmount = cashflow.direction === "入金" ? event.amount : -event.amount;
      if (event.method === "現金") result.cash += signedAmount;
      else if (event.method === "振込") result.bank += signedAmount;
      else result.excluded += Math.abs(event.amount);
      return result;
    }, { cash: 0, bank: 0, excluded: 0 });
}

export function calculateMonthlyBalance(
  input: SaveMonthlyBalanceCheckInput,
  movement: MonthlyMovement,
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.targetMonth)) {
    throw new Error("対象月を確認してください。");
  }
  const amounts = [
    input.openingCashBalance,
    input.openingBankBalance,
    input.actualCashBalance,
    input.actualBankBalance,
  ];
  if (amounts.some((amount) => !Number.isInteger(amount) || amount < 0)) {
    throw new Error("残高は0円以上の整数で入力してください。");
  }
  const systemCashBalance = input.openingCashBalance + movement.cash;
  const systemBankBalance = input.openingBankBalance + movement.bank;
  const cashDifference = input.actualCashBalance - systemCashBalance;
  const bankDifference = input.actualBankBalance - systemBankBalance;
  if (input.confirm && (cashDifference !== 0 || bankDifference !== 0)) {
    throw new Error("現金と事業用口座の差額が0円になるまで月次確定できません。");
  }
  return { systemCashBalance, systemBankBalance, cashDifference, bankDifference };
}
