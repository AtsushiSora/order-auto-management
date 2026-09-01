import {
  Car,
  CheckCircle2,
  FileWarning,
  Filter,
  Plus,
  Search,
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
  NewVehicleInput,
  Vehicle,
  VehicleStatus,
} from "../types";

const vehicleStatuses: VehicleStatus[] = [
  "入庫予定",
  "入庫済み",
  "販売中",
  "売約済み",
  "納車済み",
  "廃車処分",
];

const acquisitionSources: AcquisitionSource[] = [
  "一般のお客様",
  "オークション",
  "業者",
  "保険関係",
];

const initialVehicleForm: NewVehicleInput = {
  name: "",
  chassisNumber: "",
  status: "入庫予定",
  acquisitionSource: "一般のお客様",
  purchasePrice: 0,
  askingPrice: 0,
  storageLocation: "自宅",
  plannedArrivalDate: new Date().toISOString().slice(0, 10),
};

export function VehiclesPage({
  openNewForm = false,
  onNewFormOpened,
}: {
  openNewForm?: boolean;
  onNewFormOpened?: () => void;
}) {
  const { data, addVehicle, updateVehicle } = useAppData();
  const { profile } = useAuth();
  const canEdit = profile?.role === "owner" || profile?.role === "regular";
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
      const matchesKeyword =
        !keyword ||
        vehicle.managementNumber.toLowerCase().includes(keyword) ||
        vehicle.name.toLowerCase().includes(keyword) ||
        vehicle.chassisNumber.toLowerCase().includes(keyword);
      return matchesStatus && matchesKeyword;
    });
  }, [data.vehicles, search, statusFilter]);

  const selectedVehicle = data.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;

  const openNewVehicle = () => {
    setForm(initialVehicleForm);
    setFormError("");
    setDrawerMode("new");
  };

  useEffect(() => {
    if (!openNewForm) return;
    setForm(initialVehicleForm);
    setFormError("");
    setDrawerMode("new");
    onNewFormOpened?.();
  }, [openNewForm, onNewFormOpened]);

  const openVehicle = (vehicle: Vehicle) => {
    setSelectedVehicleId(vehicle.id);
    setDrawerMode("detail");
  };

  const submitVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setFormError("車両名を入力してください。");
      return;
    }
    if (form.purchasePrice < 0 || form.askingPrice < 0) {
      setFormError("金額は0円以上で入力してください。");
      return;
    }
    setSubmitting(true);
    try {
      await addVehicle({ ...form, name: form.name.trim(), chassisNumber: form.chassisNumber.trim() });
      setDrawerMode(null);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "車両を登録できませんでした。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="在庫"
        description="入庫予定から納車済みまで、車両ごとの取引を管理します。"
        action={canEdit ? (
          <button type="button" className="primary-button" onClick={openNewVehicle}>
            <Plus size={20} />
            車両を登録
          </button>
        ) : undefined}
      />

      <div className="filter-bar panel">
        <label className="search-field">
          <Search size={19} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="管理番号・車両名・車台番号で検索"
          />
        </label>
        <label className="select-field compact">
          <Filter size={18} />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as VehicleStatus | "すべて") }>
            <option value="すべて">すべての状態</option>
            {vehicleStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <div className="result-count">{filteredVehicles.length}台</div>
      </div>

      <section className="vehicle-card-grid">
        {filteredVehicles.map((vehicle) => {
          const profit = calculateVehicleProfit(vehicle, data.expenses);
          return (
            <button type="button" className="vehicle-card" key={vehicle.id} onClick={() => openVehicle(vehicle)}>
              <div className="vehicle-card-top">
                <span className="vehicle-thumbnail"><Car size={31} /></span>
                <StatusBadge>{vehicle.status}</StatusBadge>
              </div>
              <div className="vehicle-card-title">
                <small>{vehicle.managementNumber}</small>
                <h2>{vehicle.name}</h2>
                <p>{vehicle.acquisitionSource}</p>
              </div>
              <dl className="vehicle-card-values">
                <div><dt>販売価格</dt><dd>{formatCurrency(vehicle.askingPrice)}</dd></div>
                <div><dt>予想利益</dt><dd className={profit.expectedProfit < 0 ? "negative" : "positive"}>{formatCurrency(profit.expectedProfit)}</dd></div>
              </dl>
              <div className={`document-indicator ${vehicle.documentsComplete ? "complete" : "missing"}`}>
                {vehicle.documentsComplete ? <CheckCircle2 size={17} /> : <FileWarning size={17} />}
                {vehicle.documentsComplete ? "必要書類 確認済み" : "書類の確認が必要"}
              </div>
            </button>
          );
        })}
      </section>

      {filteredVehicles.length === 0 ? (
        <div className="empty-state panel">
          <Car size={34} />
          <h2>該当する車両がありません</h2>
          <p>検索条件を変更するか、新しい車両を登録してください。</p>
        </div>
      ) : null}

      {drawerMode === "new" ? (
        <Drawer title="車両を登録" subtitle="分かる情報だけで仮登録できます。" onClose={() => setDrawerMode(null)}>
          <form className="form-stack" onSubmit={submitVehicle}>
            <div className="form-section">
              <h3>基本情報</h3>
              <label className="field-label">
                車両名 <span className="required">必須</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="例：軽ハイトワゴン"
                  autoFocus
                />
              </label>
              <label className="field-label">
                車台番号
                <input
                  value={form.chassisNumber}
                  onChange={(event) => setForm({ ...form, chassisNumber: event.target.value })}
                  placeholder="未確認なら空欄で登録できます"
                />
              </label>
              <div className="form-row">
                <label className="field-label">
                  仕入れ元
                  <select
                    value={form.acquisitionSource}
                    onChange={(event) => setForm({ ...form, acquisitionSource: event.target.value as AcquisitionSource })}
                  >
                    {acquisitionSources.map((source) => <option key={source}>{source}</option>)}
                  </select>
                </label>
                <label className="field-label">
                  状態
                  <select
                    value={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.value as VehicleStatus })}
                  >
                    {vehicleStatuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div className="form-section">
              <h3>金額・入庫</h3>
              <div className="form-row">
                <label className="field-label">
                  仕入額（税込）
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.purchasePrice}
                    onChange={(event) => setForm({ ...form, purchasePrice: Number(event.target.value) })}
                  />
                </label>
                <label className="field-label">
                  販売価格（税込）
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.askingPrice}
                    onChange={(event) => setForm({ ...form, askingPrice: Number(event.target.value) })}
                  />
                </label>
              </div>
              <div className="form-row">
                <label className="field-label">
                  入庫予定日
                  <input
                    type="date"
                    value={form.plannedArrivalDate}
                    onChange={(event) => setForm({ ...form, plannedArrivalDate: event.target.value })}
                  />
                </label>
                <label className="field-label">
                  保管場所
                  <input
                    value={form.storageLocation}
                    onChange={(event) => setForm({ ...form, storageLocation: event.target.value })}
                  />
                </label>
              </div>
            </div>

            {formError ? <p className="form-error">{formError}</p> : null}
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={() => setDrawerMode(null)}>キャンセル</button>
              <button type="submit" className="primary-button" disabled={submitting}>{submitting ? "登録中" : "登録する"}</button>
            </div>
          </form>
        </Drawer>
      ) : null}

      {drawerMode === "detail" && selectedVehicle ? (
        <VehicleDetailDrawer
          vehicle={selectedVehicle}
          expenses={data.expenses}
          onClose={() => setDrawerMode(null)}
          onUpdate={(patch) => updateVehicle(selectedVehicle.id, patch)}
          canEdit={canEdit}
        />
      ) : null}
    </>
  );
}

