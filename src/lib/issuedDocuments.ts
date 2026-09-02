import type { AppData, Contract, IssuedDocument, IssueDocumentInput } from "../types";

export const includedTaxAmount = (amount: number) => Math.floor(amount * 10 / 110);

export const findCompletedSaleReceipt = (data: Pick<AppData, "cashflows">, contract: Contract) =>
  data.cashflows.find((cashflow) =>
    cashflow.vehicleId === contract.vehicleId &&
    cashflow.direction === "入金" &&
    cashflow.kind === "販売代金" &&
    cashflow.status === "完了" &&
    cashflow.processedAmount === cashflow.amount,
  ) ?? null;

export const canIssueDocument = (
  data: Pick<AppData, "cashflows">,
  contract: Contract,
  type: IssueDocumentInput["documentType"],
) => {
  if (contract.type !== "販売" || contract.status !== "契約済み" || !contract.vehicleId || contract.amount <= 0) return false;
  return type === "S" || Boolean(findCompletedSaleReceipt(data, contract));
};

export const nextDemoDocumentNumber = (
  documents: IssuedDocument[],
  type: IssueDocumentInput["documentType"],
  issuedOn: string,
) => {
  const month = issuedOn.replaceAll("-", "").slice(0, 6);
  const prefix = `${type}-${month}-`;
  const latest = documents
    .map((document) => document.documentNumber)
    .filter((number) => number.startsWith(prefix))
    .map((number) => Number(number.slice(prefix.length)))
    .filter(Number.isFinite)
    .reduce((max, number) => Math.max(max, number), 0);
  return `${prefix}${String(latest + 1).padStart(4, "0")}`;
};

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const yen = (amount: number) => `¥${amount.toLocaleString("ja-JP")}`;

export const buildIssuedDocumentHtml = (document: IssuedDocument) => {
  const isInvoice = document.documentType === "S";
  const title = isInvoice ? "請求書" : "領収書";
  const taxRow = document.showTaxBreakdown
    ? `<div class="sub-row"><span>うち消費税相当額（10%）</span><strong>${yen(document.taxAmount)}</strong></div>`
    : "";
  const stampRow = document.deliveryMethod === "紙" && document.documentType === "R"
    ? `<p class="stamp">印紙確認額：${yen(document.stampDutyAmount)}（必要性・金額は税務担当へ確認）</p>`
    : `<p class="stamp">${document.deliveryMethod === "電子・PDF" ? "電子発行" : "紙発行"}</p>`;
  const note = document.note ? `<section class="note"><strong>備考</strong><p>${escapeHtml(document.note)}</p></section>` : "";

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(document.documentNumber)} ${title}</title><style>
    *{box-sizing:border-box} body{margin:0;color:#152a3b;background:#eef3f7;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif}
    .toolbar{position:sticky;top:0;display:flex;justify-content:center;padding:12px;background:#103e60}.toolbar button{padding:11px 24px;border:0;border-radius:8px;color:white;background:#0870d8;font-weight:700;cursor:pointer}
    .sheet{width:210mm;min-height:297mm;margin:16px auto;padding:20mm 18mm;background:white;box-shadow:0 8px 30px #1232}
    header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #0d587f;padding-bottom:16px}.doc-title{margin:0;font-size:30px;letter-spacing:.2em}.number{text-align:right;font-size:12px;line-height:1.8}
    .recipient{margin:34px 0 26px;font-size:20px;border-bottom:1px solid #41566a;padding-bottom:8px}.recipient strong{font-size:24px}.issuer{text-align:right;line-height:1.8}.issuer strong{font-size:18px;color:#0d587f}
    .lead{margin:32px 0 12px}.amount{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border:2px solid #163e5b;background:#f6fafc}.amount span{font-size:16px}.amount strong{font-size:28px}
    .sub-row{display:flex;justify-content:space-between;padding:10px 20px;border-bottom:1px solid #ccd8e0;font-size:12px}.details{margin-top:34px;border-collapse:collapse;width:100%}.details th,.details td{padding:13px;border:1px solid #aebfcb;text-align:left}.details th{width:28%;background:#edf4f7}.stamp{margin:24px 0;padding:10px 12px;border:1px dashed #93a8b6;font-size:11px}.note{margin-top:24px;padding:14px;background:#f5f7f9}.note p{margin:7px 0 0;white-space:pre-wrap;font-size:12px}.warning{margin-top:28px;color:#657786;font-size:10px;text-align:center}
    .void{padding:8px;color:#9f2d37;border:2px solid #9f2d37;text-align:center;font-weight:800}.sheet.voided{opacity:.72}
    @media print{body{background:white}.toolbar{display:none}.sheet{margin:0;box-shadow:none;width:auto;min-height:auto;padding:15mm}.warning{display:none}} @media(max-width:800px){.sheet{width:100%;min-height:100vh;margin:0;padding:22px 18px}.doc-title{font-size:25px}}
  </style></head><body><div class="toolbar"><button onclick="window.print()">印刷・PDF保存</button></div><main class="sheet ${document.status === "無効" ? "voided" : ""}">
    ${document.status === "無効" ? '<div class="void">無効になった発行履歴です</div>' : ""}
    <header><h1 class="doc-title">${title}</h1><div class="number">No. ${escapeHtml(document.documentNumber)}<br>発行日 ${escapeHtml(document.issuedOn.replaceAll("-", "/"))}</div></header>
    <div class="recipient"><strong>${escapeHtml(document.customerName)}</strong>　様</div>
    <div class="issuer"><strong>オーダーオート</strong><br>インボイス登録番号なし</div>
    <p class="lead">${isInvoice ? "下記のとおりご請求申し上げます。" : "下記の金額を領収いたしました。"}</p>
    <div class="amount"><span>${isInvoice ? "ご請求金額（税込）" : "領収金額（税込）"}</span><strong>${yen(document.amount)}</strong></div>${taxRow}
    <table class="details"><tr><th>対象</th><td>${escapeHtml(document.vehicleLabel)}</td></tr><tr><th>但し書き</th><td>車両代金として</td></tr><tr><th>発行方法</th><td>${escapeHtml(document.deliveryMethod)}</td></tr></table>
    ${stampRow}${note}<p class="warning">本書は適格請求書ではありません。税区分・印紙の取扱いは税務担当者へ確認してください。</p>
  </main></body></html>`;
};

export const writeIssuedDocumentWindow = (target: Window, document: IssuedDocument) => {
  target.document.open();
  target.document.write(buildIssuedDocumentHtml(document));
  target.document.close();
};
