import {
  Car,
  CheckCircle2,
  CircleDollarSign,
  FileWarning,
  Filter,
  Gavel,
  Pencil,
  PackageCheck,
  Plus,
  ReceiptText,
  Recycle,
  Save,
  ScanLine,
  Search,
  Truck,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Drawer } from "../components/Drawer";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { VehicleInspectionImportDrawer } from "../components/VehicleInspectionImportDrawer";
import { VehicleQrReaderDrawer } from "../components/VehicleQrReaderDrawer";
import { calculateVehicleProfit, outstandingAmount } from "../lib/calculations";
import { formatCurrency, formatDate } from "../lib/format";
import { findVehicleInspectionDuplicate } from "../lib/vehicleInspection";
import {
  isVehicleReceiptChecklistComplete,
  vehicleDocumentInputForStatus,
  vehicleReceiptChecklistTypes,
  vehicleReceiptStatus,
  type VehicleReceiptStatus,
} from "../lib/vehicleReceiptChecklist";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
import type {
  AcquisitionSource,
  Cashflow,
  CompleteVehicleDispositionInput,
  Expense,
  ExpenseStatus,
  NewExpenseInput,
  NewVehicleInput,
  PaymentMethod,
  PaymentStatus,
  Vehicle,
  VehicleDocument,
  VehicleDocumentInput,
  VehicleDocumentType,
  VehicleDisposition,
  VehicleStatus,
  VehicleInspectionData,
  VehicleModelOption,
} from "../types";

const vehicleStatuses: VehicleStatus[] = ["入庫予定", "入庫済み", "販売中", "売約済み", "納車済み", "廃車処分"];
const acquisitionSources: AcquisitionSource[] = ["一般のお客様", "オークション", "業者", "保険関係"];
const vehicleDispositions: VehicleDisposition[] = ["未定", "販売", "オークション", "廃車"];
const expenseCategories = ["部品代", "外注費", "陸送費", "登録費用", "仕入手数料", "販売手数料", "その他"];
const expensePaymentMethods: PaymentMethod[] = ["現金", "振込", "ローン会社", "カード", "その他"];
const vehicleMakers = ["トヨタ", "レクサス", "日産", "ホンダ", "マツダ", "スバル", "スズキ", "ダイハツ", "三菱", "いすゞ", "日野", "メルセデス・ベンツ", "BMW", "MINI", "アウディ", "フォルクスワーゲン", "ボルボ", "プジョー", "シトロエン", "ルノー", "フィアット", "ジープ", "テスラ", "その他"];
const vehicleDisplayName = (maker: string, model: string, grade: string) => [maker, model, grade].map((value) => value.trim()).filter(Boolean).join(" ");

const initialVehicleForm = (): NewVehicleInput => ({
  name: "",
  maker: "",
  model: "",
  grade: "",
  chassisNumber: "",
  modelType: "",
  registrationNumber: "",
  firstRegistration: "",
  inspectionExpiry: "",
  bodyColor: "",
  mileage: "",
  status: "入庫予定",
  acquisitionSource: "一般のお客様",
  disposition: "未定",
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
  paymentMethod: "振込",
  incurredOn: new Date().toISOString().slice(0, 10),
});

