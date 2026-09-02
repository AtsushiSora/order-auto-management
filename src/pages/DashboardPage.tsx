import {
  AlertTriangle,
  CalendarClock,
  Car,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileWarning,
  Handshake,
  HardDrive,
  Plus,
  WalletCards,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { calculateVehicleProfit, getDashboardCounts } from "../lib/calculations";
import { formatCurrency, formatDateTime } from "../lib/format";
import { readinessProgress } from "../lib/productionReadiness";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
import type { PageId } from "../types";

export function DashboardPage({
  onNavigate,
  onCreateVehicle,
}: {
  onNavigate: (page: PageId) => void;
  onCreateVehicle: () => void;
}) {
  const { data, isDemo, productionReadiness } = useAppData();
  const { profile } = useAuth();
  const canCreateVehicle = profile?.role === "owner" || profile?.role === "regular";
  const counts = getDashboardCounts(data);
  const recentVehicles = [...data.vehicles]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  const latestBackup = data.systemBackups[0];
  const backupDue = !latestBackup || Date.now() - new Date(latestBackup.createdAt).getTime() >= 30 * 24 * 60 * 60 * 1000;
  const readiness = readinessProgress(productionReadiness);

  const summaryCards = [
    {
      label: "在庫",
      value: counts.inventory,
      unit: "台",
      icon: Car,
      page: "vehicles" as PageId,
      tone: "teal",
    },
    {
      label: "入庫予定",
      value: counts.plannedArrival,
      unit: "台",
      icon: CalendarClock,
      page: "vehicles" as PageId,
      tone: "cyan",
    },
    {
      label: "売約済み",
      value: counts.reserved,
      unit: "台",
      icon: Handshake,
      page: "vehicles" as PageId,
      tone: "blue",
    },
    {
      label: "納車待ち",
      value: counts.awaitingDelivery,
      unit: "台",
      icon: ClipboardCheck,
      page: "vehicles" as PageId,
      tone: "slate",
    },
  ];

  const alertCards = [
    {
      label: "未入金",
      value: counts.unpaidIncoming,
      icon: CircleDollarSign,
      page: "payments" as PageId,
      tone: "urgent",
    },
    {
      label: "未払い",
      value: counts.unpaidOutgoing,
      icon: WalletCards,
      page: "payments" as PageId,
      tone: "warning",
    },
    {
      label: "書類不足",
      value: counts.missingDocuments,
      icon: FileWarning,
      page: "vehicles" as PageId,
      tone: "warning",
    },
    {
      label: "承認待ち",
      value: counts.pendingApprovals,
      icon: AlertTriangle,
      page: "dashboard" as PageId,
      tone: "warning",
    },
  ];

  return (
    <>
      <PageHeader
        title="TOP"
        description="今日確認が必要な業務と、最近更新された車両です。"
        action={canCreateVehicle ? (
          <button className="primary-button" type="button" onClick={onCreateVehicle}>
            <Plus size={20} />
            車両を登録
          </button>
        ) : undefined}
      />

      <section className="summary-grid" aria-label="在庫状況">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              type="button"
              key={card.label}
              className={`summary-card ${card.tone}`}
              onClick={() => onNavigate(card.page)}
            >
              <span className="summary-icon"><Icon size={28} /></span>
              <span>
                <small>{card.label}</small>
                <strong>{card.value}<em>{card.unit}</em></strong>
              </span>
            </button>
          );
        })}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <h2>確認が必要</h2>
            <p>未処理の項目は、完了するまでTOPに残ります。</p>
          </div>
        </div>
        <div className="alerts-grid">
          {alertCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                type="button"
                key={card.label}
                className={`alert-card ${card.value === 0 ? "clear" : card.tone}`}
                onClick={() => onNavigate(card.page)}
              >
                <span className="alert-icon">
                  {card.value === 0 ? <CheckCircle2 size={24} /> : <Icon size={24} />}
                </span>
                <span><small>{card.label}</small><strong>{card.value}<em>件</em></strong></span>
              </button>
            );
          })}
          {profile?.role === "owner" ? <button type="button" className={`alert-card ${backupDue ? "warning" : "success"}`} aria-label={`バックアップ状態 ${backupDue ? "要作成" : "正常"}`} onClick={() => onNavigate("settings")}>
            <span className="alert-icon">{backupDue ? <HardDrive size={24} /> : <CheckCircle2 size={24} />}</span>
            <span><small>バックアップ</small><strong className="status-word">{backupDue ? "要作成" : "正常"}</strong></span>
          </button> : null}
          {profile?.role === "owner" ? <button type="button" className={`alert-card ${productionReadiness.approvedAt ? "success" : "warning"}`} aria-label={`本番前チェック ${productionReadiness.approvedAt ? "承認済み" : `${readiness.confirmed}/${readiness.total}`}`} onClick={() => onNavigate("production-readiness")}>
            <span className="alert-icon">{productionReadiness.approvedAt ? <CheckCircle2 size={24} /> : <ClipboardCheck size={24} />}</span>
            <span><small>本番前チェック</small><strong className="status-word">{productionReadiness.approvedAt ? "承認済み" : `${readiness.confirmed}/${readiness.total}`}</strong></span>
          </button> : null}
        </div>
      </section>

      <section className="panel recent-panel">
        <div className="panel-heading">
          <div>
            <h2>最近の車両</h2>
            <p>更新日時が新しい順に表示しています。</p>
          </div>
          <button className="text-button" type="button" onClick={() => onNavigate("vehicles")}>
            在庫一覧を見る
          </button>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>管理番号</th>
                <th>車両</th>
                <th>状態</th>
                <th className="number-cell">販売価格</th>
                <th className="number-cell">予想利益</th>
                <th>更新</th>
              </tr>
            </thead>
            <tbody>
              {recentVehicles.map((vehicle) => {
                const profit = calculateVehicleProfit(vehicle, data.expenses);
                return (
                  <tr key={vehicle.id}>
                    <td><strong className="management-number">{vehicle.managementNumber}</strong></td>
                    <td>{vehicle.name}</td>
                    <td><StatusBadge>{vehicle.status}</StatusBadge></td>
                    <td className="number-cell">{formatCurrency(vehicle.askingPrice)}</td>
                    <td className={`number-cell profit-value ${profit.expectedProfit < 0 ? "negative" : ""}`}>
                      {formatCurrency(profit.expectedProfit)}
                    </td>
                    <td className="muted-cell">{formatDateTime(vehicle.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mobile-recent-list">
          {recentVehicles.map((vehicle) => {
            const profit = calculateVehicleProfit(vehicle, data.expenses);
            return (
              <button type="button" key={vehicle.id} onClick={() => onNavigate("vehicles")}>
                <span className="mobile-recent-main">
                  <small>{vehicle.managementNumber}</small>
                  <strong>{vehicle.name}</strong>
                  <StatusBadge>{vehicle.status}</StatusBadge>
                </span>
                <span className="mobile-recent-values">
                  <small>販売 {formatCurrency(vehicle.askingPrice)}</small>
                  <strong className={profit.expectedProfit < 0 ? "negative" : "positive"}>
                    利益 {formatCurrency(profit.expectedProfit)}
                  </strong>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {isDemo ? <p className="demo-note">表示中の内容は初期画面確認用の架空データです。本物のお客様情報は含まれていません。</p> : null}
    </>
  );
}
