import type { PageId, ProductionReadiness, ProductionReadinessCheck, ProductionReadinessCheckKey, ReadinessCheckStatus } from "../types";

export const productionReadinessItems: Array<{
  key: ProductionReadinessCheckKey;
  category: "取引" | "帳簿・経理" | "権限・連携" | "安全確認";
  title: string;
  description: string;
  steps: string[];
  targetPage?: PageId;
  targetLabel?: string;
}> = [
  { key: "purchase_standard", category: "取引", title: "通常買取", description: "契約から入庫、必要書類の確認、買取代金の支払いまでを確認", targetPage: "purchase-contracts", targetLabel: "買取契約を開く", steps: ["架空のお客様・車両・買取金額で買取契約を契約済みにする", "在庫で車両本体と必要書類を受取済みにし、入庫を確定する", "入出金で買取代金が未払いになり、支払済みに変更できることを確認する"] },
  { key: "purchase_zero", category: "取引", title: "0円買取", description: "0円契約、入庫、古物台帳への登録までを確認", targetPage: "purchase-contracts", targetLabel: "買取契約を開く", steps: ["買取金額を0円にして契約済みまで進める", "在庫と受取書類を確認して入庫を確定する", "0円の支払い行は作られず、古物台帳には取引として表示されることを確認する"] },
  { key: "sale_delivery", category: "取引", title: "販売・納車", description: "販売契約、入金、売約済み表示、納車済みへの変更を確認", targetPage: "sales-contracts", targetLabel: "販売契約を開く", steps: ["販売中の架空車両を選び、販売契約を契約済みにする", "在庫が売約済みになり、販売代金が未入金で作られることを確認する", "全額入金後に納車済みへ変更し、販売サイト表示が設定どおり残ることを確認する"] },
  { key: "trade_in", category: "取引", title: "下取り", description: "販売と買取を相殺する場合・相殺しない場合の両方を確認", targetPage: "payments", targetLabel: "入出金を開く", steps: ["同じお客様の架空の販売代金と買取代金を用意する", "入庫後に相殺し、差額と元の入出金履歴が正しいことを確認する", "別の架空案件では相殺せず、それぞれ入金・支払いできることを確認する"] },
  { key: "auction_scrap", category: "取引", title: "オークション・廃車", description: "オークション販売と廃車処分の入出金・利益を確認", targetPage: "vehicles", targetLabel: "在庫を開く", steps: ["入庫済み車両をオークションへ振り分け、売却額と手数料を確定する", "別の入庫済み車両を廃車へ振り分け、入金0円の場合も処理できることを確認する", "入出金・経費・利益・古物台帳へそれぞれ反映されたことを確認する"] },
  { key: "cashflow", category: "取引", title: "入出金", description: "現金・振込・分割処理と、未入金・未払い表示を確認", targetPage: "payments", targetLabel: "入出金を開く", steps: ["現金と振込の入出金をそれぞれ1件ずつ処理する", "一部だけ処理し、残額が未入金・未払いとして残ることを確認する", "全額処理後にTOPの未処理件数が減ることを確認する"] },
  { key: "expenses_profit", category: "帳簿・経理", title: "経費・証憑・利益", description: "車両経費、事業経費、添付資料、販売後の費用追加と利益再計算を確認", targetPage: "expenses", targetLabel: "経費を開く", steps: ["車両に部品代を、車両なしでプリンター代などの事業経費を登録する", "領収書または請求書の架空ファイルを添付して開けることを確認する", "販売後に費用を追加し、車両別利益が再計算されることを確認する"] },
  { key: "antique_ledger", category: "帳簿・経理", title: "古物台帳", description: "自動連携、本人確認項目、不足表示、印刷内容を確認", targetPage: "antique-ledger", targetLabel: "古物台帳を開く", steps: ["契約・入庫済みの架空車両が自動で表示されることを確認する", "住所・職業・年齢・本人確認方法など不足項目を入力する", "記録済みに変わり、印刷画面に必要情報だけが表示されることを確認する"] },
  { key: "documents_accounting", category: "帳簿・経理", title: "S・Rと経理", description: "S・R発行、税区分、月次残高、会計CSVを確認", targetPage: "issued-documents", targetLabel: "S・R発行を開く", steps: ["契約済み取引でSを、販売代金入金後にRを発行する", "税込・税抜・消費税と印紙代の表示を確認する", "経理画面で月次残高を確認し、確認済み仕訳だけCSV出力する"] },
  { key: "staff_settlement", category: "帳簿・経理", title: "スタッフ精算", description: "固定額・手入力・粗利率、支給・請求、確定後の入出金連携を確認", targetPage: "staff-settlements", targetLabel: "スタッフ精算を開く", steps: ["固定額・手入力・粗利率の架空精算予定を作る", "最終金額を確定し、必要ならスタッフへの請求も作る", "確定後だけ入出金に連携され、精算済みにできることを確認する"] },
  { key: "permissions", category: "権限・連携", title: "利用者権限", description: "事業主・経理・通常・スポットの表示範囲、利用停止、30分ログアウトを確認", targetPage: "settings", targetLabel: "設定を開く", steps: ["事業主・経理・通常・スポットで表示されるメニューを確認する", "スポットスタッフが担当案件と紹介料確認以外を操作できないことを確認する", "事業主が利用停止・復活を行え、30分無操作でログアウトすることを確認する"] },
  { key: "contract_site_links", category: "権限・連携", title: "契約・サイト連携", description: "買取契約、販売契約、販売サイト、廃車サイトとの連携を確認", targetPage: "site-integration", targetLabel: "サイト連携を開く", steps: ["管理画面から買取・販売契約へ進み、車両と金額が引き継がれることを確認する", "販売中の車両を公開し、販売サイトへ反映されることを確認する", "販売サイト・廃車サイトの架空問い合わせが管理画面へ届き、対応状況を変更できることを確認する"] },
  { key: "real_devices", category: "安全確認", title: "実機", description: "iPhone、Android、Mac、Windows、タブレットで主要操作を確認", targetPage: "dashboard", targetLabel: "TOPを開く", steps: ["iPhone SEとAndroidでログイン・在庫・契約・入出金を確認する", "MacBookとWindowsで一覧、入力、印刷、CSV出力を確認する", "iPadで契約入力と署名画面を確認し、横ずれや押せないボタンがないことを確認する"] },
  { key: "backup_restore", category: "安全確認", title: "バックアップ・復元", description: "Supabase、Google Drive、追加復元・全上書き復元を架空データで確認", targetPage: "settings", targetLabel: "設定を開く", steps: ["架空データの手動バックアップを作り、ダウンロードとGoogle Drive保存を確認する", "架空データを変更して追加復元し、既存データを残して復元されることを確認する", "最後に全上書き復元を試し、バックアップ時点へ戻ることを確認する"] },
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