export function VehiclesPage({
  openNewForm = false,
  onNewFormOpened,
}: {
  openNewForm?: boolean;
  onNewFormOpened?: () => void;
}) {
  const { data, addVehicle, updateVehicle, rememberVehicleModelOption, updateVehicleModelOption, deleteVehicleModelOption, completeVehicleDisposition, applyVehicleInspectionImport, markVehicleArrived, markVehicleDelivered, updateVehicleDocument, archiveVehicle, addExpense, completeCashflow } = useAppData();
  const { profile } = useAuth();
  const canEdit = profile?.role === "owner" || profile?.role === "regular";
  const canManagePayments = profile?.role === "owner" || profile?.role === "regular" || profile?.role === "accounting";
  const isOwner = profile?.role === "owner";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VehicleStatus | "すべて">("すべて");
  const [drawerMode, setDrawerMode] = useState<"new" | "detail" | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [form, setForm] = useState<NewVehicleInput>(initialVehicleForm);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inspectionImportOpen, setInspectionImportOpen] = useState(false);
  const [registrationQrOpen, setRegistrationQrOpen] = useState(false);
  const [modelOptionsOpen, setModelOptionsOpen] = useState(false);

  const modelSuggestions = useMemo(() => [...new Set(data.vehicleModelOptions.filter((item) => !form.maker || item.maker === form.maker).map((item) => item.model))], [data.vehicleModelOptions, form.maker]);

  const filteredVehicles = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return data.vehicles.filter((vehicle) => {
      const matchesStatus = statusFilter === "すべて" || vehicle.status === statusFilter;
      const matchesKeyword = !keyword || [vehicle.managementNumber, vehicle.name, vehicle.maker, vehicle.model, vehicle.grade, vehicle.chassisNumber].some((value) => value.toLowerCase().includes(keyword));
      return matchesStatus && matchesKeyword;
    });
  }, [data.vehicles, search, statusFilter]);

  const selectedVehicle = data.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
  const selectedDocuments = data.vehicleDocuments.filter((document) => document.vehicleId === selectedVehicleId);

  const openNewVehicle = () => {
    setForm(initialVehicleForm());
    setFormError("");
    setFormMessage("");
    setDrawerMode("new");
  };

  const openNewVehicleFromQr = () => {
    setForm(initialVehicleForm());
    setFormError("");
    setFormMessage("");
    setDrawerMode("new");
    setRegistrationQrOpen(true);
  };

  const applyQrToNewVehicle = (result: VehicleInspectionData) => {
    const duplicate = findVehicleInspectionDuplicate(data.vehicles, result);
    if (duplicate) {
      setFormError(`同じ車両が在庫にあります（${duplicate.managementNumber}　${duplicate.name}）。新規登録せず、登録済み車両への反映を使用してください。`);
      setFormMessage("");
      return;
    }
    const detectedMaker = vehicleMakers.find((maker) => maker === result.vehicleName.trim());
    setForm((current) => ({
      ...current,
      maker: detectedMaker ?? current.maker,
      chassisNumber: result.chassisNumber || current.chassisNumber,
      registrationNumber: result.registrationNumber || current.registrationNumber,
      firstRegistration: result.firstRegistration || current.firstRegistration,
      inspectionExpiry: result.inspectionExpiry || current.inspectionExpiry,
      modelType: result.modelType || current.modelType,
    }));
    setFormError("");
    setFormMessage("QRから車検証情報を入力しました。メーカー・車種・金額などを確認して登録してください。");
  };

  useEffect(() => {
    if (!openNewForm) return;
    setForm(initialVehicleForm());
    setFormError("");
    setFormMessage("");
    setDrawerMode("new");
    onNewFormOpened?.();
  }, [openNewForm, onNewFormOpened]);

  const submitVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.maker.trim()) return setFormError("メーカーを選択してください。");
    if (!form.model.trim()) return setFormError("車種を入力してください。");
    if (!form.storageLocation.trim()) return setFormError("保管場所を入力してください。");
    if (!form.plannedArrivalDate) return setFormError("入庫予定日を入力してください。");
    if (form.purchasePrice < 0 || form.askingPrice < 0) return setFormError("金額は0円以上で入力してください。");
    setSubmitting(true);
    try {
      const vehicle = await addVehicle({ ...form, name: vehicleDisplayName(form.maker, form.model, form.grade), maker: form.maker.trim(), model: form.model.trim(), grade: form.grade.trim(), chassisNumber: form.chassisNumber.trim(), storageLocation: form.storageLocation.trim() });
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
      <PageHeader title="在庫" description="入庫予定から納車済みまで、車両ごとの取引を管理します。" action={canEdit ? <div className="page-header-actions">{isOwner ? <button type="button" className="secondary-button" onClick={() => setModelOptionsOpen(true)}>車種候補を管理</button> : null}<button type="button" className="secondary-button" onClick={() => setInspectionImportOpen(true)}><ScanLine size={19} />登録済み車両へ反映</button><button type="button" className="primary-button" onClick={openNewVehicleFromQr}><ScanLine size={19} />QRから新規登録</button><button type="button" className="primary-button vehicle-header-register" onClick={openNewVehicle}><Plus size={20} />手入力で登録</button></div> : undefined} />

      <div className="filter-bar panel">
        <label className="search-field"><Search size={19} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="管理番号・メーカー・車種・グレード・車台番号で検索" /></label>
        <label className="select-field compact vehicle-status-select"><Filter size={18} /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as VehicleStatus | "すべて")}><option value="すべて">すべての状態</option>{vehicleStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <div className="mobile-status-filter" aria-label="車両状態で絞り込む">
          {["すべて" as const, ...vehicleStatuses].map((status) => (
            <button key={status} type="button" className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)}>{status}</button>
          ))}
        </div>
        <div className="result-count">{filteredVehicles.length}台</div>
      </div>

      <section className="vehicle-card-grid">
        {filteredVehicles.map((vehicle) => {
          const profit = calculateVehicleProfit(vehicle, data.expenses);
          return (
            <button type="button" className="vehicle-card" key={vehicle.id} onClick={() => { setSelectedVehicleId(vehicle.id); setDrawerMode("detail"); }}>
              <div className="vehicle-card-top"><span className="vehicle-thumbnail"><Car size={31} /></span><StatusBadge>{vehicle.status}</StatusBadge></div>
              <div className="vehicle-card-title"><small>{vehicle.managementNumber}</small><h2>{vehicle.name}</h2><p>{vehicle.acquisitionSource}・振り分け {vehicle.disposition}</p></div>
              <dl className="vehicle-card-values"><div><dt>{vehicle.salePrice == null ? "販売予定価格" : "販売価格"}</dt><dd>{formatCurrency(profit.revenueBasis)}</dd></div><div><dt>{profit.isFinal ? "確定粗利" : "予想利益"}</dt><dd className={profit.expectedProfit < 0 ? "negative" : "positive"}>{formatCurrency(profit.isFinal ? profit.provisionalProfit : profit.expectedProfit)}</dd></div></dl>
              <div className={`document-indicator ${vehicle.documentsComplete ? "complete" : "missing"}`}>{vehicle.documentsComplete ? <CheckCircle2 size={17} /> : <FileWarning size={17} />}{vehicle.documentsComplete ? "必要書類 確認済み" : "書類の確認が必要"}</div>
              <span className="vehicle-card-action">詳細を見る</span>
            </button>
          );
        })}
      </section>

      {filteredVehicles.length === 0 ? <div className="empty-state panel"><Car size={34} /><h2>該当する車両がありません</h2><p>検索条件を変更するか、新しい車両を登録してください。</p></div> : null}

      {canEdit ? <button type="button" className="mobile-vehicle-register" onClick={openNewVehicle}><Plus size={20} />車両を登録</button> : null}

      {drawerMode === "new" ? (
        <Drawer title="車両を登録" subtitle="0円買取の場合は仕入額を0円で登録できます。" onClose={() => setDrawerMode(null)}>
          <form className="form-stack" onSubmit={submitVehicle}>
            <div className="form-section">
              <div className="section-heading"><h3>基本情報</h3><button type="button" className="secondary-button" onClick={() => setRegistrationQrOpen(true)}><ScanLine size={18} />QRコードを読み込む</button></div>
              <div className="form-row">
                <label className="field-label">メーカー <span className="required">必須</span><select value={form.maker} onChange={(event) => setForm({ ...form, maker: event.target.value })} autoFocus><option value="">選択してください</option>{vehicleMakers.map((maker) => <option key={maker}>{maker}</option>)}</select></label>
                <label className="field-label">車種 <span className="required">必須</span><input list="vehicle-model-options" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="例：プリウス" /><datalist id="vehicle-model-options">{modelSuggestions.map((model) => <option value={model} key={model} />)}</datalist></label>
              </div>
              <label className="field-label">グレード<input value={form.grade} onChange={(event) => setForm({ ...form, grade: event.target.value })} placeholder="例：S ツーリングセレクション" /></label>
              <p className="form-hint">表示名：{vehicleDisplayName(form.maker, form.model, form.grade) || "メーカー・車種・グレードから自動作成します"}</p>
              <label className="field-label">車台番号<input value={form.chassisNumber} onChange={(event) => setForm({ ...form, chassisNumber: event.target.value })} placeholder="入庫後の入力・修正もできます" /></label>
              <div className="form-row"><label className="field-label">型式<input value={form.modelType} onChange={(event) => setForm({ ...form, modelType: event.target.value })} /></label><label className="field-label">登録番号<input value={form.registrationNumber} onChange={(event) => setForm({ ...form, registrationNumber: event.target.value })} /></label></div>
              <div className="form-row"><label className="field-label">初度登録年月<input type="month" value={form.firstRegistration} onChange={(event) => setForm({ ...form, firstRegistration: event.target.value })} /></label><label className="field-label">車検満了日<input type="date" value={form.inspectionExpiry} onChange={(event) => setForm({ ...form, inspectionExpiry: event.target.value })} /></label></div>
              <div className="form-row"><label className="field-label">車体色<input value={form.bodyColor} onChange={(event) => setForm({ ...form, bodyColor: event.target.value })} /></label><label className="field-label">走行距離<input inputMode="numeric" value={form.mileage} onChange={(event) => setForm({ ...form, mileage: event.target.value })} placeholder="例：38000km" /></label></div>
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
            {formMessage ? <p className="form-success">{formMessage}</p> : null}
            {formError ? <p className="form-error">{formError}</p> : null}
            <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setDrawerMode(null)}>キャンセル</button><button type="submit" className="primary-button" disabled={submitting}>{submitting ? "登録中" : "登録する"}</button></div>
          </form>
        </Drawer>
      ) : null}

      {drawerMode === "detail" && selectedVehicle ? <VehicleDetailDrawer vehicle={selectedVehicle} documents={selectedDocuments} expenses={data.expenses} cashflows={data.cashflows.filter((cashflow) => cashflow.vehicleId === selectedVehicle.id)} canEdit={canEdit} canManagePayments={canManagePayments} isOwner={isOwner} onClose={() => setDrawerMode(null)} onUpdate={(patch) => updateVehicle(selectedVehicle.id, patch)} onCompleteDisposition={completeVehicleDisposition} onMarkArrived={markVehicleArrived} onMarkDelivered={markVehicleDelivered} onDocumentUpdate={updateVehicleDocument} onAddExpense={addExpense} onCompleteCashflow={completeCashflow} onArchive={async () => { await archiveVehicle(selectedVehicle.id); setDrawerMode(null); }} /> : null}
      {inspectionImportOpen ? <VehicleInspectionImportDrawer vehicles={data.vehicles} antiqueLedgerDetails={data.antiqueLedgerDetails} onApply={applyVehicleInspectionImport} onClose={() => setInspectionImportOpen(false)} /> : null}
      {registrationQrOpen ? <VehicleQrReaderDrawer onRead={applyQrToNewVehicle} onClose={() => setRegistrationQrOpen(false)} /> : null}
      {modelOptionsOpen ? <VehicleModelOptionsDrawer options={data.vehicleModelOptions} onAdd={rememberVehicleModelOption} onUpdate={updateVehicleModelOption} onDelete={deleteVehicleModelOption} onClose={() => setModelOptionsOpen(false)} /> : null}
    </>
  );
}

