import type {
  AppData,
  Cashflow,
  JournalCandidate,
  JournalCandidateReview,
  TaxTreatment,
} from "../types";

const paymentAccount = (cashflow: Cashflow) => {
  if (cashflow.method === "現金") return "現金";
  if (cashflow.method === "振込") return "普通預金";
  if (cashflow.method === "カード") return cashflow.direction === "支払い" ? "未払金" : "未収入金";
  return "要確認";
};

const fingerprint = (date: string, amount: number, description: string) =>
  `${date}|${amount}|${description.trim()}`;

type CandidateBase = Pick<
  JournalCandidate,
  | "sourceKey"
  | "sourceType"
  | "candidateDate"
  | "description"
  | "vehicleLabel"
  | "amount"
  | "suggestedDebitAccount"
  | "suggestedCreditAccount"
>;

const withReview = (
  candidate: CandidateBase,
  reviews: JournalCandidateReview[],
): JournalCandidate => {
  const sourceFingerprint = fingerprint(
    candidate.candidateDate,
    candidate.amount,
    candidate.description,
  );
  const review = reviews.find((item) => item.sourceKey === candidate.sourceKey);
  const isStale = Boolean(review && review.sourceFingerprint !== sourceFingerprint);
  const taxTreatment = review?.taxTreatment ?? "未確認";
  const reviewStatus = review?.reviewStatus ?? "確認待ち";
  const status = isStale
    ? "再確認"
    : taxTreatment === "未確認"
      ? "税区分未確認"
      : reviewStatus;
  return {
    ...candidate,
    sourceFingerprint,
    debitAccount: review?.debitAccount || candidate.suggestedDebitAccount,
    creditAccount: review?.creditAccount || candidate.suggestedCreditAccount,
    taxTreatment,
    reviewStatus: isStale ? "確認待ち" : reviewStatus,
    status,
    note: review?.note ?? "",
    reviewedAt: isStale ? null : review?.reviewedAt ?? null,
  };
};

