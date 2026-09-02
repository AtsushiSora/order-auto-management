import type {
  CashflowStatus,
  ContractStatus,
  ExpenseStatus,
  PaymentStatus,
  VehicleStatus,
  WebsiteInquiryStatus,
} from "../types";

type BadgeValue =
  | VehicleStatus
  | ExpenseStatus
  | PaymentStatus
  | CashflowStatus
  | ContractStatus
  | WebsiteInquiryStatus
  | "掲載中"
  | "非公開"
  | "正常"
  | "全体経費"
  | "精算済み"
  | "取消"
  | "有効"
  | "無効";

const toneByValue: Record<BadgeValue, string> = {
  入庫予定: "blue",
  入庫済み: "cyan",
  販売中: "green",
  売約済み: "slate",
  納車済み: "purple",
  廃車処分: "dark",
  予定: "amber",
  確定: "green",
  未払い: "red",
  支払済み: "green",
  未処理: "red",
  一部: "amber",
  完了: "green",
  下書き: "slate",
  署名待ち: "amber",
  契約済み: "green",
  キャンセル済み: "dark",
  正常: "green",
  全体経費: "purple",
  精算済み: "green",
  取消: "dark",
  新着: "red",
  対応中: "amber",
  掲載中: "green",
  非公開: "slate",
  有効: "green",
  無効: "dark",
};

export function StatusBadge({ children }: { children: BadgeValue }) {
  return <span className={`status-badge ${toneByValue[children]}`}>{children}</span>;
}
