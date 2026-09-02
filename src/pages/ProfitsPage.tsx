import { AlertTriangle, BarChart3, CheckCircle2, TrendingUp } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { calculateVehicleProfit } from "../lib/calculations";
import { formatCurrency } from "../lib/format";
import { useAppData } from "../state/AppDataContext";

export function ProfitsPage() {
  const { data } = useAppData();
  const rows = data.vehicles.map((vehicle) => ({
    vehicle,
    profit: calculateVehicleProfit(vehicle, data.expenses),
  }));
  const expectedTotal = rows.reduce((sum, row) => sum + row.profit.expectedProfit, 0);
  const provisionalTotal = rows.reduce((sum, row) => sum + row.profit.provisionalProfit, 0);
  const plannedCosts = rows.reduce((sum, row) => sum + row.profit.plannedExpenses, 0);
  const finalizedTotal = rows.reduce((sum, row) => sum + (row.profit.isFinal ? row.profit.provisionalProfit : 0), 0);
  const finalizedCount = rows.filter((row) => row.profit.isFinal).length;

  return (
    <>
      <PageHeader
        title="利益"
        description="仕入額、確定費用、予定費用を分けて車両ごとの粗利を確認します。"
      />

      <div className="info-banner">
        <AlertTriangle size={20} />
        <div><strong>管理用の利益です</strong><span>正式な会計上の利益・申告額とは分けて表示しています。</span></div>
      </div>

      <section className="mini-summary-grid profit-summary">
        <div className="mini-summary-card teal"><small>確定粗利 {finalizedCount}台</small><strong>{formatCurrency(finalizedTotal)}</strong></div>
        <div className="mini-summary-card"><small>暫定利益 合計</small><strong>{formatCurrency(provisionalTotal)}</strong></div>
        <div className="mini-summary-card amber"><small>予定費用 合計</small><strong>{formatCurrency(plannedCosts)}</strong></div>
        <div className="mini-summary-card"><small>予想利益 合計</small><strong>{formatCurrency(expectedTotal)}</strong></div>
      </section>

      <section className="panel table-panel">
        <div className="panel-heading compact-heading">
          <div><h2>車両別利益</h2><p>販売前は現在の販売価格、売約後は契約金額を基準に計算します。</p></div>
        </div>
        <div className="table-scroll">
          <table className="data-table profit-table">
            <thead>
              <tr>
                <th>車両</th>
                <th>状態</th>
                <th className="number-cell">販売額</th>
                <th className="number-cell">仕入額</th>
                <th className="number-cell">確定費用</th>
                <th className="number-cell">予定費用</th>
                <th>利益区分</th>
                <th className="number-cell">粗利</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ vehicle, profit }) => (
                <tr key={vehicle.id}>
                  <td><span className="vehicle-reference"><strong>{vehicle.managementNumber}</strong><small>{vehicle.name}</small></span></td>
                  <td><StatusBadge>{vehicle.status}</StatusBadge></td>
                  <td className="number-cell">{formatCurrency(profit.revenueBasis)}</td>
                  <td className="number-cell muted-amount">{formatCurrency(vehicle.purchasePrice)}</td>
                  <td className="number-cell muted-amount">{formatCurrency(profit.confirmedExpenses)}</td>
                  <td className="number-cell planned-amount">{formatCurrency(profit.plannedExpenses)}</td>
                  <td><StatusBadge children={profit.isFinal ? "確定" : "予定"} /></td>
                  <td className={`number-cell profit-value ${profit.expectedProfit < 0 ? "negative" : ""}`}>
                    <strong>{formatCurrency(profit.isFinal ? profit.provisionalProfit : profit.expectedProfit)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="profit-explanation-grid">
        <article className="explanation-card"><span><CheckCircle2 size={22} /></span><div><h3>確定粗利</h3><p>納車済みまたは廃車処分で、予定費用が残っていない車両の粗利</p></div></article>
        <article className="explanation-card"><span><TrendingUp size={22} /></span><div><h3>暫定利益</h3><p>販売額 − 仕入額 − 金額が確定している車両経費</p></div></article>
        <article className="explanation-card"><span><BarChart3 size={22} /></span><div><h3>予想利益</h3><p>暫定利益から、まだ確定していない予定費用も差し引いた金額</p></div></article>
      </section>
    </>
  );
}