export const buildJournalCandidates = (
  data: Pick<AppData, "vehicles" | "contracts" | "expenses" | "cashflows" | "cashflowOffsets" | "journalCandidateReviews">,
): JournalCandidate[] => {
  const vehicleName = (vehicleId: string | null) => {
    if (!vehicleId) return "事業全体";
    const vehicle = data.vehicles.find((item) => item.id === vehicleId);
    return vehicle ? `${vehicle.managementNumber} ${vehicle.name}` : "車両不明";
  };

  const candidates: CandidateBase[] = [];
  const contractedPurchaseVehicleIds = new Set<string>();
  const contractedSaleVehicleIds = new Set<string>();

  data.contracts
    .filter((contract) => contract.status === "契約済み" && contract.amount > 0)
    .forEach((contract) => {
      if (contract.vehicleId) {
        (contract.type === "買取" ? contractedPurchaseVehicleIds : contractedSaleVehicleIds).add(contract.vehicleId);
      }
      const label = vehicleName(contract.vehicleId);
      candidates.push({
        sourceKey: `contract:${contract.id}:recognition`,
        sourceType: contract.type,
        candidateDate: contract.contractedOn,
        description: `${contract.type}契約 ${contract.customerLabel} / ${label}`,
        vehicleLabel: label,
        amount: contract.amount,
        suggestedDebitAccount: contract.type === "買取" ? "商品" : "売掛金",
        suggestedCreditAccount: contract.type === "買取" ? "未払金" : "売上高",
      });
    });

  data.vehicles.forEach((vehicle) => {
    if (vehicle.arrivedAt && vehicle.purchasePrice > 0 && !contractedPurchaseVehicleIds.has(vehicle.id)) {
      candidates.push({
        sourceKey: `vehicle:${vehicle.id}:purchase`,
        sourceType: "買取",
        candidateDate: vehicle.arrivedAt,
        description: `在庫直接登録による仕入 ${vehicle.managementNumber} ${vehicle.name}`,
        vehicleLabel: `${vehicle.managementNumber} ${vehicle.name}`,
        amount: vehicle.purchasePrice,
        suggestedDebitAccount: "商品",
        suggestedCreditAccount: "未払金",
      });
    }
    if (vehicle.salePrice && vehicle.salePrice > 0 && !contractedSaleVehicleIds.has(vehicle.id) && ["売約済み", "納車済み"].includes(vehicle.status)) {
      candidates.push({
        sourceKey: `vehicle:${vehicle.id}:sale`,
        sourceType: "販売",
        candidateDate: vehicle.deliveredAt ?? vehicle.updatedAt.slice(0, 10),
        description: `契約外の販売登録 ${vehicle.managementNumber} ${vehicle.name}`,
        vehicleLabel: `${vehicle.managementNumber} ${vehicle.name}`,
        amount: vehicle.salePrice,
        suggestedDebitAccount: "売掛金",
        suggestedCreditAccount: "売上高",
      });
    }
  });

  data.expenses
    .filter((expense) => expense.expenseStatus === "確定")
    .forEach((expense) => {
      const label = vehicleName(expense.vehicleId);
      candidates.push({
        sourceKey: `expense:${expense.id}:recognition`,
        sourceType: "経費",
        candidateDate: expense.incurredOn,
        description: `${expense.category} ${expense.description} / ${label}`,
        vehicleLabel: label,
        amount: expense.amount,
        suggestedDebitAccount: expense.category,
        suggestedCreditAccount: "未払金",
      });
    });

  const activeOffsets = data.cashflowOffsets.filter((offset) => !offset.voidedAt);
  const offsetAmountFor = (cashflowId: string) => activeOffsets
    .filter((offset) => offset.saleCashflowId === cashflowId || offset.purchaseCashflowId === cashflowId)
    .reduce((total, offset) => total + offset.amount, 0);

  data.cashflows
    .filter((cashflow) => cashflow.processedAmount - offsetAmountFor(cashflow.id) > 0 && cashflow.processedOn)
    .forEach((cashflow) => {
      const incoming = cashflow.direction === "入金";
      const settlementAccount = cashflow.kind === "販売代金"
        ? "売掛金"
        : cashflow.kind === "買取代金" || cashflow.kind === "経費支払い"
          ? "未払金"
          : "要確認";
      const label = vehicleName(cashflow.vehicleId);
      candidates.push({
        sourceKey: `cashflow:${cashflow.id}:settlement`,
        sourceType: incoming ? "入金" : "支払い",
        candidateDate: cashflow.processedOn!,
        description: `${cashflow.description} / ${label}`,
        vehicleLabel: label,
        amount: cashflow.processedAmount - offsetAmountFor(cashflow.id),
        suggestedDebitAccount: incoming ? paymentAccount(cashflow) : settlementAccount,
        suggestedCreditAccount: incoming ? settlementAccount : paymentAccount(cashflow),
      });
    });

  activeOffsets.forEach((offset) => {
    const sale = data.cashflows.find((cashflow) => cashflow.id === offset.saleCashflowId);
    const purchase = data.cashflows.find((cashflow) => cashflow.id === offset.purchaseCashflowId);
    const saleLabel = vehicleName(sale?.vehicleId ?? null);
    const purchaseLabel = vehicleName(purchase?.vehicleId ?? null);
    candidates.push({
      sourceKey: `offset:${offset.id}`,
      sourceType: "支払い",
      candidateDate: offset.offsetOn,
      description: `販売代金・買取代金の相殺 / 販売 ${saleLabel} / 買取 ${purchaseLabel}`,
      vehicleLabel: `${saleLabel} ⇄ ${purchaseLabel}`,
      amount: offset.amount,
      suggestedDebitAccount: "未払金",
      suggestedCreditAccount: "売掛金",
    });
  });

  return candidates
    .map((candidate) => withReview(candidate, data.journalCandidateReviews))
    .sort((left, right) => right.candidateDate.localeCompare(left.candidateDate) || left.sourceKey.localeCompare(right.sourceKey));
};

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

export const taxTreatmentLabels: TaxTreatment[] = [
  "未確認",
  "課税10%",
  "課税8%",
  "非課税",
  "免税",
  "対象外",
];

export const createJournalCsv = (candidates: JournalCandidate[]): string => {
  const rows = candidates
    .filter((candidate) => candidate.status === "確認済み")
    .sort((left, right) => left.candidateDate.localeCompare(right.candidateDate))
    .map((candidate) => [
      candidate.candidateDate,
      candidate.debitAccount,
      candidate.amount,
      candidate.creditAccount,
      candidate.amount,
      candidate.taxTreatment,
      candidate.description,
      candidate.sourceKey,
    ]);
  const header = ["日付", "借方科目", "借方金額", "貸方科目", "貸方金額", "税区分", "摘要", "元取引キー"];
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
};