function VehicleModelOptionsDrawer({ options, onAdd, onUpdate, onDelete, onClose }: { options: VehicleModelOption[]; onAdd: (maker: string, model: string) => Promise<void>; onUpdate: (id: string, maker: string, model: string) => Promise<void>; onDelete: (id: string) => Promise<void>; onClose: () => void }) {
  const [maker, setMaker] = useState("");
  const [model, setModel] = useState("");
  const [editing, setEditing] = useState<Record<string, { maker: string; model: string }>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const editValue = (option: VehicleModelOption) => editing[option.id] ?? { maker: option.maker, model: option.model };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try { await onAdd(maker, model); setMaker(""); setModel(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "候補を追加できませんでした。"); }
    finally { setBusy(false); }
  };

  return <Drawer title="車種候補を管理" subtitle="この画面は事業主だけが変更できます" onClose={onClose}><div className="form-stack"><form className="form-section" onSubmit={add}><h3>候補を追加</h3><div className="form-row"><label className="field-label">メーカー<select value={maker} onChange={(event) => setMaker(event.target.value)}><option value="">選択してください</option>{vehicleMakers.map((item) => <option key={item}>{item}</option>)}</select></label><label className="field-label">車種<input value={model} onChange={(event) => setModel(event.target.value)} /></label></div><button className="primary-button" disabled={busy || !maker.trim() || !model.trim()}>追加</button></form><section className="form-section"><h3>登録済み候補</h3>{options.length ? options.map((option) => { const value = editValue(option); return <div className="model-option-row" key={option.id}><select value={value.maker} onChange={(event) => setEditing({ ...editing, [option.id]: { ...value, maker: event.target.value } })}>{vehicleMakers.map((item) => <option key={item}>{item}</option>)}</select><input value={value.model} onChange={(event) => setEditing({ ...editing, [option.id]: { ...value, model: event.target.value } })} /><button type="button" className="secondary-button" disabled={busy} onClick={() => void onUpdate(option.id, value.maker, value.model).catch((reason) => setError(reason instanceof Error ? reason.message : "保存できませんでした。"))}>保存</button><button type="button" className="danger-button" disabled={busy} onClick={() => { if (window.confirm(`${option.maker} ${option.model}を候補から削除しますか？`)) void onDelete(option.id).catch((reason) => setError(reason instanceof Error ? reason.message : "削除できませんでした。")); }}><Trash2 size={16} /></button></div>; }) : <p className="form-hint">車両登録時に入力した車種が自動で候補になります。</p>}</section>{error ? <p className="form-error">{error}</p> : null}</div></Drawer>;
}

