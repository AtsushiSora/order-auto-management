import type { ProductionReadiness, ProductionReadinessCheck, ProductionReadinessCheckKey, ReadinessCheckStatus } from "../types";

export const productionReadinessItems: Array<{
  key: ProductionReadinessCheckKey;
  category: "取引" | "帳簿・経理" | "権限・連携" | "安全確認";
  title: string;
  description: string;
}> = [
  { key: "purchase_standard", category: "取引", title: "通常買取", description: "契約から入庫、必要書類の確認、買取代金の支払いまでを確認" },
  { key: "purchase_zero", category: "取引", title: "0円買取", description: "0円契約、入庫、古物台帳への登録までを確認" },
  { key: "sale_delivery", category: "取引", title: "販売・納車", description: "販売契約、入金、売約済み表示、納車済みへの変更を確認" },
  { key: "trade_in", category: "取引", title: "下取り", description: "販売と買取を相殺する場合・相殺しない場合の両方を確認" },
  { key: "auction_scrap", category: "取引", title: "オークション・廃車", description: "オークション販売と廃車処分の入出金・利益を確認" },
  { key: "cashflow", category: "取引", title: "入出金", description: "現金・振込・分割処理と、未入金・未払い表示を確認" },
  { key: "expenses_profit", category: "帳簿・経理", title: "経費・証憑・利益", description: "車両経費、事業経費、添付資料、販売後の費用追加と利益再計算を確認" },
  { key: "antique_ledger", category: "帳簿・経理", title: "古物台帳", description: "自動連携、本人確認項目、不足表示、印刷内容を確認" },
  { key: "documents_accounting", category: "帳簿・経理", title: "S・Rと経理", description: "S・R発行、税区分、月次残高、会計CSVを確認" },
  { key: "staff_settlement", category: "帳簿・経理", title: "スタッフ精算", description: "固定額・手入力・粗利率、支給・請求、確定後の入出金連携を確認" },
  { key: "permissions", category: "権限・連携", title: "利用者権限", description: "事業主・経理・通常・スポットの表示範囲、利用停止、30分ログアウトを確認" },
  { key: "contract_site_links", category: "権限・連携", title: "契約・サイト連携", description: "買取契約、販売契約、販売サイト、廃車サイトとの連携を確認" },
  { key: "real_devices", category: "安全確認", title: "実機", description: "iPhone、Android、Mac、Windows、タブレットで主要操作を確認" },
  { key: "backup_restore", category: "安全確認", title: "バックアップ・復元", description: "Supabase、Google Drive、追加復元・全上書き復元を架空データで確認" },
];

export const emptyProductionReadiness = (): ProductionReadiness => ({
  checks: {},
  approvedAt: null,
  approvedBy: null,
  updatedAt: null,
});

const isStatus = (value: unknown): value is ReadinessCheckStatus =>
  value === "未確認" || value === "確認済み" || value === "要修正";

const statusFromDb = (value: unknown): ReadinessCheckStatus => {
  if (value === "passed") return "確認済み";
  if (value === "needs_fix") return "要修正";
  return isStatus(value) ? value : "未確認";
};

export const statusToDb = (status: ReadinessCheckStatus) => ({
  未確認: "pending",
  確認済み: "passed",
  要修正: "needs_fix",
})[status];

export const normalizeProductionReadiness = (value: unknown, updatedAt?: unknown): ProductionReadiness => {
  if (!value || typeof value !== "object") return emptyProductionReadiness();
  const source = value as Record<string, unknown>;
  const rawChecks = source.checks && typeof source.checks === "object"
    ? source.checks as Record<string, unknown>
    : {};
  const checks: Partial<Record<ProductionReadinessCheckKey, ProductionReadinessCheck>> = {};

  for (const item of productionReadinessItems) {
    const raw = rawChecks[item.key];
    if (!raw || typeof raw !== "object") continue;
    const check = raw as Record<string, unknown>;
    checks[item.key] = {
      status: statusFromDb(check.status),
      note: typeof check.note === "string" ? check.note : "",
      checkedAt: typeof check.checkedAt === "string" ? check.checkedAt : null,
    };
  }

  return {
    checks,
    approvedAt: typeof source.approvedAt === "string" ? source.approvedAt : null,
    approvedBy: typeof source.approvedBy === "string" ? source.approvedBy : null,
    updatedAt: typeof updatedAt === "string" ? updatedAt : null,
  };
};

export const readinessProgress = (readiness: ProductionReadiness) => {
  const confirmed = productionReadinessItems.filter((item) => readiness.checks[item.key]?.status === "確認済み").length;
  const needsFix = productionReadinessItems.filter((item) => readiness.checks[item.key]?.status === "要修正").length;
  return { confirmed, needsFix, total: productionReadinessItems.length, complete: confirmed === productionReadinessItems.length };
};
