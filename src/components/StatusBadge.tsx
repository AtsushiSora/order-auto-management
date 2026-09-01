import type {
  CashflowStatus,
  ContractStatus,
  ExpenseStatus,
  PaymentStatus,
  VehicleStatus,
} from "../types";

type BadgeValue =
  | VehicleStatus
  | ExpenseStatus
  | PaymentStatus
  | CashflowStatus
  | ContractStatus
  | "正常"
  | "全体経費";

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
};

export function StatusBadge({ children }: { children: BadgeValue }) {
  return <span className={`status-badge ${toneByValue[children]}`}>{children}</span>;
}