function VehicleDetailDrawer({
  vehicle, documents, expenses, cashflows, onClose, onUpdate, onCompleteDisposition, onMarkArrived, onMarkDelivered, onDocumentUpdate, onAddExpense, onCompleteCashflow, onArchive, canEdit, canManagePayments, isOwner,
}: {
  vehicle: Vehicle;
  documents: VehicleDocument[];
  expenses: Expense[];
  cashflows: Cashflow[];
  onClose: () => void;
  onUpdate: (patch: Partial<Vehicle>) => Promise<void>;
  onCompleteDisposition: (input: CompleteVehicleDispositionInput) => Promise<void>;
  onMarkArrived: (vehicleId: string, arrivedOn: string) => Promise<void>;
  onMarkDelivered: (vehicleId: string, deliveredOn: string) => Promise<void>;
  onDocumentUpdate: (input: VehicleDocumentInput) => Promise<VehicleDocument>;
  onAddExpense: (input: NewExpenseInput) => Promise<void>;
  onCompleteCashflow: (cashflowId: string, processedOn: string) => Promise<void>;
  onArchive: () => Promise<void>;
  canEdit: boolean;
  canManagePayments: boolean;
  isOwner: boolean;
}) {
  const profit = calculateVehicleProfit(vehicle, expenses);
  const vehicleExpenses = expenses.filter((expense) => expense.vehicleId === vehicle.id);
  const purchasePayment = cashflows.find((cashflow) => cashflow.kind === "買取代金" && cashflow.direction === "支払い") ?? null;
  const purchasePaymentRemaining = purchasePayment ? outstandingAmount(purchasePayment.amount, purchasePayment.processedAmount) : 0;
  const saleReceipt = cashflows.find((cashflow) => cashflow.kind === "販売代金" && cashflow.direction === "入金") ?? null;
  const saleReceiptRemaining = saleReceipt ? outstandingAmount(saleReceipt.amount, saleReceipt.processedAmount) : 0;
  const [editMode, setEditMode] = useState(false);
  const [expenseMode, setExpenseMode] = useState(false);
  const [dispositionMode, setDispositionMode] = useState(false);
  const [editForm, setEditForm] = useState<Vehicle>({ ...vehicle });
  const [expenseForm, setExpenseForm] = useState<NewExpenseInput>(initialExpense(vehicle.id));
  const [updateError, setUpdateError] = useState("");
  const [busy, setBusy] = useState(false);
  const [arrivalDate, setArrivalDate] = useState(vehicle.arrivedAt ?? new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState(vehicle.deliveredAt ?? new Date().toISOString().slice(0, 10));
  const [dispositionForm, setDispositionForm] = useState<Omit<CompleteVehicleDispositionInput, "vehicleId" | "disposition">>({
    counterparty: "", proceedsAmount: 0, feeAmount: 0,
    completedOn: new Date().toISOString().slice(0, 10), incomeMethod: "振込", feePaymentMethod: "振込",
  });
  const keyDocument = documents.find((document) => document.documentType === "鍵の本数");
  const [keyCount, setKeyCount] = useState(keyDocument?.note ?? "");
  const receiptChecklistComplete = isVehicleReceiptChecklistComplete(documents);
  const undecidedReceiptCount = vehicleReceiptChecklistTypes.filter((type) =>
    vehicleReceiptStatus(documents.find((document) => document.documentType === type)) === "未選択",
  ).length;

  useEffect(() => {
    setEditForm({ ...vehicle });
    setArrivalDate(vehicle.arrivedAt ?? new Date().toISOString().slice(0, 10));
    setDeliveryDate(vehicle.deliveredAt ?? new Date().toISOString().slice(0, 10));
    setKeyCount(documents.find((document) => document.documentType === "鍵の本数")?.note ?? "");
    setDispositionMode(false);
  }, [vehicle, documents]);

  const commitUpdate = async (patch: Partial<Vehicle>) => {
    setUpdateError("");
    try { await onUpdate(patch); }
    catch (reason) { setUpdateError(reason instanceof Error ? reason.message : "変更を保存できませんでした。"); }
  };

  const changeStatus = async (status: VehicleStatus) => {
    if (vehicle.status === "入庫予定" && status === "入庫済み") {
      await confirmArrival();
      return;
    }
    if (vehicle.status === "入庫予定" && status !== "入庫予定") {
      setUpdateError("先に「入庫を確定する」で入庫済みにしてください。");
      return;
    }
    if (status === "売約済み" && vehicle.status !== "売約済み") {
      setUpdateError("売約済みへの変更は、販売契約を契約済みにすると自動で行われます。");
      return;
    }
    if (status === "納車済み") {
      if (vehicle.status !== "売約済み") {
        setUpdateError("先に販売契約を契約済みにして、車両を売約済みにしてください。");
        return;
      }
      await confirmDelivery();
      return;
    }
    if (status === "入庫予定") {
      await commitUpdate({ status, arrivedAt: null });
      return;
    }
    const patch: Partial<Vehicle> = { status };
    await commitUpdate(patch);
  };

  const confirmArrival = async () => {
    if (!arrivalDate) return setUpdateError("実際の入庫日を入力してください。");
    if (!receiptChecklistComplete) return setUpdateError("受取確認をすべて「受取済み」または「不要」にしてください。");
    setBusy(true);
    setUpdateError("");
    try { await onMarkArrived(vehicle.id, arrivalDate); }
    catch (reason) { setUpdateError(reason instanceof Error ? reason.message : "入庫を確定できませんでした。"); }
    finally { setBusy(false); }
  };

  const completePurchasePayment = async () => {
    if (!purchasePayment || purchasePayment.status === "完了") return;
    if (vehicle.status === "入庫予定") return setUpdateError("買取代金は入庫を確定するまで支払済みにできません。");
    if (!receiptChecklistComplete) return setUpdateError("車両・書類の受取確認完了後に買取代金を支払ってください。");
    if (!window.confirm(`${formatCurrency(purchasePaymentRemaining)}を支払済みにしますか？`)) return;
    setBusy(true);
    setUpdateError("");
    try { await onCompleteCashflow(purchasePayment.id, new Date().toISOString().slice(0, 10)); }
    catch (reason) { setUpdateError(reason instanceof Error ? reason.message : "支払いを完了できませんでした。"); }
    finally { setBusy(false); }
  };

  const completeSaleReceipt = async () => {
    if (!saleReceipt || saleReceipt.status === "完了") return;
    if (!window.confirm(`${formatCurrency(saleReceiptRemaining)}を入金済みにしますか？`)) return;
    setBusy(true);
    setUpdateError("");
    try { await onCompleteCashflow(saleReceipt.id, new Date().toISOString().slice(0, 10)); }
    catch (reason) { setUpdateError(reason instanceof Error ? reason.message : "入金を完了できませんでした。"); }
    finally { setBusy(false); }
  };

  const confirmDelivery = async () => {
    if (!deliveryDate) return setUpdateError("実際の納車日を入力してください。");
    if (!saleReceipt || saleReceipt.status !== "完了") return setUpdateError("販売代金の入金完了後に納車してください。");
    setBusy(true);
    setUpdateError("");
    try { await onMarkDelivered(vehicle.id, deliveryDate); }
    catch (reason) { setUpdateError(reason instanceof Error ? reason.message : "納車を確定できませんでした。"); }
    finally { setBusy(false); }
  };

  const saveVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editForm.maker.trim() || !editForm.model.trim() || !editForm.storageLocation.trim() || !editForm.plannedArrivalDate) return setUpdateError("メーカー・車種・保管場所・入庫予定日は必ず入力してください。");
    if (editForm.purchasePrice < 0 || editForm.askingPrice < 0 || (editForm.salePrice ?? 0) < 0) return setUpdateError("金額は0円以上で入力してください。");
    setBusy(true);
    try {
      await onUpdate({ name: vehicleDisplayName(editForm.maker, editForm.model, editForm.grade), maker: editForm.maker.trim(), model: editForm.model.trim(), grade: editForm.grade.trim(), chassisNumber: editForm.chassisNumber.trim(), modelType: editForm.modelType.trim(), registrationNumber: editForm.registrationNumber.trim(), firstRegistration: editForm.firstRegistration.trim(), inspectionExpiry: editForm.inspectionExpiry.trim(), bodyColor: editForm.bodyColor.trim(), mileage: editForm.mileage.trim(), acquisitionSource: editForm.acquisitionSource, disposition: editForm.disposition, purchasePrice: editForm.purchasePrice, askingPrice: editForm.askingPrice, salePrice: editForm.salePrice, storageLocation: editForm.storageLocation.trim(), plannedArrivalDate: editForm.plannedArrivalDate, arrivedAt: editForm.arrivedAt, deliveredAt: editForm.deliveredAt });
      setEditMode(false);
    } catch (reason) { setUpdateError(reason instanceof Error ? reason.message : "車両情報を保存できませんでした。"); }
    finally { setBusy(false); }
  };

  const submitDisposition = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (vehicle.disposition !== "オークション" && vehicle.disposition !== "廃車") return;
    setBusy(true);
    setUpdateError("");
    try {
      await onCompleteDisposition({ vehicleId: vehicle.id, disposition: vehicle.disposition, ...dispositionForm });
      setDispositionMode(false);
    } catch (reason) {
      setUpdateError(reason instanceof Error ? reason.message : "振り分け後の処理を完了できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const updateDocumentStatus = async (documentType: VehicleDocumentType, status: VehicleReceiptStatus) => {
    const current = documents.find((document) => document.documentType === documentType);
    setBusy(true);
    setUpdateError("");
    try {
      const updated = await onDocumentUpdate(vehicleDocumentInputForStatus(vehicle.id, documentType, status, current?.note ?? ""));
      if (documentType === "鍵の本数") setKeyCount(updated.note);
    } catch (reason) { setUpdateError(reason instanceof Error ? reason.message : "書類の状態を保存できませんでした。"); }
    finally { setBusy(false); }
  };

  const saveKeyCount = async () => {
    if (vehicleReceiptStatus(keyDocument) !== "受取済み") return;
    if (!/^\d+$/.test(keyCount) || Number(keyCount) < 1) {
      setUpdateError("受け取った鍵の本数を1本以上で入力してください。");
      return;
    }
    setBusy(true);
    setUpdateError("");
    try {
      await onDocumentUpdate({
        vehicleId: vehicle.id,
        documentType: "鍵の本数",
        isRequired: true,
        isReceived: true,
        receivedAt: keyDocument?.receivedAt ?? new Date().toISOString().slice(0, 10),
        note: keyCount,
      });
    } catch (reason) { setUpdateError(reason instanceof Error ? reason.message : "鍵の本数を保存できませんでした。"); }
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
        {vehicle.status === "入庫予定" ? (
          <div className="workflow-card warning">
            <span className="workflow-icon"><PackageCheck size={24} /></span>
            <div className="workflow-content">
              <strong>入庫を確認してください</strong>
              <p>{receiptChecklistComplete ? "受取確認が完了しました。実際の入庫日を確認してください。" : `受取確認が残り${undecidedReceiptCount}項目あります。完了するまで買取代金も支払済みにできません。`}</p>
              {canEdit ? <div className="workflow-action"><label className="field-label">実際の入庫日<input type="date" value={arrivalDate} max={new Date().toISOString().slice(0, 10)} disabled={busy} onChange={(event) => setArrivalDate(event.target.value)} /></label><button type="button" className="primary-button" disabled={busy || !receiptChecklistComplete} onClick={() => void confirmArrival()}><PackageCheck size={17} />{busy ? "処理中" : "入庫を確定する"}</button></div> : null}
            </div>
          </div>
        ) : vehicle.status === "納車済み" ? (
          <div className="workflow-card success"><span className="workflow-icon"><Truck size={24} /></span><div className="workflow-content"><strong>納車済み</strong><p>{formatDate(vehicle.deliveredAt)} に納車しました。</p></div></div>
        ) : vehicle.status === "売約済み" ? (
          <div className={`workflow-card ${saleReceipt?.status === "完了" ? "success" : "warning"}`}>
            <span className="workflow-icon"><Truck size={24} /></span>
            <div className="workflow-content">
              <strong>{saleReceipt?.status === "完了" ? "入金確認済み・納車できます" : "販売代金の入金待ち"}</strong>
              <p>{saleReceipt?.status === "完了" ? "実際の納車日を確認して、納車を確定してください。" : "販売代金の入金を完了するまでは納車済みにできません。"}</p>
              {canEdit && saleReceipt?.status === "完了" ? <div className="workflow-action"><label className="field-label">実際の納車日<input type="date" value={deliveryDate} min={vehicle.arrivedAt ?? undefined} max={new Date().toISOString().slice(0, 10)} disabled={busy} onChange={(event) => setDeliveryDate(event.target.value)} /></label><button type="button" className="primary-button" disabled={busy} onClick={() => void confirmDelivery()}><Truck size={17} />{busy ? "処理中" : "納車を確定する"}</button></div> : null}
            </div>
          </div>
        ) : vehicle.arrivedAt ? (
          <div className="workflow-card success"><span className="workflow-icon"><CheckCircle2 size={24} /></span><div className="workflow-content"><strong>入庫済み</strong><p>{formatDate(vehicle.arrivedAt)} に入庫しました。</p></div></div>
        ) : null}
        <label className="field-label">車両の状態<select value={vehicle.status} disabled={!canEdit || busy} onChange={(event) => void changeStatus(event.target.value as VehicleStatus)}>{vehicleStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        {canEdit && !["売約済み", "納車済み"].includes(vehicle.status) ? <p className="form-hint">売約済みへの変更は、販売契約を「契約済み」にすると自動で行われます。</p> : null}
        {!canEdit ? <p className="form-hint">経理権限では車両情報を閲覧できますが、変更はできません。</p> : null}
      </section>

      <section className="detail-section disposition-workflow-section">
        <div className="section-heading"><div><h3>買取後の振り分け</h3><p>契約とは分けて、入庫後の行き先と結果を管理します。</p></div></div>
        <label className="field-label">振り分け先
          <select
            value={vehicle.disposition}
            disabled={!canEdit || busy || ["納車済み", "廃車処分"].includes(vehicle.status)}
            onChange={(event) => void commitUpdate({ disposition: event.target.value as VehicleDisposition })}
          >
            {vehicleDispositions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        {vehicle.disposition === "未定" ? (
          <div className="workflow-card warning"><span className="workflow-icon"><Filter size={22} /></span><div className="workflow-content"><strong>振り分けを決めてください</strong><p>販売・オークション・廃車から選択すると、次の操作が表示されます。</p></div></div>
        ) : vehicle.disposition === "販売" ? (
          <div className={`workflow-card ${vehicle.status === "販売中" ? "success" : "neutral"}`}><span className="workflow-icon"><Car size={22} /></span><div className="workflow-content"><strong>{vehicle.status === "販売中" ? "販売中です" : "販売の準備"}</strong><p>{vehicle.status === "販売中" ? "販売サイトへの掲載や販売契約へ進めます。" : "入庫確認後、販売中へ変更してください。"}</p>{canEdit && vehicle.status === "入庫済み" ? <div className="workflow-action"><button type="button" className="primary-button" disabled={busy} onClick={() => void commitUpdate({ status: "販売中" })}>販売中にする</button></div> : null}</div></div>
        ) : ["納車済み", "廃車処分"].includes(vehicle.status) ? (
          <div className="workflow-card success"><span className="workflow-icon">{vehicle.disposition === "オークション" ? <Gavel size={22} /> : <Recycle size={22} />}</span><div className="workflow-content"><strong>{vehicle.disposition === "オークション" ? "オークション売却・引渡し済み" : "廃車処分済み"}</strong><p>入出金・経費・利益・古物台帳へ反映済みです。</p></div></div>
        ) : (
          <div className="workflow-card neutral"><span className="workflow-icon">{vehicle.disposition === "オークション" ? <Gavel size={22} /> : <Recycle size={22} />}</span><div className="workflow-content"><strong>{vehicle.disposition === "オークション" ? "オークション売却を登録" : "廃車処分を登録"}</strong><p>入金額と手数料・処分費を一度入力すると、関連する管理へまとめて反映します。</p>{canEdit && vehicle.status !== "入庫予定" ? <div className="workflow-action"><button type="button" className="primary-button" onClick={() => setDispositionMode((current) => !current)}>{dispositionMode ? "入力を閉じる" : "処理内容を入力"}</button></div> : <p className="form-hint">先に車両・書類の受取確認と入庫確定を行ってください。</p>}</div></div>
        )}

        {dispositionMode && (vehicle.disposition === "オークション" || vehicle.disposition === "廃車") ? (
          <form className="form-stack disposition-completion-form" onSubmit={submitDisposition}>
            <label className="field-label">{vehicle.disposition === "オークション" ? "オークション会場・売却先" : "解体業者・引渡し先"} <span className="required">必須</span><input value={dispositionForm.counterparty} onChange={(event) => setDispositionForm({ ...dispositionForm, counterparty: event.target.value })} /></label>
            <div className="form-row">
              <label className="field-label">{vehicle.disposition === "オークション" ? "売却金額" : "受取額・還付金"}（税込）<input type="number" min="0" step="1" inputMode="numeric" value={dispositionForm.proceedsAmount || ""} placeholder="0" onChange={(event) => setDispositionForm({ ...dispositionForm, proceedsAmount: Number(event.target.value) })} /></label>
              <label className="field-label">入金方法<select value={dispositionForm.incomeMethod} onChange={(event) => setDispositionForm({ ...dispositionForm, incomeMethod: event.target.value as PaymentMethod })}>{expensePaymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
            </div>
            <div className="form-row">
              <label className="field-label">{vehicle.disposition === "オークション" ? "オークション手数料" : "廃車処分費"}（税込）<input type="number" min="0" step="1" inputMode="numeric" value={dispositionForm.feeAmount || ""} placeholder="0" onChange={(event) => setDispositionForm({ ...dispositionForm, feeAmount: Number(event.target.value) })} /></label>
              <label className="field-label">支払い方法<select value={dispositionForm.feePaymentMethod} onChange={(event) => setDispositionForm({ ...dispositionForm, feePaymentMethod: event.target.value as PaymentMethod })}>{expensePaymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
            </div>
            <label className="field-label">処理日 <span className="required">必須</span><input type="date" max={new Date().toISOString().slice(0, 10)} value={dispositionForm.completedOn} onChange={(event) => setDispositionForm({ ...dispositionForm, completedOn: event.target.value })} /></label>
            <p className="form-hint">入金・支払いは未処理で登録されるため、実際の着金・支払い後に「入出金」で完了してください。</p>
            <button type="submit" className="primary-button full-button" disabled={busy}>{busy ? "登録中" : `${vehicle.disposition === "オークション" ? "オークション売却" : "廃車処分"}を確定`}</button>
          </form>
        ) : null}
      </section>

      {editMode ? (
        <form className="detail-section" onSubmit={saveVehicle}>
          <h3>車両情報を編集</h3>
          <div className="form-row"><label className="field-label">メーカー <span className="required">必須</span><select value={editForm.maker} onChange={(event) => setEditForm({ ...editForm, maker: event.target.value })}><option value="">選択してください</option>{vehicleMakers.map((maker) => <option key={maker}>{maker}</option>)}</select></label><label className="field-label">車種 <span className="required">必須</span><input value={editForm.model} onChange={(event) => setEditForm({ ...editForm, model: event.target.value })} /></label></div>
          <label className="field-label">グレード<input value={editForm.grade} onChange={(event) => setEditForm({ ...editForm, grade: event.target.value })} /></label>
          <p className="form-hint">表示名：{vehicleDisplayName(editForm.maker, editForm.model, editForm.grade)}</p>
          <label className="field-label">車台番号<input value={editForm.chassisNumber} onChange={(event) => setEditForm({ ...editForm, chassisNumber: event.target.value })} /></label>
          <div className="form-row"><label className="field-label">型式<input value={editForm.modelType} onChange={(event) => setEditForm({ ...editForm, modelType: event.target.value })} /></label><label className="field-label">登録番号<input value={editForm.registrationNumber} onChange={(event) => setEditForm({ ...editForm, registrationNumber: event.target.value })} /></label></div>
          <div className="form-row"><label className="field-label">初度登録年月<input type="month" value={editForm.firstRegistration} onChange={(event) => setEditForm({ ...editForm, firstRegistration: event.target.value })} /></label><label className="field-label">車検満了日<input type="date" value={editForm.inspectionExpiry} onChange={(event) => setEditForm({ ...editForm, inspectionExpiry: event.target.value })} /></label></div>
          <div className="form-row"><label className="field-label">車体色<input value={editForm.bodyColor} onChange={(event) => setEditForm({ ...editForm, bodyColor: event.target.value })} /></label><label className="field-label">走行距離<input value={editForm.mileage} onChange={(event) => setEditForm({ ...editForm, mileage: event.target.value })} /></label></div>
          <div className="form-row">
            <label className="field-label">仕入れ元<select value={editForm.acquisitionSource} onChange={(event) => setEditForm({ ...editForm, acquisitionSource: event.target.value as AcquisitionSource })}>{acquisitionSources.map((source) => <option key={source}>{source}</option>)}</select></label>
            <label className="field-label">買取後の振り分け<select value={editForm.disposition} onChange={(event) => setEditForm({ ...editForm, disposition: event.target.value as VehicleDisposition })}>{vehicleDispositions.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <label className="field-label">保管場所<input value={editForm.storageLocation} onChange={(event) => setEditForm({ ...editForm, storageLocation: event.target.value })} /></label>
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
        <section className="detail-section"><h3>車両情報</h3><dl className="detail-list"><div><dt>メーカー</dt><dd>{vehicle.maker || "未入力"}</dd></div><div><dt>車種</dt><dd>{vehicle.model || "未入力"}</dd></div><div><dt>グレード</dt><dd>{vehicle.grade || "未入力"}</dd></div><div><dt>車台番号</dt><dd>{vehicle.chassisNumber || "未入力"}</dd></div><div><dt>型式</dt><dd>{vehicle.modelType || "未入力"}</dd></div><div><dt>登録番号</dt><dd>{vehicle.registrationNumber || "未入力"}</dd></div><div><dt>初度登録年月</dt><dd>{vehicle.firstRegistration || "未入力"}</dd></div><div><dt>車検満了日</dt><dd>{formatDate(vehicle.inspectionExpiry)}</dd></div><div><dt>車体色</dt><dd>{vehicle.bodyColor || "未入力"}</dd></div><div><dt>走行距離</dt><dd>{vehicle.mileage || "未入力"}</dd></div><div><dt>買取後の振り分け</dt><dd>{vehicle.disposition}</dd></div><div><dt>保管場所</dt><dd>{vehicle.storageLocation}</dd></div><div><dt>入庫予定日</dt><dd>{formatDate(vehicle.plannedArrivalDate)}</dd></div><div><dt>実際の入庫日</dt><dd>{formatDate(vehicle.arrivedAt)}</dd></div><div><dt>納車日</dt><dd>{formatDate(vehicle.deliveredAt)}</dd></div></dl></section>
      )}

      <section className="detail-section">
        <h3>車両・書類の受取確認</h3><p className="section-note">全項目を「受取済み」または「不要」にしてください。未選択がある間は入庫を確定できません。</p>
        <div className="document-checklist">
          {vehicleReceiptChecklistTypes.map((type) => {
            const document = documents.find((item) => item.documentType === type);
            const status = vehicleReceiptStatus(document);
            return <div className={`receipt-check-item ${status === "未選択" ? "pending" : "decided"}`} key={type}><div className="receipt-check-heading"><span><strong>{type}</strong><small>{status === "受取済み" ? `${formatDate(document?.receivedAt ?? null)} 受領` : status}</small></span><select aria-label={`${type}の受取状態`} value={status} disabled={!canEdit || busy} onChange={(event) => void updateDocumentStatus(type, event.target.value as VehicleReceiptStatus)}><option>未選択</option><option>受取済み</option><option>不要</option></select></div>{type === "鍵の本数" && status === "受取済み" ? <label className="key-count-field">受け取った本数<input type="number" min="1" inputMode="numeric" value={keyCount} disabled={!canEdit || busy} onChange={(event) => setKeyCount(event.target.value)} onBlur={() => void saveKeyCount()} /></label> : null}</div>;
          })}
        </div>
        <p className={`receipt-check-summary ${receiptChecklistComplete ? "complete" : "pending"}`}>{receiptChecklistComplete ? <><CheckCircle2 size={17} />受取確認はすべて完了しています</> : <><FileWarning size={17} />未選択が{undecidedReceiptCount}項目あります</>}</p>
      </section>

      <section className="detail-section">
        <h3>買取代金</h3>
        {vehicle.purchasePrice === 0 ? (
          <div className="workflow-card neutral"><span className="workflow-icon"><CircleDollarSign size={24} /></span><div className="workflow-content"><strong>0円買取</strong><p>支払いはありません。入出金の未払いにも表示されません。</p></div></div>
        ) : purchasePayment ? (
          <div className={`payment-workflow ${purchasePayment.status === "完了" ? "complete" : "pending"}`}>
            <div className="payment-workflow-heading"><span><strong>{formatCurrency(purchasePayment.amount)}</strong><small>{purchasePayment.method}・予定日 {formatDate(purchasePayment.scheduledOn)}</small></span><StatusBadge>{purchasePayment.status}</StatusBadge></div>
            <dl><div><dt>処理済み</dt><dd>{formatCurrency(purchasePayment.processedAmount)}</dd></div><div><dt>未払い残額</dt><dd>{formatCurrency(purchasePaymentRemaining)}</dd></div></dl>
            {purchasePayment.status === "完了" ? <p className="payment-complete-note"><CheckCircle2 size={17} />{formatDate(purchasePayment.processedOn)} に支払い完了</p> : vehicle.status === "入庫予定" || !receiptChecklistComplete ? <p className="payment-lock-note">車両・書類の受取確認と入庫確定後に支払済みへ変更できます。</p> : canManagePayments ? <button type="button" className="primary-button full-button" disabled={busy} onClick={() => void completePurchasePayment()}><CircleDollarSign size={18} />支払済みにする</button> : <p className="section-note">支払い状況を変更する権限がありません。</p>}
          </div>
        ) : (
          <p className="section-note">この車両に紐づく買取代金の支払い予定はありません。必要な場合は入出金画面から登録してください。</p>
        )}
      </section>

      {saleReceipt || vehicle.status === "売約済み" || vehicle.status === "納車済み" ? (
        <section className="detail-section">
          <h3>販売代金</h3>
          {saleReceipt ? (
            <div className={`payment-workflow ${saleReceipt.status === "完了" ? "complete" : "pending"}`}>
              <div className="payment-workflow-heading"><span><strong>{formatCurrency(saleReceipt.amount)}</strong><small>{saleReceipt.method}・契約日 {formatDate(saleReceipt.scheduledOn)}</small></span><StatusBadge>{saleReceipt.status}</StatusBadge></div>
              <dl><div><dt>入金済み</dt><dd>{formatCurrency(saleReceipt.processedAmount)}</dd></div><div><dt>未入金残額</dt><dd>{formatCurrency(saleReceiptRemaining)}</dd></div></dl>
              {saleReceipt.status === "完了" ? <p className="payment-complete-note"><CheckCircle2 size={17} />{formatDate(saleReceipt.processedOn)} に入金完了</p> : canManagePayments ? <button type="button" className="primary-button full-button" disabled={busy} onClick={() => void completeSaleReceipt()}><CircleDollarSign size={18} />入金済みにする</button> : <p className="section-note">入金状況を変更する権限がありません。</p>}
            </div>
          ) : <p className="section-note">販売契約に紐づく販売代金が見つかりません。納車前に入出金を確認してください。</p>}
        </section>
      ) : null}

      <section className="detail-section">
        <div className="section-heading"><h3>車両経費</h3>{canEdit ? <button type="button" className="text-button" onClick={() => setExpenseMode((current) => !current)}><ReceiptText size={15} />{expenseMode ? "入力を閉じる" : "経費を追加"}</button> : null}</div>
        {expenseMode ? (
          <form className="inline-form" onSubmit={saveExpense}>
            <div className="form-row"><label className="field-label">費用項目<select value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })}>{expenseCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label className="field-label">発生日<input type="date" value={expenseForm.incurredOn} onChange={(event) => setExpenseForm({ ...expenseForm, incurredOn: event.target.value })} /></label></div>
            <label className="field-label">内容 <span className="required">必須</span><input value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} placeholder="例：タイヤ交換" /></label>
            <label className="field-label">金額（税込） <span className="required">必須</span><input type="number" min="1" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: Number(event.target.value) })} /></label>
            <div className="form-row"><label className="field-label">費用区分<select value={expenseForm.expenseStatus} onChange={(event) => setExpenseForm({ ...expenseForm, expenseStatus: event.target.value as ExpenseStatus, paymentStatus: event.target.value === "予定" ? "未払い" : expenseForm.paymentStatus })}><option>確定</option><option>予定</option></select></label><label className="field-label">支払い<select value={expenseForm.paymentStatus} disabled={expenseForm.expenseStatus === "予定"} onChange={(event) => setExpenseForm({ ...expenseForm, paymentStatus: event.target.value as PaymentStatus })}><option>未払い</option><option>支払済み</option></select></label></div>
            <label className="field-label">支払い方法<select value={expenseForm.paymentMethod} onChange={(event) => setExpenseForm({ ...expenseForm, paymentMethod: event.target.value as PaymentMethod })}>{expensePaymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
            <button type="submit" className="primary-button full-button" disabled={busy}>経費を登録</button>
          </form>
        ) : null}
        {vehicleExpenses.length ? <div className="compact-expense-list">{vehicleExpenses.slice(0, 5).map((expense) => <div key={expense.id}><span><strong>{expense.category}</strong><small>{expense.description}</small></span><span><strong>{formatCurrency(expense.amount)}</strong><small>{expense.expenseStatus}・{expense.paymentStatus}</small></span></div>)}</div> : <p className="section-note">登録済みの車両経費はありません。</p>}
      </section>

      <section className="detail-section"><h3>利益の確認</h3><dl className="amount-summary"><div><dt>販売価格</dt><dd>{formatCurrency(profit.revenueBasis)}</dd></div><div><dt>仕入額</dt><dd>− {formatCurrency(vehicle.purchasePrice)}</dd></div><div><dt>確定費用</dt><dd>− {formatCurrency(profit.confirmedExpenses)}</dd></div><div><dt>予定費用</dt><dd>− {formatCurrency(profit.plannedExpenses)}</dd></div><div className="total"><dt>{profit.isFinal ? "確定粗利" : "予想利益"}</dt><dd className={profit.expectedProfit < 0 ? "negative" : "positive"}>{formatCurrency(profit.isFinal ? profit.provisionalProfit : profit.expectedProfit)}</dd></div></dl>{vehicle.status === "納車済み" && !profit.isFinal ? <p className="form-hint">予定費用を確定または取り消すと、粗利が確定します。</p> : null}</section>

      {updateError ? <p className="form-error drawer-error">{updateError}</p> : null}
      {isOwner ? <section className="detail-section vehicle-delete-zone"><h3>車両を削除</h3><p>売約済みは履歴を残します。登録自体を取り消す場合だけ削除してください。監査記録は安全のため残ります。</p><button type="button" className="danger-button" disabled={busy} onClick={() => void archive()}><Trash2 size={16} />管理一覧から削除</button></section> : null}
    </Drawer>
  );
}