function VehicleDetailDrawer({
  vehicle,
  expenses,
  onClose,
  onUpdate,
  canEdit,
}: {
  vehicle: Vehicle;
  expenses: ReturnType<typeof useAppData>["data"]["expenses"];
  onClose: () => void;
  onUpdate: (patch: Partial<Vehicle>) => Promise<void>;
  canEdit: boolean;
}) {
  const profit = calculateVehicleProfit(vehicle, expenses);
  const [updateError, setUpdateError] = useState("");

  const commitUpdate = async (patch: Partial<Vehicle>) => {
    setUpdateError("");
    try {
      await onUpdate(patch);
    } catch (reason) {
      setUpdateError(reason instanceof Error ? reason.message : "変更を保存できませんでした。");
    }
  };

  const changeStatus = async (status: VehicleStatus) => {
    const patch: Partial<Vehicle> = { status };
    if (status !== "入庫予定" && !vehicle.arrivedAt) {
      patch.arrivedAt = new Date().toISOString().slice(0, 10);
    }
    if (status === "納車済み" && !vehicle.deliveredAt) {
      patch.deliveredAt = new Date().toISOString().slice(0, 10);
    }
    await commitUpdate(patch);
  };

  return (
    <Drawer title={vehicle.name} subtitle={vehicle.managementNumber} onClose={onClose}>
      <div className="detail-hero">
        <span className="vehicle-thumbnail large"><Car size={42} /></span>
        <div><StatusBadge>{vehicle.status}</StatusBadge><p>{vehicle.acquisitionSource}</p></div>
      </div>

      <section className="detail-section">
        <h3>進行状況</h3>
        <label className="field-label">
          車両の状態
          <select value={vehicle.status} disabled={!canEdit} onChange={(event) => void changeStatus(event.target.value as VehicleStatus)}>
            {vehicleStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={vehicle.documentsComplete}
            disabled={!canEdit}
            onChange={(event) => void commitUpdate({ documentsComplete: event.target.checked })}
          />
          <span>
            <strong>必要書類を確認済みにする</strong>
            <small>入庫後に不足が分かった場合は、もう一度外せます。</small>
          </span>
        </label>
        {!canEdit ? <p className="form-hint">経理権限では車両情報を閲覧できますが、変更はできません。</p> : null}
        {updateError ? <p className="form-error">{updateError}</p> : null}
      </section>

      <section className="detail-section">
        <h3>車両情報</h3>
        <dl className="detail-list">
          <div><dt>車台番号</dt><dd>{vehicle.chassisNumber || "未入力"}</dd></div>
          <div><dt>保管場所</dt><dd>{vehicle.storageLocation}</dd></div>
          <div><dt>入庫予定日</dt><dd>{formatDate(vehicle.plannedArrivalDate)}</dd></div>
          <div><dt>実際の入庫日</dt><dd>{formatDate(vehicle.arrivedAt)}</dd></div>
          <div><dt>納車日</dt><dd>{formatDate(vehicle.deliveredAt)}</dd></div>
        </dl>
      </section>

      <section className="detail-section">
        <h3>利益の確認</h3>
        <dl className="amount-summary">
          <div><dt>販売価格</dt><dd>{formatCurrency(profit.revenueBasis)}</dd></div>
          <div><dt>仕入額</dt><dd>− {formatCurrency(vehicle.purchasePrice)}</dd></div>
          <div><dt>確定費用</dt><dd>− {formatCurrency(profit.confirmedExpenses)}</dd></div>
          <div><dt>予定費用</dt><dd>− {formatCurrency(profit.plannedExpenses)}</dd></div>
          <div className="total"><dt>予想利益</dt><dd className={profit.expectedProfit < 0 ? "negative" : "positive"}>{formatCurrency(profit.expectedProfit)}</dd></div>
        </dl>
      </section>
    </Drawer>
  );
}
