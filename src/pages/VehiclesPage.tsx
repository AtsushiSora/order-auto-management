import {
  Car,
  CheckCircle2,
  FileWarning,
  Filter,
  Pencil,
  Plus,
  ReceiptText,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Drawer } from "../components/Drawer";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { calculateVehicleProfit } from "../lib/calculations";
import { formatCurrency, formatDate } from "../lib/format";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
import type {
  AcquisitionSource,
  Expense,
  ExpenseStatus,
  NewExpenseInput,
  NewVehicleInput,
  PaymentStatus,
  Vehicle,
  VehicleDocument,
  VehicleDocumentInput,
  VehicleDocumentType,
  VehicleStatus,
} from "../types";

const vehicleStatuses: VehicleStatus[] = ["入庫予定", "入庫済み", "販売中", "売約済み", "納車済み", "廃車処分"];
const acquisitionSources: AcquisitionSource[] = ["一般のお客様", "オークション", "業者", "保険関係"];
const requiredDocumentTypes: VehicleDocumentType[] = ["車検証", "譲渡証明書", "印鑑証明", "住民票", "申請依頼書", "自賠責保険"];
const documentTypes: VehicleDocumentType[] = [...requiredDocumentTypes, "その他"];
const expenseCategories = ["部品代", "外注費", "陸送費", "登録費用", "仕入手数料", "販売手数料", "その他"];

const initialVehicleForm = (): NewVehicleInput => ({
  name: "",
  chassisNumber: "",
  status: "入庫予定",
  acquisitionSource: "一般のお客様",
  purchasePrice: 0,
  askingPrice: 0,
  storageLocation: "自宅",
  plannedArrivalDate: new Date().toISOString().slice(0, 10),
});

const initialExpense = (vehicleId: string): NewExpenseInput => ({
  vehicleId,
  category: "部品代",
  description: "",
  amount: 0,
  expenseStatus: "確定",
  paymentStatus: "未払い",
  incurredOn: new Date().toISOString().slice(0, 10),
});

