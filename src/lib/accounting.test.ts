import { describe, expect, it } from "vitest";
import { seedData } from "../data/seed";
import { buildJournalCandidates, createJournalCsv } from "./accounting";

describe("accounting candidates", () => {
  it("creates recognition candidates from contracted sales and confirmed expenses", () => {
    const candidates = buildJournalCandidates({ ...seedData, journalCandidateReviews: [] });
    expect(candidates.some((candidate) => candidate.sourceType === "販売" && candidate.creditAccount === "売上高")).toBe(true);
    expect(candidates.some((candidate) => candidate.sourceType === "経費")).toBe(true);
    expect(candidates.every((candidate) => candidate.status === "税区分未確認")).toBe(true);
  });

  it("marks changed source data for recheck", () => {
    const base = buildJournalCandidates({ ...seedData, journalCandidateReviews: [] })[0];
    const candidates = buildJournalCandidates({
      ...seedData,
      journalCandidateReviews: [{
        id: "review-1",
        sourceKey: base.sourceKey,
        candidateDate: base.candidateDate,
        description: base.description,
        debitAccount: base.debitAccount,
        creditAccount: base.creditAccount,
        amount: base.amount,
        taxTreatment: "対象外",
        reviewStatus: "確認済み",
        sourceFingerprint: "old-fingerprint",
        note: "",
        reviewedAt: "2026-09-02T00:00:00Z",
        createdAt: "2026-09-02T00:00:00Z",
        updatedAt: "2026-09-02T00:00:00Z",
      }],
    });
    expect(candidates.find((candidate) => candidate.sourceKey === base.sourceKey)?.status).toBe("再確認");
  });

  it("exports only confirmed rows and escapes CSV text", () => {
    const candidate = buildJournalCandidates({ ...seedData, journalCandidateReviews: [] })[0];
    const csv = createJournalCsv([{ ...candidate, status: "確認済み", reviewStatus: "確認済み", taxTreatment: "対象外", description: 'テスト,"摘要"' }]);
    expect(csv).toContain('"借方科目"');
    expect(csv).toContain('"テスト,""摘要"""');
  });

  it("records an offset without treating it as a bank deposit or withdrawal", () => {
    const candidates = buildJournalCandidates({
      ...seedData,
      cashflows: [
        { id: "sale-flow", vehicleId: "vehicle-26-0001", direction: "入金", kind: "販売代金", description: "販売代金", amount: 300000, processedAmount: 100000, status: "一部", method: "振込", scheduledOn: "2026-09-02", processedOn: "2026-09-02", createdAt: "2026-09-02T00:00:00Z" },
        { id: "purchase-flow", vehicleId: "vehicle-26-0002", direction: "支払い", kind: "買取代金", description: "買取代金", amount: 100000, processedAmount: 100000, status: "完了", method: "振込", scheduledOn: "2026-09-02", processedOn: "2026-09-02", createdAt: "2026-09-02T00:00:00Z" },
      ],
      cashflowOffsets: [{ id: "offset-1", saleCashflowId: "sale-flow", purchaseCashflowId: "purchase-flow", amount: 100000, offsetOn: "2026-09-02", note: "下取り", voidedAt: null, createdAt: "2026-09-02T00:00:00Z" }],
      journalCandidateReviews: [],
    });
    const offset = candidates.find((candidate) => candidate.sourceKey === "offset:offset-1");
    expect(offset).toMatchObject({ amount: 100000, suggestedDebitAccount: "未払金", suggestedCreditAccount: "売掛金" });
    expect(candidates.some((candidate) => candidate.sourceKey === "cashflow:purchase-flow:settlement")).toBe(false);
    expect(candidates.some((candidate) => candidate.sourceKey === "cashflow:sale-flow:settlement")).toBe(false);
  });
});
