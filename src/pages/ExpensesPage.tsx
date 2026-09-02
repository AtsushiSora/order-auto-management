import { Pencil, Plus, Search } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Drawer } from "../components/Drawer";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { formatCurrency, formatDate } from "../lib/format";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
import type { Expense, ExpenseStatus, PaymentMethod, PaymentStatus, SaveExpenseInput } from "../types";

const expenseCategories = [
  "部品代",
  "外注費",
  "陸送費",
  "登録費用",
  "仕入手数料",
  "販売手数料",
  "備品費",
  "その他",
];

const paymentMethods: PaymentMethod[] = ["現金", "振込", "ローン会社", "カード", "その他"];

const initialExpense = (): SaveExpenseInput => ({
  expenseId: null,
  vehicleId: null,
  category: "部品代",
  description: "",
  amount: 0,
  expenseStatus: "確定",
  paymentStatus: "未払い",
  paymentMethod: "振込",
  incurredOn: new Date().toISOString().slice(0, 10),
});

export function ExpensesPage() {
  const { data, saveExpense } = useAppData();
  const { profile } = useAuth();
  const canEdit = profile?.role === "owner" || profile?.role === "regular" || profile?.role === "accounting";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"すべて" | "車両" | "事業全体">("すべて");
  const [form, setForm] = useState<SaveExpenseInput>(initialExpense);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return data.expenses.filter((expense) => {
      const vehicle = data.vehicles.find((item) => item.id === expense.vehicleId);
      const matchesScope =
        scope === "すべて" ||
        (scope === "車両" && expense.vehicleId !== null) ||
        (scope === "事業全体" && expense.vehicleId === null);
      const matchesSearch =
        !keyword ||
        expense.category.toLowerCase().includes(keyword) ||
        expense.description.toLowerCase().includes(keyword) ||
        vehicle?.managementNumber.toLowerCase().includes(keyword) ||
        vehicle?.name.toLowerCase().includes(keyword);
      return matchesScope && Boolean(matchesSearch);
    });
  }, [data.expenses, data.vehicles, scope, search]);

  const totals = filtered.reduce(
    (result, expense) => {
      if (expense.expenseStatus === "確定") result.confirmed += expense.amount;
      else result.planned += expense.amount;
      if (expense.paymentStatus === "未払い" && expense.expenseStatus === "確定") {
        result.unpaid += expense.amount;
      }
      return result;
    },
    { confirmed: 0, planned: 0, unpaid: 0 },
  );

  const openForm = () => {
    setForm(initialExpense());
    setError("");
    setDrawerOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setForm({
      expenseId: expense.id,
      vehicleId: expense.vehicleId,
      category: expense.category,
      description: expense.description,
      amount: expense.amount,
      expenseStatus: expense.expenseStatus,
      paymentStatus: expense.paymentStatus,
      paymentMethod: expense.paymentMethod,
      incurredOn: expense.incurredOn,
    });
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
    setSubmitting(true);
    try {
      await saveExpense({ ...form, category: form.category.trim(), description: form.description.trim() });
      setDrawerOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "経費を登録できませんでした。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="経費"
        description="車両に直接かかった費用と、事業全体の経費を分けて記録します。"
        action={canEdit ? (
          <button type="button" className="primary-button" onClick={openForm}>
            <Plus size={20} />
            経費を登録
          </button>
        ) : undefined}
      />

      <section className="mini-summary-grid">
        <div className="mini-summary-card"><small>確定費用</small><strong>{formatCurrency(totals.confirmed)}</strong></div>
        <div className="mini-summary-card amber"><small>予定費用</small><strong>{formatCurrency(totals.planned)}</strong></div>
        <div className="mini-summary-card red"><small>未払い</small><strong>{formatCurrency(totals.unpaid)}</strong></div>
      </section>

      <div className="filter-bar panel">
        <label className="search-field">
          <Search size={19} />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="費用項目・内容・車両で検索" />
        </label>
        <div className="segmented-control" aria-label="経費の範囲">
          {(["すべて", "車両", "事業全体"] as const).map((item) => (
            <button key={item} type="button" className={scope === item ? "active" : ""} onClick={() => setScope(item)}>{item}</button>
          ))}
        </div>
        <div className="result-count">{filtered.length}件</div>
      </div>

      <section className="panel table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>日付</th>
                <th>対象</th>
                <th>費用項目・内容</th>
                <th>区分</th>
                <th>支払い</th>
                <th className="number-cell">金額</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((expense) => {
                const vehicle = data.vehicles.find((item) => item.id === expense.vehicleId);
                return (
                  <tr key={expense.id}>
                    <td className="muted-cell">{formatDate(expense.incurredOn)}</td>
                    <td>
                      {vehicle ? (
                        <span className="vehicle-reference"><strong>{vehicle.managementNumber}</strong><small>{vehicle.name}</small></span>
                      ) : <StatusBadge children="全体経費" />}
                    </td>
                    <td><strong>{expense.category}</strong><span className="cell-note">{expense.description}</span></td>
                    <td><StatusBadge>{expense.expenseStatus}</StatusBadge></td>
                    <td><StatusBadge>{expense.paymentStatus}</StatusBadge></td>
                    <td className="number-cell"><strong>{formatCurrency(expense.amount)}</strong></td>
                    <td>{canEdit ? <button type="button" className="text-button" onClick={() => openEdit(expense)}><Pencil size={15} />修正</button> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {drawerOpen ? (
        <Drawer title={form.expenseId ? "経費を修正" : "経費を登録"} subtitle="予定費用は予想利益だけに反映され、確定すると入出金へ連動します。" onClose={() => setDrawerOpen(false)}>
          <form className="form-stack" onSubmit={submit}>
            <div className="form-section">
              <h3>対象と内容</h3>
              <label className="field-label">
                対象
                <select value={form.vehicleId ?? ""} onChange={(event) => setForm({ ...form, vehicleId: event.target.value || null })}>
                  <option value="">事業全体の経費</option>
                  {data.vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>{vehicle.managementNumber}　{vehicle.name}</option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label className="field-label">
                  費用項目
                  <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                    {expenseCategories.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
                <label className="field-label">
                  発生日
                  <input type="date" value={form.incurredOn} onChange={(event) => setForm({ ...form, incurredOn: event.target.value })} />
                </label>
              </div>
              <label className="field-label">
                内容 <span className="required">必須</span>
                <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="何にかかった費用か入力" />
              </label>
              <label className="field-label">
                金額（税込） <span className="required">必須</span>
                <input type="number" min="0" step="1" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} />
              </label>
            </div>

            <div className="form-section">
              <h3>確定・支払い状態</h3>
              <div className="form-row">
                <label className="field-label">
                  費用区分
                  <select value={form.expenseStatus} onChange={(event) => setForm({ ...form, expenseStatus: event.target.value as ExpenseStatus, paymentStatus: event.target.value === "予定" ? "未払い" : form.paymentStatus })}>
                    <option>確定</option><option>予定</option>
                  </select>
                </label>
                <label className="field-label">
                  支払い状態
                  <select value={form.paymentStatus} onChange={(event) => setForm({ ...form, paymentStatus: event.target.value as PaymentStatus })} disabled={form.expenseStatus === "予定"}>
                    <option>未払い</option><option>支払済み</option>
                  </select>
                </label>
              </div>
              <label className="field-label">
                支払い方法
                <select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as PaymentMethod })}>
                  {paymentMethods.map((method) => <option key={method}>{method}</option>)}
                </select>
              </label>
              {form.expenseStatus === "予定" ? <p className="form-hint">予定費用は未払い一覧や帳簿には含めません。</p> : null}
              {form.expenseStatus === "確定" ? <p className="form-hint">確定費用は、同じ金額・支払い方法で入出金の「経費支払い」へ自動連携します。</p> : null}
            </div>

            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={() => setDrawerOpen(false)}>キャンセル</button>
              <button type="submit" className="primary-button" disabled={submitting}>{submitting ? "保存中" : form.expenseId ? "修正を保存" : "登録する"}</button>
            </div>
          </form>
        </Drawer>
      ) : null}
    </>
  );
}