export function VehiclesPage({
  openNewForm = false,
  onNewFormOpened,
}: {
  openNewForm?: boolean;
  onNewFormOpened?: () => void;
}) {
  const { data, addVehicle, updateVehicle, updateVehicleDocument, archiveVehicle, addExpense } = useAppData();
  const { profile } = useAuth();
  const canEdit = profile?.role === "owner" || profile?.role === "regular";
  const isOwner = profile?.role === "owner";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | "すべて">("すべて");
  const [drawerMode, setDrawerMode] = useState<"new" | "detail" | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [form, setForm] = useState<NewVehicleInput>(initialVehicleForm);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filteredVehicles = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return data.vehicles.filter((vehicle) => {
      const matchesStatus = statusFilter === "すべて" || vehicle.status === statusFilter;
      const matchesKeyword = !keyword || vehicle.managementNumber.toLowerCase().includes(keyword) || vehicle.name.toLowerCase().includes(keyword) || vehicle.chassisNumber.toLowerCase().includes(keyword);
      return matchesStatus && matchesKeyword;
    });
  }, [data.vehicles, search, statusFilter]);

  const selectedVehicle = data.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
  const selectedDocuments = data.vehicleDocuments.filter((document) => document.vehicleId === selectedVehicleId);

  const openNewVehicle = () => {
    setForm(initialVehicleForm());
    setFormError("");
    setDrawerMode("new");
  };

  useEffect(() => {
    if (!openNewForm) return;
    setForm(initialVehicleForm());
    setFormError("");
    setDrawerMode("new");
    onNewFormOpened?.();
  }, [openNewForm, onNewFormOpened]);

  const submitVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim()) return setFormError("車両名を入力してください。");
    if (!form.storageLocation.trim()) return setFormError("保管場所を入力してください。");
    if (!form.plannedArrivalDate) return setFormError("入庫予定日を入力してください。");
    if (form.purchasePrice < 0 || form.askingPrice < 0) return setFormError("金額は0円以上で入力してください。");
    setSubmitting(true);
    try {
      const vehicle = await addVehicle({ ...form, name: form.name.trim(), chassisNumber: form.chassisNumber.trim(), storageLocation: form.storageLocation.trim() });
      setSelectedVehicleId(vehicle.id);
      setDrawerMode("detail");
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "車両を登録できませんでした。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader title="在庫" description="入庫予定から納車済みまで、車両ごとの取引を管理します。" action={canEdit ? <button type="button" className="primary-button" onClick={openNewVehicle}><Plus size={20} />車両を登録</button> : undefined} />

      <div className="filter-bar panel">
        <label className="search-field"><Search size={19} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="管理番号・車両名・車台番号で検索" /></label>
        <label className="select-field compact"><Filter size={18} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as VehicleStatus | "すべて")}><option value="すべて">すべての状態</option>{vehicleStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <div className="result-count">{filteredVehicles.length}台</div>
      </div>

      <section className="vehicle-card-grid">
        {filteredVehicles.map((vehicle) => {
          const profit = calculateVehicleProfit(vehicle, data.expenses);
          return (
            <button type="button" className="vehicle-card" key={vehicle.id} onClick={() => { setSelectedVehicleId(vehicle.id); setDrawerMode("detail"); }}>
              <div className="vehicle-card-top"><span className="vehicle-thumbnail"><Car size={31} /></span><StatusBadge>{vehicle.status}</StatusBadge></div>
              <div className="vehicle-card-title"><small>{vehicle.managementNumber}</small><h2>{vehicle.name}</h2><p>{vehicle.acquisitionSource}</p></div>
              <dl className="vehicle-card-values"><div><dt>販売価格</dt><dd>{formatCurrency(vehicle.askingPrice)}</dd></div><div><dt>予想利益</dt><dd className={profit.expectedProfit < 0 ? "negative" : "positive"}>{formatCurrency(profit.expectedProfit)}</dd></div></dl>
              <div className={`document-indicator ${vehicle.documentsComplete ? "complete" : "missing"}`}>{vehicle.documentsComplete ? <CheckCircle2 size={17} /> : <FileWarning size={17} />}{vehicle.documentsComplete ? "必要書類 確認済み" : "書類の確認が必要"}</div>
            </button>
          );
        })}
      </section>

      {filteredVehicles.length === 0 ? <div className="empty-state panel"><Car size={34} /><h2>該当する車両がありません</h2><p>検索条件を変更するか、新しい車両を登録してください。</p></div> : null}

      {drawerMode === "new" ? (
        <Drawer title="車両を登録" subtitle="0円買取の場合は仕入額を0円で登録できます。" onClose={() => setDrawerMode(null)}>
          <form className="form-stack" onSubmit={submitVehicle}>
            <div className="form-section">
              <h3>基本情報</h3>
              <label className="field-label">車両名 <span className="required">必須</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例：メーカー 車種 グレード" autoFocus /></label>
              <label className="field-label">車台番号<input value={form.chassisNumber} onChange={(event) => setForm({ ...form, chassisNumber: event.target.value })} placeholder="入庫後の入力・修正もできます" /></label>
              <div className="form-row">
                <label className="field-label">仕入れ元<select value={form.acquisitionSource} onChange={(event) => setForm({ ...form, acquisitionSource: event.target.value as AcquisitionSource })}>{acquisitionSources.map((source) => <option key={source}>{source}</option>)}</select></label>
                <label className="field-label">状態<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as VehicleStatus })}>{vehicleStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
              </div>
            </div>
            <div className="form-section">
              <h3>金額・入庫</h3>
              <div className="form-row">
                <label className="field-label">仕入額（税込）<input type="number" min="0" step="1" value={form.purchasePrice} onChange={(event) => setForm({ ...form, purchasePrice: Number(event.target.value) })} /></label>
                <label className="field-label">販売予定価格（税込）<input type="number" min="0" step="1" value={form.askingPrice} onChange={(event) => setForm({ ...form, askingPrice: Number(event.target.value) })} /></label>
              </div>
              <div className="form-row">
                <label className="field-label">入庫予定日 <span className="required">必須</span><input type="date" value={form.plannedArrivalDate} onChange={(event) => setForm({ ...form, plannedArrivalDate: event.target.value })} /></label>
                <label className="field-label">保管場所 <span className="required">必須</span><input value={form.storageLocation} onChange={(event) => setForm({ ...form, storageLocation: event.target.value })} /></label>
              </div>
            </div>
            {formError ? <p className="form-error">{formError}</p> : null}
            <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setDrawerMode(null)}>キャンセル</button><button type="submit" className="primary-button" disabled={submitting}>{submitting ? "登録中" : "登録する"}</button></div>
          </form>
        </Drawer>
      ) : null}

      {drawerMode === "detail" && selectedVehicle ? <VehicleDetailDrawer vehicle={selectedVehicle} documents={selectedDocuments} expenses={data.expenses} canEdit={canEdit} isOwner={isOwner} onClose={() => setDrawerMode(null)} onUpdate={(patch) => updateVehicle(selectedVehicle.id, patch)} onDocumentUpdate={updateVehicleDocument} onAddExpense={addExpense} onArchive={async () => { await archiveVehicle(selectedVehicle.id); setDrawerMode(null); }} /> : null}
    </>
  );
}

