import { describe, expect, it } from "vitest";
import type { AppData, Contract, IssuedDocument } from "../types";
import { buildIssuedDocumentHtml, canIssueDocument, includedTaxAmount, nextDemoDocumentNumber } from "./issuedDocuments";

const contract: Contract = {
  id: "contract", type: "販売", vehicleId: "vehicle", customerId: null, customerLabel: "テスト顧客", amount: 110000,
  status: "契約済み", contractedOn: "2026-09-01", updatedAt: "2026-09-01T00:00:00Z",
};

describe("S・R発行", () => {
  it("Sは契約済み、Rは販売代金の入金完了後だけ発行できる", () => {
    expect(canIssueDocument({ cashflows: [] }, contract, "S")).toBe(true);
    expect(canIssueDocument({ cashflows: [] }, contract, "R")).toBe(false);
    const cashflows: AppData["cashflows"] = [{
      id: "cashflow", vehicleId: "vehicle", direction: "入金", kind: "販売代金", description: "販売代金",
      amount: 110000, processedAmount: 110000, status: "完了", method: "振込", scheduledOn: "2026-09-01",
      processedOn: "2026-09-02", createdAt: "2026-09-01T00:00:00Z",
    }];
    expect(canIssueDocument({ cashflows }, contract, "R")).toBe(true);
  });

  it("内税10%は1円未満を切り捨てる", () => {
    expect(includedTaxAmount(110000)).toBe(10000);
    expect(includedTaxAmount(1000)).toBe(90);
  });

  it("S・Rを月別の4桁連番で採番する", () => {
    const documents = [{ documentNumber: "S-202609-0002" }] as IssuedDocument[];
    expect(nextDemoDocumentNumber(documents, "S", "2026-09-02")).toBe("S-202609-0003");
    expect(nextDemoDocumentNumber(documents, "R", "2026-09-02")).toBe("R-202609-0001");
  });

  it("印刷HTMLへ入力文字をそのまま実行可能な形で出さない", () => {
    const html = buildIssuedDocumentHtml({
      id: "id", documentType: "S", documentNumber: "S-202609-0001", contractId: "contract",
      vehicleId: "vehicle", cashflowId: null, customerName: "<script>alert(1)</script>",
      vehicleLabel: "26-0001 テスト車", amount: 110000, showTaxBreakdown: false, taxAmount: 0,
      deliveryMethod: "電子・PDF", stampDutyAmount: 0, issuedOn: "2026-09-02", note: "<b>備考</b>",
      status: "有効", createdAt: "2026-09-02T00:00:00Z",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("インボイス登録番号なし");
  });
});
