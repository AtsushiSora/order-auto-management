import { ArrowDownLeft, ArrowUpRight, Ban, CheckCircle2, LockKeyhole, Plus, Scale, WalletCards } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Drawer } from "../components/Drawer";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { outstandingAmount } from "../lib/calculations";
import { formatCurrency, formatDate } from "../lib/format";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
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
  const { data, addCashflow, completeCashflow, applyCashflowOffset, voidCashflowOffset } = useAppData();
  const { profile } = useAuth();
  const canManage = profile?.role === "owner" || profile?.role === "regular" || profile?.role === "accounting";
  const canSettleStaff = profile?.role === "owner" || profile?.role === "accounting";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<"すべて" | CashflowDirection>("すべて");
  const [statusFilter, setStatusFilter] = useState<"すべて" | "未完了" | "完了">("未完了");
  const [form, setForm] = useState<NewCashflowInput>(initialCashflow);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [listError, setListError] = useState("");
  const [offsetDrawerOpen, setOffsetDrawerOpen] = useState(false);
  const [offsetMode, setOffsetMode] = useState<"相殺する" | "相殺しない">("相殺する");
  const [saleCashflowId, setSaleCashflowId] = useState("");
  const [purchaseCashflowId, setPurchaseCashflowId] = useState("");
  const [offsetAmount, setOffsetAmount] = useState(0);
  const [offsetOn, setOffsetOn] = useState(new Date().toISOString().slice(0, 10));
  const [offsetNote, setOffsetNote] = useState("");
  const [offsetError, setOffsetError] = useState("");
  const [offsetSubmitting, setOffsetSubmitting] = useState(false);

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

  const saleCandidates = data.cashflows.filter((cashflow) =>
    cashflow.kind === "販売代金" && cashflow.direction === "入金" && outstandingAmount(cashflow.amount, cashflow.processedAmount) > 0,
  );
  const purchaseCandidates = data.cashflows.filter((cashflow) =>
    cashflow.kind === "買取代金" && cashflow.direction === "支払い" && outstandingAmount(cashflow.amount, cashflow.processedAmount) > 0,
  );
  const selectedSale = data.cashflows.find((item) => item.id === saleCashflowId) ?? null;
  const selectedPurchase = data.cashflows.find((item) => item.id === purchaseCashflowId) ?? null;
  const customerFor = (cashflowId: string, type: "買取" | "販売") => {
    const cashflow = data.cashflows.find((item) => item.id === cashflowId);
    const matches = data.contracts
      .filter((contract) => contract.type === type && contract.status === "契約済み" && contract.vehicleId === cashflow?.vehicleId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return matches[0]?.customerLabel.trim() ?? "";
  };
  const selectedSaleCustomer = customerFor(saleCashflowId, "販売");
  const selectedPurchaseCustomer = customerFor(purchaseCashflowId, "買取");
  const sameCustomer = Boolean(selectedSaleCustomer && selectedPurchaseCustomer && selectedSaleCustomer === selectedPurchaseCustomer);
  const selectedPurchaseVehicle = data.vehicles.find((item) => item.id === selectedPurchase?.vehicleId) ?? null;
  const purchaseArrived = Boolean(selectedPurchaseVehicle?.arrivedAt && selectedPurchaseVehicle.status !== "入庫予定");
  const maximumOffset = selectedSale && selectedPurchase
    ? Math.min(
      outstandingAmount(selectedSale.amount, selectedSale.processedAmount),
      outstandingAmount(selectedPurchase.amount, selectedPurchase.processedAmount),
    )
    : 0;

  const cashflowLabel = (cashflowId: string) => {
    const cashflow = data.cashflows.find((item) => item.id === cashflowId);
    const vehicle = data.vehicles.find((item) => item.id === cashflow?.vehicleId);
    return vehicle ? `${vehicle.managementNumber} ${vehicle.name}` : cashflow?.description ?? "不明";
  };

  const openOffsetForm = () => {
    const sale = saleCandidates[0];
    const purchase = purchaseCandidates[0];
    setOffsetMode("相殺する");
    setSaleCashflowId(sale?.id ?? "");
    setPurchaseCashflowId(purchase?.id ?? "");
    setOffsetAmount(sale && purchase ? Math.min(outstandingAmount(sale.amount, sale.processedAmount), outstandingAmount(purchase.amount, purchase.processedAmount)) : 0);
    setOffsetOn(new Date().toISOString().slice(0, 10));
    setOffsetNote("");
    setOffsetError("");
    setOffsetDrawerOpen(true);
  };

  const selectOffsetPair = (nextSaleId: string, nextPurchaseId: string) => {
    setSaleCashflowId(nextSaleId);
    setPurchaseCashflowId(nextPurchaseId);
    const sale = data.cashflows.find((item) => item.id === nextSaleId);
    const purchase = data.cashflows.find((item) => item.id === nextPurchaseId);
    setOffsetAmount(sale && purchase ? Math.min(outstandingAmount(sale.amount, sale.processedAmount), outstandingAmount(purchase.amount, purchase.processedAmount)) : 0);
    setOffsetError("");
  };

  const submitOffset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (offsetMode === "相殺しない") {
      setOffsetDrawerOpen(false);
      setListError("");
      return;
    }
    if (!selectedSale || !selectedPurchase) return setOffsetError("販売代金と買取代金を選択してください。");
    if (!sameCustomer) return setOffsetError("同じお客様の販売契約と買取契約を選択してください。");
    if (!purchaseArrived) return setOffsetError("買取車両の入庫を確定してから相殺してください。");
    if (!Number.isInteger(offsetAmount) || offsetAmount <= 0 || offsetAmount > maximumOffset) return setOffsetError(`相殺額は1円から${maximumOffset.toLocaleString("ja-JP")}円の範囲で入力してください。`);
    setOffsetSubmitting(true);
    setOffsetError("");
    try {
      await applyCashflowOffset(saleCashflowId, purchaseCashflowId, offsetAmount, offsetOn, offsetNote);
      setOffsetDrawerOpen(false);
    } catch (reason) {
      setOffsetError(reason instanceof Error ? reason.message : "相殺を登録できませんでした。");
    } finally {
      setOffsetSubmitting(false);
    }
  };

  const voidOffset = async (offsetId: string) => {
    if (!window.confirm("この相殺を取り消しますか？入金・支払いの残額が元に戻ります。")) return;
    setListError("");
    try { await voidCashflowOffset(offsetId); }
    catch (reason) { setListError(reason instanceof Error ? reason.message : "相殺を取り消せませんでした。"); }
  };

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

  const requestCompletion = (cashflowId: string) => {
    const cashflow = data.cashflows.find((item) => item.id === cashflowId);
    if (!cashflow || cashflow.status === "完了") return;
    const vehicle = data.vehicles.find((item) => item.id === cashflow.vehicleId);
    if (cashflow.kind === "買取代金" && vehicle?.status === "入庫予定") {
      setListError("買取代金は対象車両の入庫を確定するまで支払済みにできません。");
      return;
    }
    setListError("");
    setConfirmingId(cashflowId);
  };

  const markCompleted = async (cashflowId: string) => {
    setProcessingId(cashflowId);
    setListError("");
    try {
      await completeCashflow(cashflowId, new Date().toISOString().slice(0, 10));
      setConfirmingId(null);
    }
    catch (reason) { setListError(reason instanceof Error ? reason.message : "入出金を完了できませんでした。"); }
    finally { setProcessingId(null); }
  };

  const confirmingCashflow = data.cashflows.find((cashflow) => cashflow.id === confirmingId) ?? null;
  const confirmingVehicle = confirmingCashflow
    ? data.vehicles.find((vehicle) => vehicle.id === confirmingCashflow.vehicleId)
    : null;
  const confirmingRemaining = confirmingCashflow
    ? outstandingAmount(confirmingCashflow.amount, confirmingCashflow.processedAmount)
    : 0;

  return (
    <>
      <PageHeader
        title="入出金"
        description="販売代金の入金と、買取・経費の支払いを残額まで管理します。"
        action={canManage ? (
          <div className="header-actions">
            <button type="button" className="secondary-button" onClick={openOffsetForm}><Scale size={20} />買取・販売を相殺</button>
            <button type="button" className="primary-button" onClick={openForm}><Plus size={20} />入出金を登録</button>
          </div>
        ) : undefined}
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

      {listError ? <p className="form-error list-error">{listError}</p> : null}

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
                <th>操作</th>
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
                    <td className="cashflow-action-cell">
                      {cashflow.status === "完了" ? <span className="completed-label"><CheckCircle2 size={16} />完了</span> : cashflow.kind === "買取代金" && vehicle?.status === "入庫予定" ? <span className="locked-label"><LockKeyhole size={15} />入庫待ち</span> : cashflow.staffSettlementId && !canSettleStaff ? <span className="locked-label"><LockKeyhole size={15} />事業主・経理のみ</span> : canManage ? <button type="button" className="small-action-button" disabled={processingId === cashflow.id} onClick={() => requestCompletion(cashflow.id)}>{processingId === cashflow.id ? "処理中" : cashflow.direction === "支払い" ? "支払済みにする" : "入金済みにする"}</button> : <span className="muted-cell">閲覧のみ</span>}
                    </td>
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

      <section className="panel table-panel">
        <div className="section-heading"><div><h2>相殺履歴</h2><p>販売代金と買取代金を差し引いた記録です。</p></div></div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>相殺日</th><th>販売</th><th>買取</th><th className="number-cell">相殺額</th><th>状態</th><th>操作</th></tr></thead>
            <tbody>{data.cashflowOffsets.map((offset) => <tr key={offset.id}>
              <td>{formatDate(offset.offsetOn)}</td>
              <td><strong>{cashflowLabel(offset.saleCashflowId)}</strong></td>
              <td><strong>{cashflowLabel(offset.purchaseCashflowId)}</strong>{offset.note ? <span className="cell-note">{offset.note}</span> : null}</td>
              <td className="number-cell"><strong>{formatCurrency(offset.amount)}</strong></td>
              <td><StatusBadge children={offset.voidedAt ? "取消" : "有効"} /></td>
              <td>{!offset.voidedAt && profile?.role === "owner" ? <button type="button" className="table-action-button danger-table-button" onClick={() => void voidOffset(offset.id)}><Ban size={14} />取消</button> : <span className="muted-cell">—</span>}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {!data.cashflowOffsets.length ? <div className="table-empty"><Scale size={27} /><p>相殺記録はまだありません。</p></div> : null}
      </section>

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


      {offsetDrawerOpen ? (
        <Drawer title="買取・販売の相殺" subtitle="相殺する場合も、買取車両の入庫確認が先です。" onClose={() => setOffsetDrawerOpen(false)}>
          <form className="form-stack" onSubmit={submitOffset}>
            <div className="form-section">
              <h3>処理方法</h3>
              <div className="segmented-control large">
                {(["相殺する", "相殺しない"] as const).map((item) => <button key={item} type="button" className={offsetMode === item ? "active" : ""} onClick={() => { setOffsetMode(item); setOffsetError(""); }}>{item}</button>)}
              </div>
              {offsetMode === "相殺しない" ? <p className="form-hint">販売代金の入金と買取代金の支払いを、一覧からそれぞれ個別に完了してください。相殺記録は作成しません。</p> : null}
            </div>
            {offsetMode === "相殺する" ? <>
              <div className="form-section">
                <h3>対象の契約</h3>
                <label className="field-label">販売代金
                  <select value={saleCashflowId} onChange={(event) => selectOffsetPair(event.target.value, purchaseCashflowId)}>
                    <option value="">選択してください</option>
                    {saleCandidates.map((cashflow) => <option key={cashflow.id} value={cashflow.id}>{cashflowLabel(cashflow.id)} / {customerFor(cashflow.id, "販売")} / 残 {formatCurrency(outstandingAmount(cashflow.amount, cashflow.processedAmount))}</option>)}
                  </select>
                </label>
                <label className="field-label">買取代金
                  <select value={purchaseCashflowId} onChange={(event) => selectOffsetPair(saleCashflowId, event.target.value)}>
                    <option value="">選択してください</option>
                    {purchaseCandidates.map((cashflow) => {
                      const vehicle = data.vehicles.find((item) => item.id === cashflow.vehicleId);
                      const waiting = !vehicle?.arrivedAt || vehicle.status === "入庫予定";
                      return <option key={cashflow.id} value={cashflow.id}>{cashflowLabel(cashflow.id)} / {customerFor(cashflow.id, "買取")} / 残 {formatCurrency(outstandingAmount(cashflow.amount, cashflow.processedAmount))}{waiting ? "（入庫待ち）" : ""}</option>;
                    })}
                  </select>
                </label>
                {selectedSale && selectedPurchase ? <div className="settlement-preview"><span>お客様</span><strong>{sameCustomer ? selectedSaleCustomer : "契約者が一致しません"}</strong><small>{purchaseArrived ? "買取車両は入庫済みです" : "買取車両は入庫待ちです"}</small></div> : null}
              </div>
              <div className="form-section">
                <h3>金額・日付</h3>
                <div className="form-row">
                  <label className="field-label">相殺額<input type="number" min="1" max={maximumOffset || undefined} step="1" value={offsetAmount} onChange={(event) => setOffsetAmount(Number(event.target.value))} /></label>
                  <label className="field-label">相殺日<input type="date" max={new Date().toISOString().slice(0, 10)} value={offsetOn} onChange={(event) => setOffsetOn(event.target.value)} /></label>
                </div>
                <label className="field-label">メモ（任意）<input value={offsetNote} onChange={(event) => setOffsetNote(event.target.value)} placeholder="例：下取り車との相殺" /></label>
                <p className="form-hint">相殺後の販売代金残額：{formatCurrency(selectedSale ? outstandingAmount(selectedSale.amount, selectedSale.processedAmount) - offsetAmount : 0)} ／ 買取代金残額：{formatCurrency(selectedPurchase ? outstandingAmount(selectedPurchase.amount, selectedPurchase.processedAmount) - offsetAmount : 0)}</p>
              </div>
            </> : null}
            {offsetError ? <p className="form-error">{offsetError}</p> : null}
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={() => setOffsetDrawerOpen(false)}>キャンセル</button>
              <button type="submit" className="primary-button" disabled={offsetSubmitting}>{offsetSubmitting ? "処理中" : offsetMode === "相殺する" ? "相殺を登録" : "別々に管理する"}</button>
            </div>
          </form>
        </Drawer>
      ) : null}

      {confirmingCashflow ? (
        <Drawer
          title={confirmingCashflow.direction === "支払い" ? "支払い完了を確認" : "入金完了を確認"}
          subtitle="処理日には本日の日付を記録します。"
          onClose={() => setConfirmingId(null)}
        >
          <div className="form-stack">
            <section className="form-section">
              <h3>{confirmingCashflow.description}</h3>
              <dl className="amount-summary">
                <div><dt>対象</dt><dd>{confirmingVehicle ? `${confirmingVehicle.managementNumber} ${confirmingVehicle.name}` : "事業全体"}</dd></div>
                <div><dt>方法</dt><dd>{confirmingCashflow.method}</dd></div>
                <div><dt>処理前の残額</dt><dd>{formatCurrency(confirmingRemaining)}</dd></div>
                <div className="total"><dt>今回完了にする金額</dt><dd>{formatCurrency(confirmingRemaining)}</dd></div>
              </dl>
              <p className="form-hint">金額と実際の入出金を確認してから確定してください。</p>
            </section>
            {listError ? <p className="form-error">{listError}</p> : null}
            <div className="form-actions">
              <button type="button" className="secondary-button" disabled={processingId !== null} onClick={() => setConfirmingId(null)}>キャンセル</button>
              <button type="button" className="primary-button" disabled={processingId !== null} onClick={() => void markCompleted(confirmingCashflow.id)}>
                {processingId === confirmingCashflow.id ? "処理中" : confirmingCashflow.direction === "支払い" ? "支払済みにする" : "入金済みにする"}
              </button>
            </div>
          </div>
        </Drawer>
      ) : null}
    </>
  );
}