function VehicleDetailDrawer({
  vehicle, documents, expenses, onClose, onUpdate, onDocumentUpdate, onAddExpense, onArchive, canEdit, isOwner,
}: {
  vehicle: Vehicle;
  documents: VehicleDocument[];
  expenses: Expense[];
  onClose: () => void;
  onUpdate: (patch: Partial<Vehicle>) => Promise<void>;
  onDocumentUpdate: (input: VehicleDocumentInput) => Promise<VehicleDocument>;
  onAddExpense: (input: NewExpenseInput) => Promise<void>;
  onArchive: () => Promise<void>;
  canEdit: boolean;
  isOwner: boolean;
}) {
  const profit = calculateVehicleProfit(vehicle, expenses);
  const vehicleExpenses = expenses.filter((expense) => expense.vehicleId === vehicle.id);
  const [editMode, setEditMode] = useState(false);
  const [expenseMode, setExpenseMode] = useState(false);
  const [editForm, setEditForm] = useState<Vehicle>({ ...vehicle });
  const [expenseForm, setExpenseForm] = useState<NewExpenseInput>(initialExpense(vehicle.id));
  const [updateError, setUpdateError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setEditForm({ ...vehicle }), [vehicle]);

  const commitUpdate = async (patch: Partial<Vehicle>) => {
    setUpdateError("");
    try { await onUpdate(patch); }
    catch (reason) { setUpdateError(reason instanceof Error ? reason.message : "変更を保存できませんでした。"); }
  };

  const changeStatus = async (status: VehicleStatus) => {
    const patch: Partial<Vehicle> = { status };
    if (status !== "入庫予定" && !vehicle.arrivedAt) patch.arrivedAt = new Date().toISOString().slice(0, 10);
    if (status === "納車済み" && !vehicle.deliveredAt) patch.deliveredAt = new Date().toISOString().slice(0, 10);
    await commitUpdate(patch);
  };

  const saveVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editForm.name.trim() || !editForm.storageLocation.trim() || !editForm.plannedArrivalDate) return setUpdateError("車両名・保管場所・入庫予定日は必ず入力してください。");
    if (editForm.purchasePrice < 0 || editForm.askingPrice < 0 || (editForm.salePrice ?? 0) < 0) return setUpdateError("金額は0円以上で入力してください。");
    setBusy(true);
    try {
      await onUpdate({ name: editForm.name.trim(), chassisNumber: editForm.chassisNumber.trim(), acquisitionSource: editForm.acquisitionSource, purchasePrice: editForm.purchasePrice, askingPrice: editForm.askingPrice, salePrice: editForm.salePrice, storageLocation: editForm.storageLocation.trim(), plannedArrivalDate: editForm.plannedArrivalDate, arrivedAt: editForm.arrivedAt, deliveredAt: editForm.deliveredAt });
      setEditMode(false);
    } catch (reason) { setUpdateError(reason instanceof Error ? reason.message : "車両情報を保存できませんでした。"); }
    finally { setBusy(false); }
  };

  const toggleDocument = async (documentType: VehicleDocumentType, isReceived: boolean) => {
    const current = documents.find((document) => document.documentType === documentType);
    setBusy(true);
    setUpdateError("");
    try {
      const updated = await onDocumentUpdate({ vehicleId: vehicle.id, documentType, isRequired: documentType !== "その他", isReceived, receivedAt: isReceived ? new Date().toISOString().slice(0, 10) : null, note: current?.note ?? "" });
      const nextDocuments = [...documents.filter((document) => document.documentType !== documentType), updated];
      const complete = requiredDocumentTypes.every((type) => nextDocuments.some((document) => document.documentType === type && document.isReceived));
      if (complete !== vehicle.documentsComplete) await onUpdate({ documentsComplete: complete });
    } catch (reason) { setUpdateError(reason instanceof Error ? reason.message : "書類の状態を保存できませんでした。"); }
    finally { setBusy(false); }
  };

  const saveExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!expenseForm.description.trim() || expenseForm.amount <= 0) return setUpdateError("経費の内容と1円以上の金額を入力してください。");
    setBusy(true);
    setUpdateError("");
    try { await onAddExpense({ ...expenseForm, description: expenseForm.description.trim() }); setExpenseForm(initialExpense(vehicle.id)); setExpenseMode(false); }
    catch (reason) { setUpdateError(reason instanceof Error ? reason.message : "経費を登録できませんでした。"); }
    finally { setBusy(false); }
  };

  const archive = async () => {
    if (!window.confirm(`${vehicle.managementNumber} ${vehicle.name}を管理一覧から削除しますか？\n売約済みにする場合は「売約済みに変更」を使用してください。`)) return;
    setBusy(true);
    try { await onArchive(); }
    catch (reason) { setUpdateError(reason instanceof Error ? reason.message : "車両を削除できませんでした。"); setBusy(false); }
  };

  return (
    <Drawer title={vehicle.name} subtitle={vehicle.managementNumber} onClose={onClose}>
      <div className="detail-hero"><span className="vehicle-thumbnail large"><Car size={42} /></span><div><StatusBadge>{vehicle.status}</StatusBadge><p>{vehicle.acquisitionSource}</p></div></div>

      <section className="detail-section">
        <div className="section-heading"><h3>進行状況</h3>{canEdit ? <button type="button" className="text-button" onClick={() => setEditMode((current) => !current)}><Pencil size={15} />{editMode ? "編集を閉じる" : "車両情報を編集"}</button> : null}</div>
        <label className="field-label">車両の状態<select value={vehicle.status} disabled={!canEdit || busy} onChange={(event) => void changeStatus(event.target.value as VehicleStatus)}>{vehicleStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        {canEdit && vehicle.status !== "売約済み" && vehicle.status !== "納車済み" ? <button type="button" className="secondary-button full-button" disabled={busy} onClick={() => void changeStatus("売約済み")}>売約済みに変更</button> : null}
        {!canEdit ? <p className="form-hint">経理権限では車両情報を閲覧できますが、変更はできません。</p> : null}
      </section>

      {editMode ? (
        <form className="detail-section" onSubmit={saveVehicle}>
          <h3>車両情報を編集</h3>
          <label className="field-label">車両名 <span className="required">必須</span><input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label>
          <label className="field-label">車台番号<input value={editForm.chassisNumber} onChange={(event) => setEditForm({ ...editForm, chassisNumber: event.target.value })} /></label>
          <div className="form-row">
            <label className="field-label">仕入れ元<select value={editForm.acquisitionSource} onChange={(event) => setEditForm({ ...editForm, acquisitionSource: event.target.value as AcquisitionSource })}>{acquisitionSources.map((source) => <option key={source}>{source}</option>)}</select></label>
            <label className="field-label">保管場所<input value={editForm.storageLocation} onChange={(event) => setEditForm({ ...editForm, storageLocation: event.target.value })} /></label>
          </div>
          <div className="form-row">
            <label className="field-label">仕入額（税込）<input type="number" min="0" value={editForm.purchasePrice} onChange={(event) => setEditForm({ ...editForm, purchasePrice: Number(event.target.value) })} /></label>
            <label className="field-label">販売予定価格（税込）<input type="number" min="0" value={editForm.askingPrice} onChange={(event) => setEditForm({ ...editForm, askingPrice: Number(event.target.value) })} /></label>
          </div>
          <label className="field-label">実際の販売価格（税込）<input type="number" min="0" value={editForm.salePrice ?? ""} placeholder="未販売なら空欄" onChange={(event) => setEditForm({ ...editForm, salePrice: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          <div className="form-row">
            <label className="field-label">入庫予定日<input type="date" value={editForm.plannedArrivalDate} onChange={(event) => setEditForm({ ...editForm, plannedArrivalDate: event.target.value })} /></label>
            <label className="field-label">実際の入庫日<input type="date" value={editForm.arrivedAt ?? ""} onChange={(event) => setEditForm({ ...editForm, arrivedAt: event.target.value || null })} /></label>
          </div>
          <label className="field-label">納車日<input type="date" value={editForm.deliveredAt ?? ""} onChange={(event) => setEditForm({ ...editForm, deliveredAt: event.target.value || null })} /></label>
          <button type="submit" className="primary-button full-button" disabled={busy}><Save size={17} />{busy ? "保存中" : "変更を保存"}</button>
        </form>
      ) : (
        <section className="detail-section"><h3>車両情報</h3><dl className="detail-list"><div><dt>車台番号</dt><dd>{vehicle.chassisNumber || "未入力"}</dd></div><div><dt>保管場所</dt><dd>{vehicle.storageLocation}</dd></div><div><dt>入庫予定日</dt><dd>{formatDate(vehicle.plannedArrivalDate)}</dd></div><div><dt>実際の入庫日</dt><dd>{formatDate(vehicle.arrivedAt)}</dd></div><div><dt>納車日</dt><dd>{formatDate(vehicle.deliveredAt)}</dd></div></dl></section>
      )}

      <section className="detail-section">
        <h3>必要書類</h3><p className="section-note">受け取った書類を1つずつ確認します。「その他」は必要な場合だけ使います。</p>
        <div className="document-checklist">
          {documentTypes.map((type) => {
            const document = documents.find((item) => item.documentType === type);
            return <label className="document-check" key={type}><input type="checkbox" checked={document?.isReceived ?? false} disabled={!canEdit || busy} onChange={(event) => void toggleDocument(type, event.target.checked)} /><span><strong>{type}</strong><small>{document?.isReceived ? `${formatDate(document.receivedAt)} 受領` : type === "その他" ? "必要な場合に確認" : "未受領"}</small></span></label>;
          })}
        </div>
      </section>

      <section className="detail-section">
        <div className="section-heading"><h3>車両経費</h3>{canEdit ? <button type="button" className="text-button" onClick={() => setExpenseMode((current) => !current)}><ReceiptText size={15} />{expenseMode ? "入力を閉じる" : "経費を追加"}</button> : null}</div>
        {expenseMode ? (
          <form className="inline-form" onSubmit={saveExpense}>
            <div className="form-row"><label className="field-label">費用項目<select value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })}>{expenseCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label className="field-label">発生日<input type="date" value={expenseForm.incurredOn} onChange={(event) => setExpenseForm({ ...expenseForm, incurredOn: event.target.value })} /></label></div>
            <label className="field-label">内容 <span className="required">必須</span><input value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} placeholder="例：タイヤ交換" /></label>
            <label className="field-label">金額（税込） <span className="required">必須</span><input type="number" min="1" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: Number(event.target.value) })} /></label>
            <div className="form-row"><label className="field-label">費用区分<select value={expenseForm.expenseStatus} onChange={(event) => setExpenseForm({ ...expenseForm, expenseStatus: event.target.value as ExpenseStatus, paymentStatus: event.target.value === "予定" ? "未払い" : expenseForm.paymentStatus })}><option>確定</option><option>予定</option></select></label><label className="field-label">支払い<select value={expenseForm.paymentStatus} disabled={expenseForm.expenseStatus === "予定"} onChange={(event) => setExpenseForm({ ...expenseForm, paymentStatus: event.target.value as PaymentStatus })}><option>未払い</option><option>支払済み</option></select></label></div>
            <button type="submit" className="primary-button full-button" disabled={busy}>経費を登録</button>
          </form>
        ) : null}
        {vehicleExpenses.length ? <div className="compact-expense-list">{vehicleExpenses.slice(0, 5).map((expense) => <div key={expense.id}><span><strong>{expense.category}</strong><small>{expense.description}</small></span><span><strong>{formatCurrency(expense.amount)}</strong><small>{expense.expenseStatus}・{expense.paymentStatus}</small></span></div>)}</div> : <p className="section-note">登録済みの車両経費はありません。</p>}
      </section>

      <section className="detail-section"><h3>利益の確認</h3><dl className="amount-summary"><div><dt>販売価格</dt><dd>{formatCurrency(profit.revenueBasis)}</dd></div><div><dt>仕入額</dt><dd>− {formatCurrency(vehicle.purchasePrice)}</dd></div><div><dt>確定費用</dt><dd>− {formatCurrency(profit.confirmedExpenses)}</dd></div><div><dt>予定費用</dt><dd>− {formatCurrency(profit.plannedExpenses)}</dd></div><div className="total"><dt>予想利益</dt><dd className={profit.expectedProfit < 0 ? "negative" : "positive"}>{formatCurrency(profit.expectedProfit)}</dd></div></dl></section>

      {updateError ? <p className="form-error drawer-error">{updateError}</p> : null}
      {isOwner ? <section className="detail-section vehicle-delete-zone"><h3>車両を削除</h3><p>売約済みは履歴を残します。登録自体を取り消す場合だけ削除してください。監査記録は安全のため残ります。</p><button type="button" className="danger-button" disabled={busy} onClick={() => void archive()}><Trash2 size={16} />管理一覧から削除</button></section> : null}
    </Drawer>
  );
}
