import type { AppData, Expense, Vehicle } from "../types";

export type VehicleProfit = {
  vehicleId: string;
  confirmedExpenses: number;
  plannedExpenses: number;
  revenueBasis: number;
  provisionalProfit: number;
  expectedProfit: number;
  isFinal: boolean;
};

const sumExpenses = (expenses: Expense[]): number =>
  expenses.reduce((total, expense) => total + expense.amount, 0);

export const calculateVehicleProfit = (
  vehicle: Vehicle,
  expenses: Expense[],
): VehicleProfit => {
  const related = expenses.filter((expense) => expense.vehicleId === vehicle.id);
  const confirmedExpenses = sumExpenses(
    related.filter((expense) => expense.expenseStatus === "確定"),
  );
  const plannedExpenses = sumExpenses(
    related.filter((expense) => expense.expenseStatus === "予定"),
  );
  const revenueBasis = vehicle.salePrice ?? vehicle.askingPrice;
  const provisionalProfit =
    revenueBasis - vehicle.purchasePrice - confirmedExpenses;
  const expectedProfit = provisionalProfit - plannedExpenses;
  const isFinal = ["納車済み", "廃車処分"].includes(vehicle.status) && plannedExpenses === 0;

  return {
    vehicleId: vehicle.id,
    confirmedExpenses,
    plannedExpenses,
    revenueBasis,
    provisionalProfit,
    expectedProfit,
    isFinal,
  };
};

export const getDashboardCounts = (data: AppData) => ({
  inventory: data.vehicles.filter(
    (vehicle) => !["納車済み", "廃車処分"].includes(vehicle.status),
  ).length,
  plannedArrival: data.vehicles.filter(
    (vehicle) => vehicle.status === "入庫予定",
  ).length,
  reserved: data.vehicles.filter((vehicle) => vehicle.status === "売約済み")
    .length,
  awaitingDelivery: data.vehicles.filter(
    (vehicle) => vehicle.status === "売約済み" && !vehicle.deliveredAt,
  ).length,
  unpaidIncoming: data.cashflows.filter(
    (cashflow) => cashflow.direction === "入金" && cashflow.status !== "完了",
  ).length,
  unpaidOutgoing: data.cashflows.filter(
    (cashflow) => cashflow.direction === "支払い" && cashflow.status !== "完了",
  ).length,
  missingDocuments: data.vehicles.filter(
    (vehicle) => vehicle.arrivedAt && !vehicle.documentsComplete,
  ).length,
  pendingApprovals: data.approvals.filter(
    (approval) => approval.status === "承認待ち",
  ).length,
});

export const outstandingAmount = (amount: number, processedAmount: number) =>
  Math.max(0, amount - processedAmount);
