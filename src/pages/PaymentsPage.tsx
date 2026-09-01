import { ArrowDownLeft, ArrowUpRight, Plus, WalletCards } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Drawer } from "../components/Drawer";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { outstandingAmount } from "../lib/calculations";
import { formatCurrency, formatDate } from "../lib/format";
import { useAppData } from "../state/AppDataContext";
import type {
  CashflowDirection,
  CashflowStatus,
  NewCashflowInput,
  PaymentMethod,
} from "../types";

const initialCashflow = (): NewCashflowInput => ({
  vehicleId: null,
  direction: "入金",
  description: "販売代金",
  amount: 0,
  processedAmount: 0,
  status: "未処理",
  method: "振込",
  scheduledOn: new Date().toISOString().slice(0, 10),
  processedOn: null,
});

const methods: PaymentMethod[] = ["現金", "振込", "ローン会社", "カード", "その他"];

export function PaymentsPage() {
  const { data, addCashflow } = useAppData();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<"すべて" | CashflowDirection>("すべて");
  const [statusFilter, setStatusFilter] = useState<"すべて" | "未完了" | "完了">("未完了");
  const [form, setForm] = useState<NewCashflowInput>(initialCashflow);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filtered = data.cashflows.filter((cashflow) => {
    const matchesDirection = directionFilter === "すべて" || cashflow.direction === directionFilter;
    const matchesStatus =
      statusFilter === "すべて" ||
      (statusFilter === "未完了" && cashflow.status !== "完了") ||
      (statusFilter === "完了" && cashflow.status === "完了");
    return matchesDirection && matchesStatus;
  });

  const totals = data.cashflows.reduce(
    (result, cashflow) => {
      const remaining = outstandingAmount(cashflow.amount, cashflow.processedAmount);
      if (cashflow.direction === "入金") result.incoming += remaining;
      else result.outgoing += remaining;
      return result;
    },
    { incoming: 0, outgoing: 0 },
  );

  const openForm = () => {
    setForm(initialCashflow());
    setError("");
    setDrawerOpen(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.description.trim()) {
      setError("内容を入力してください。");
      return;
    }
    if (form.amount <= 0) {
      setError("金額は1円以上で入力してください。");
      return;
    }
    if (form.processedAmount < 0 || form.processedAmount > form.amount) {
      setError("処理済み額は0円から合計金額の範囲で入力してください。");
      return;
    }
    const vehicle = data.vehicles.find((item) => item.id === form.vehicleId);
    const isPurchasePayment = form.direction === "支払い" && form.description.includes("買取");
    if (isPurchasePayment && vehicle?.status === "入庫予定" && form.processedAmount > 0) {
      setError("買取代金は車両を入庫済みにするまで支払い登録できません。");
      return;
    }

    const status: CashflowStatus =
      form.processedAmount === 0 ? "未処理" : form.processedAmount >= form.amount ? "完了" : "一部";
    setSubmitting(true);
    try {
      await addCashflow({
        ...form,
        description: form.description.trim(),
        status,
        processedOn: form.processedAmount > 0 ? new Date().toISOString().slice(0, 10) : null,
      });
      setDrawerOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "入出金を登録できませんでした。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="入出金"
        description="販売代金の入金と、買取・経費の支払いを残額まで管理します。"
        action={
          <button type="button" className="primary-button" onClick={openForm}>
            <Plus size={20} />
            入出金を登録
          </button>
        }
      />

      <section className="cashflow-summary-grid">
        <div className="cashflow-summary incoming">
          <span><ArrowDownLeft size={23} /></span>
          <div><small>未入金残額</small><strong>{formatCurrency(totals.incoming)}</strong></div>
        </div>
        <div className="cashflow-summary outgoing">
          <span><ArrowUpRight size={23} /></span>
          <div><small>未払い残額</small><strong>{formatCurrency(totals.outgoing)}</strong></div>
        </div>
      </section>

      <div className="filter-bar panel">
        <div className="segmented-control" aria-label="入出金区分">
          {(["すべて", "入金", "支払い"] as const).map((item) => (
            <button key={item} type="button" className={directionFilter === item ? "active" : ""} onClick={() => setDirectionFilter(item)}>{item}</button>
          ))}
        </div>
        <div className="segmented-control" aria-label="処理状態">
          {(["未完了", "完了", "すべて"] as const).map((item) => (
            <button key={item} type="button" className={statusFilter === item ? "active" : ""} onClick={() => setStatusFilter(item)}>{item}</button>
          ))}
        </div>
        <div className="result-count">{filtered.length}件</div>
      </div>

      <section className="panel table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>予定日</th>
                <th>区分</th>
                <th>対象・内容</th>
                <th>方法</th>
                <th>状態</th>
                <th className="number-cell">合計</th>
                <th className="number-cell">残額</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cashflow) => {
                const vehicle = data.vehicles.find((item) => item.id === cashflow.vehicleId);
                const remaining = outstandingAmount(cashflow.amount, cashflow.processedAmount);
                return (
                  <tr key={cashflow.id}>
                    <td className="muted-cell">{formatDate(cashflow.scheduledOn)}</td>
                    <td><span className={`direction-label ${cashflow.direction === "入金" ? "incoming" : "outgoing"}`}>{cashflow.direction === "入金" ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}{cashflow.direction}</span></td>
                    <td>
                      <strong>{cashflow.description}</strong>
                      {vehicle ? <span className="cell-note">{vehicle.managementNumber}　{vehicle.name}</span> : <span className="cell-note">事業全体</span>}
                    </td>
                    <td>{cashflow.method}</td>
                    <td><StatusBadge>{cashflow.status}</StatusBadge></td>
                    <td className="number-cell">{formatCurrency(cashflow.amount)}</td>
                    <td className={`number-cell ${remaining > 0 ? "remaining-value" : ""}`}><strong>{formatCurrency(remaining)}</strong></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="empty-state panel"><WalletCards size={34} /><h2>該当する入出金はありません</h2><p>表示条件を変更してください。</p></div>
      ) : null}

      {drawerOpen ? (
        <Drawer title="入出金を登録" subtitle="未処理や一部入金も残額として管理できます。" onClose={() => setDrawerOpen(false)}>
          <form className="form-stack" onSubmit={submit}>
            <div className="form-section">
              <h3>取引内容</h3>
              <div className="segmented-control large">
                {(["入金", "支払い"] as const).map((item) => (
                  <button key={item} type="button" className={form.direction === item ? "active" : ""} onClick={() => setForm({ ...form, direction: item, description: item === "入金" ? "販売代金" : "買取代金" })}>{item}</button>
                ))}
              </div>
              <label className="field-label">
                対象車両
                <select value={form.vehicleId ?? ""} onChange={(event) => setForm({ ...form, vehicleId: event.target.value || null })}>
                  <option value="">事業全体・車両なし</option>
                  {data.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.managementNumber}　{vehicle.name}（{vehicle.status}）</option>)}
                </select>
              </label>
              <label className="field-label">
                内容 <span className="required">必須</span>
                <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </label>
              <div className="form-row">
                <label className="field-label">
                  合計金額
                  <input type="number" min="0" step="1" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} />
                </label>
                <label className="field-label">
                  今回の処理済み額
                  <input type="number" min="0" step="1" value={form.processedAmount} onChange={(event) => setForm({ ...form, processedAmount: Number(event.target.value) })} />
                </label>
              </div>
            </div>

            <div className="form-section">
              <h3>方法・日付</h3>
              <div className="form-row">
                <label className="field-label">
                  方法
                  <select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value as PaymentMethod })}>
                    {methods.map((method) => <option key={method}>{method}</option>)}
                  </select>
                </label>
                <label className="field-label">
                  予定日
                  <input type="date" value={form.scheduledOn} onChange={(event) => setForm({ ...form, scheduledOn: event.target.value })} />
                </label>
              </div>
              <p className="form-hint">買取代金は対象車両が「入庫予定」の間は、処理済み額を登録できません。</p>
            </div>

            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={() => setDrawerOpen(false)}>キャンセル</button>
              <button type="submit" className="primary-button" disabled={submitting}>{submitting ? "登録中" : "登録する"}</button>
            </div>
          </form>
        </Drawer>
      ) : null}
    </>
  );
}
