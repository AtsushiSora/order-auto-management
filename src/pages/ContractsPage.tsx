import { ExternalLink, Eye, FileSignature, Plus, ShoppingCart } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Drawer } from "../components/Drawer";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { createContractHandoff, getContractAppUrl, isSameOriginContractHandoff } from "../lib/contractHandoff";
import { formatCurrency, formatDate } from "../lib/format";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
import type {
  AcquisitionSource,
  Contract,
  ContractStatus,
  PaymentMethod,
  PurchaseContractInput,
  SaleContractInput,
} from "../types";

const acquisitionSources: AcquisitionSource[] = ["一般のお客様", "オークション", "業者", "保険関係"];
const paymentMethods: PaymentMethod[] = ["振込", "現金", "ローン会社", "カード", "その他"];
const editableStatuses: Array<Exclude<ContractStatus, "キャンセル済み">> = ["下書き", "署名待ち", "契約済み"];

const initialPurchaseForm = (): PurchaseContractInput => ({
  contractId: null,
  customerLabel: "",
  amount: 0,
  status: "下書き",
  contractedOn: new Date().toISOString().slice(0, 10),
  vehicleName: "",
  chassisNumber: "",
  acquisitionSource: "一般のお客様",
  askingPrice: 0,
  storageLocation: "自宅",
  plannedArrivalDate: new Date().toISOString().slice(0, 10),
  paymentMethod: "振込",
});

const initialSaleForm = (): SaleContractInput => ({
  contractId: null,
  vehicleId: "",
  customerLabel: "",
  amount: 0,
  status: "下書き",
  contractedOn: new Date().toISOString().slice(0, 10),
  paymentMethod: "振込",
});

export function ContractsPage({ type }: { type: "買取" | "販売" }) {
  const { data, savePurchaseContract, saveSaleContract, issueDirectContractHandoff } = useAppData();
  const { profile } = useAuth();
  const canEdit = profile?.role === "owner" || profile?.role === "regular";
  const contracts = data.contracts.filter((contract) => contract.type === type);
  const Icon = type === "買取" ? FileSignature : ShoppingCart;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<PurchaseContractInput>(initialPurchaseForm);
  const [saleForm, setSaleForm] = useState<SaleContractInput>(initialSaleForm);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const activeContractId = type === "買取" ? form.contractId : saleForm.contractId;
  const selectedContract = activeContractId ? data.contracts.find((contract) => contract.id === activeContractId) ?? null : null;
  const readOnly = !canEdit || selectedContract?.status === "契約済み";
  const availableSaleVehicles = data.vehicles.filter((vehicle) =>
    ["入庫済み", "販売中"].includes(vehicle.status) || vehicle.id === saleForm.vehicleId,
  );

  const openNew = () => {
    if (type === "買取") setForm(initialPurchaseForm());
    else setSaleForm(initialSaleForm());
    setError("");
    setDrawerOpen(true);
  };

  const openContract = (contract: Contract) => {
    if (contract.type === "販売") {
      setSaleForm({
        contractId: contract.id,
        vehicleId: contract.vehicleId ?? "",
        customerLabel: contract.customerLabel,
        amount: contract.amount,
        status: contract.status === "キャンセル済み" ? "下書き" : contract.status,
        contractedOn: contract.contractedOn,
        paymentMethod: contract.salePaymentMethod || "振込",
      });
      setError("");
      setDrawerOpen(true);
      return;
    }
    const vehicle = data.vehicles.find((item) => item.id === contract.vehicleId);
    setForm({
      contractId: contract.id,
      customerLabel: contract.customerLabel,
      amount: contract.amount,
      status: contract.status === "キャンセル済み" ? "下書き" : contract.status,
      contractedOn: contract.contractedOn,
      vehicleName: contract.vehicleName || vehicle?.name || "",
      chassisNumber: contract.chassisNumber || vehicle?.chassisNumber || "",
      acquisitionSource: contract.acquisitionSource || vehicle?.acquisitionSource || "一般のお客様",
      askingPrice: contract.askingPrice ?? vehicle?.askingPrice ?? 0,
      storageLocation: contract.storageLocation || vehicle?.storageLocation || "自宅",
      plannedArrivalDate: contract.plannedArrivalDate || vehicle?.plannedArrivalDate || new Date().toISOString().slice(0, 10),
      paymentMethod: contract.paymentMethod || "振込",
    });
    setError("");
    setDrawerOpen(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.customerLabel.trim()) return setError("お客様名・取引先名を入力してください。");
    if (!form.vehicleName.trim()) return setError("車両名を入力してください。");
    if (!form.storageLocation.trim()) return setError("保管場所を入力してください。");
    if (!form.contractedOn || !form.plannedArrivalDate) return setError("契約日と入庫予定日を入力してください。");
    if (form.amount < 0 || form.askingPrice < 0) return setError("金額は0円以上で入力してください。");
    setSubmitting(true);
    setError("");
    try {
      await savePurchaseContract({
        ...form,
        customerLabel: form.customerLabel.trim(),
        vehicleName: form.vehicleName.trim(),
        chassisNumber: form.chassisNumber.trim(),
        storageLocation: form.storageLocation.trim(),
      });
      setDrawerOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "買取契約を保存できませんでした。");
    } finally {
      setSubmitting(false);
    }
  };

  const submitSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!saleForm.vehicleId) return setError("販売する車両を選択してください。");
    if (!saleForm.customerLabel.trim()) return setError("お客様名を入力してください。");
    if (!saleForm.contractedOn) return setError("契約日を入力してください。");
    if (saleForm.amount < 0) return setError("販売金額は0円以上で入力してください。");
    if (saleForm.status === "契約済み" && saleForm.amount <= 0) return setError("契約済みにする場合は販売金額を1円以上で入力してください。");
    setSubmitting(true);
    setError("");
    try {
      await saveSaleContract({ ...saleForm, customerLabel: saleForm.customerLabel.trim() });
      setDrawerOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "販売契約を保存できませんでした。");
    } finally {
      setSubmitting(false);
    }
  };

  const launchPurchaseContractSystem = async () => {
    if (!isSameOriginContractHandoff(window.location.origin, getContractAppUrl("purchase"))) {
      return setError("契約書への入力引き継ぎは公開版の管理システムから実行してください。");
    }
    if (!form.customerLabel.trim()) return setError("お客様名・取引先名を入力してください。");
    if (!form.vehicleName.trim()) return setError("車両名を入力してください。");
    if (!form.storageLocation.trim()) return setError("保管場所を入力してください。");
    if (!form.contractedOn || !form.plannedArrivalDate) return setError("契約日と入庫予定日を入力してください。");
    if (form.amount < 0 || form.askingPrice < 0) return setError("金額は0円以上で入力してください。");

    let handoffStorageKey = "";
    setSubmitting(true);
    setError("");
    try {
      const nextForm = {
        ...form,
        customerLabel: form.customerLabel.trim(),
        vehicleName: form.vehicleName.trim(),
        chassisNumber: form.chassisNumber.trim(),
        storageLocation: form.storageLocation.trim(),
        status: "署名待ち" as const,
      };
      const contractId = await savePurchaseContract(nextForm);
      const completion = await issueDirectContractHandoff(contractId);
      const handoff = createContractHandoff(window.sessionStorage, "purchase", {
        assignmentId: null,
        completionToken: completion.completionToken,
        customerName: nextForm.customerLabel,
        contractDate: nextForm.contractedOn,
        vehicleName: nextForm.vehicleName,
        chassisNumber: nextForm.chassisNumber,
        amount: nextForm.amount,
        plannedArrivalDate: nextForm.plannedArrivalDate,
        storageLocation: nextForm.storageLocation,
        paymentMethod: nextForm.paymentMethod,
      });
      handoffStorageKey = handoff.storageKey;
      window.location.assign(handoff.url);
    } catch (reason) {
      if (handoffStorageKey) window.sessionStorage.removeItem(handoffStorageKey);
      setError(reason instanceof Error ? reason.message : "買取契約書を開けませんでした。");
      setSubmitting(false);
    }
  };

  const launchSaleContractSystem = async () => {
    if (!isSameOriginContractHandoff(window.location.origin, getContractAppUrl("sale"))) {
      return setError("契約書への入力引き継ぎは公開版の管理システムから実行してください。");
    }
    if (!saleForm.vehicleId) return setError("販売する車両を選択してください。");
    if (!saleForm.customerLabel.trim()) return setError("お客様名を入力してください。");
    if (!saleForm.contractedOn) return setError("契約日を入力してください。");
    if (saleForm.amount <= 0) return setError("販売金額は1円以上で入力してください。");
    const vehicle = data.vehicles.find((item) => item.id === saleForm.vehicleId);
    if (!vehicle || !["入庫済み", "販売中"].includes(vehicle.status)) {
      return setError("入庫済みまたは販売中の車両だけ販売契約できます。");
    }

    let handoffStorageKey = "";
    setSubmitting(true);
    setError("");
    try {
      const nextForm = { ...saleForm, customerLabel: saleForm.customerLabel.trim(), status: "署名待ち" as const };
      const contractId = await saveSaleContract(nextForm);
      const completion = await issueDirectContractHandoff(contractId);
      const handoff = createContractHandoff(window.sessionStorage, "sale", {
        assignmentId: null,
        completionToken: completion.completionToken,
        customerName: nextForm.customerLabel,
        contractDate: nextForm.contractedOn,
        vehicleName: vehicle.name,
        chassisNumber: vehicle.chassisNumber,
        managementNumber: vehicle.managementNumber,
        amount: nextForm.amount,
        paymentMethod: nextForm.paymentMethod,
      });
      handoffStorageKey = handoff.storageKey;
      window.location.assign(handoff.url);
    } catch (reason) {
      if (handoffStorageKey) window.sessionStorage.removeItem(handoffStorageKey);
      setError(reason instanceof Error ? reason.message : "販売契約書を開けませんでした。");
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={`${type}契約`}
        description={type === "買取" ? "契約済みにすると、在庫と買取代金の支払い予定へ自動で連動します。" : "販売契約を在庫車両へひもづけて管理します。"}
        action={canEdit ? <button type="button" className="primary-button" onClick={openNew}><Plus size={20} />{type}契約を作成</button> : undefined}
      />

      <div className="integration-banner connected">
        <Icon size={23} />
        <div>
          <strong>{type === "買取" ? "在庫・支払い予定と連携済み" : "在庫・入金予定と連携済み"}</strong>
          <span>{type === "買取" ? "下書きや署名待ちでは在庫を作らず、契約済みになった時だけ管理番号を発行します。" : "契約済みになった時だけ車両を売約済みにし、販売代金を未入金として登録します。"}</span>
        </div>
        <span className="phase-chip">連携中</span>
      </div>

      <section className="panel table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>契約日</th><th>車両</th><th>お客様・取引先</th><th>状態</th><th className="number-cell">契約金額</th><th>操作</th></tr></thead>
            <tbody>
              {contracts.map((contract) => {
                const vehicle = data.vehicles.find((item) => item.id === contract.vehicleId);
                return (
                  <tr key={contract.id}>
                    <td className="muted-cell">{formatDate(contract.contractedOn)}</td>
                    <td>
                      <span className="vehicle-reference">
                        <strong>{vehicle?.managementNumber ?? "在庫登録前"}</strong>
                        <small>{vehicle?.name || contract.vehicleName || "車両情報なし"}</small>
                      </span>
                    </td>
                    <td>{contract.customerLabel}</td>
                    <td><StatusBadge>{contract.status}</StatusBadge></td>
                    <td className="number-cell"><strong>{formatCurrency(contract.amount)}</strong></td>
                    <td><button type="button" className="table-action-button" onClick={() => openContract(contract)}><Eye size={16} />{contract.status === "契約済み" ? "確認" : "編集"}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {contracts.length === 0 ? <div className="table-empty"><Icon size={28} /><p>{type}契約はまだありません。</p></div> : null}
      </section>

      {drawerOpen && type === "買取" ? (
        <Drawer title={selectedContract ? "買取契約を確認" : "買取契約を作成"} subtitle={selectedContract?.status === "契約済み" ? "契約済み・在庫連携済み" : "下書きは後から修正できます"} onClose={() => setDrawerOpen(false)}>
          <form className="form-stack" onSubmit={submit}>
            <div className="form-section">
              <h3>契約情報</h3>
              <label className="field-label">お客様名・取引先名 <span className="required">必須</span><input value={form.customerLabel} disabled={readOnly} onChange={(event) => setForm({ ...form, customerLabel: event.target.value })} placeholder="一般のお客様名・会場名・業者名" autoFocus /></label>
              <div className="form-row">
                <label className="field-label">契約日 <span className="required">必須</span><input type="date" value={form.contractedOn} disabled={readOnly} onChange={(event) => setForm({ ...form, contractedOn: event.target.value })} /></label>
                <label className="field-label">契約状態<select value={form.status} disabled={readOnly} onChange={(event) => setForm({ ...form, status: event.target.value as PurchaseContractInput["status"] })}>{editableStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
              </div>
              <div className="form-row">
                <label className="field-label">買取金額（税込）<input type="number" min="0" value={form.amount} disabled={readOnly} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} /></label>
                <label className="field-label">支払い方法<select value={form.paymentMethod} disabled={readOnly} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as PaymentMethod })}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
              </div>
              {form.amount === 0 ? <p className="form-hint">0円買取として契約・在庫登録します。支払い予定は作成しません。</p> : null}
            </div>

            <div className="form-section">
              <h3>車両・入庫情報</h3>
              <label className="field-label">車両名 <span className="required">必須</span><input value={form.vehicleName} disabled={readOnly} onChange={(event) => setForm({ ...form, vehicleName: event.target.value })} placeholder="メーカー 車種 グレード" /></label>
              <label className="field-label">車台番号<input value={form.chassisNumber} disabled={readOnly} onChange={(event) => setForm({ ...form, chassisNumber: event.target.value })} placeholder="未確認なら空欄で登録できます" /></label>
              <div className="form-row">
                <label className="field-label">仕入れ元<select value={form.acquisitionSource} disabled={readOnly} onChange={(event) => setForm({ ...form, acquisitionSource: event.target.value as AcquisitionSource })}>{acquisitionSources.map((source) => <option key={source}>{source}</option>)}</select></label>
                <label className="field-label">販売予定価格（税込）<input type="number" min="0" value={form.askingPrice} disabled={readOnly} onChange={(event) => setForm({ ...form, askingPrice: Number(event.target.value) })} /></label>
              </div>
              <div className="form-row">
                <label className="field-label">入庫予定日 <span className="required">必須</span><input type="date" value={form.plannedArrivalDate} disabled={readOnly} onChange={(event) => setForm({ ...form, plannedArrivalDate: event.target.value })} /></label>
                <label className="field-label">保管場所 <span className="required">必須</span><input value={form.storageLocation} disabled={readOnly} onChange={(event) => setForm({ ...form, storageLocation: event.target.value })} /></label>
              </div>
            </div>

            {form.status === "契約済み" && !readOnly ? <div className="contract-link-notice"><strong>保存と同時に連携します</strong><span>車両管理番号を発行し、在庫を「入庫予定」で登録します。買取金額が1円以上なら未払い予定も作成します。</span></div> : null}
            {!readOnly ? <div className="contract-link-notice"><strong>既存の買取契約書へ引き継げます</strong><span>入力内容を署名待ちで保存し、買取契約システムを開きます。契約完了後に在庫と支払い予定へ一度だけ反映します。</span></div> : null}
            {readOnly ? <p className="form-hint">契約済みの車両情報・金額は、連携先の在庫画面から修正できます。</p> : null}
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={() => setDrawerOpen(false)}>{readOnly ? "閉じる" : "キャンセル"}</button>
              {!readOnly ? <button type="submit" className="secondary-button" disabled={submitting}>{submitting ? "保存中" : form.status === "契約済み" ? "契約して在庫へ登録" : "下書きを保存"}</button> : null}
              {!readOnly ? <button type="button" className="primary-button" disabled={submitting} onClick={() => void launchPurchaseContractSystem()}><ExternalLink size={18} />{submitting ? "準備中" : "買取契約書を開く"}</button> : null}
            </div>
          </form>
        </Drawer>
      ) : null}

      {drawerOpen && type === "販売" ? (
        <Drawer title={selectedContract ? "販売契約を確認" : "販売契約を作成"} subtitle={selectedContract?.status === "契約済み" ? "契約済み・売約／入金連携済み" : "下書きは後から修正できます"} onClose={() => setDrawerOpen(false)}>
          <form className="form-stack" onSubmit={submitSale}>
            <div className="form-section">
              <h3>販売車両</h3>
              <label className="field-label">対象車両 <span className="required">必須</span><select value={saleForm.vehicleId} disabled={readOnly} onChange={(event) => {
                const vehicle = data.vehicles.find((item) => item.id === event.target.value);
                setSaleForm({ ...saleForm, vehicleId: event.target.value, amount: saleForm.amount || vehicle?.askingPrice || 0 });
              }}><option value="">車両を選択してください</option>{availableSaleVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.managementNumber}　{vehicle.name}（{vehicle.status}）</option>)}</select></label>
              {availableSaleVehicles.length === 0 && !selectedContract ? <p className="form-hint">販売契約に使える入庫済み・販売中の車両がありません。</p> : null}
            </div>

            <div className="form-section">
              <h3>契約情報</h3>
              <label className="field-label">お客様名 <span className="required">必須</span><input value={saleForm.customerLabel} disabled={readOnly} onChange={(event) => setSaleForm({ ...saleForm, customerLabel: event.target.value })} placeholder="購入されるお客様名" autoFocus /></label>
              <div className="form-row">
                <label className="field-label">契約日 <span className="required">必須</span><input type="date" value={saleForm.contractedOn} disabled={readOnly} onChange={(event) => setSaleForm({ ...saleForm, contractedOn: event.target.value })} /></label>
                <label className="field-label">契約状態<select value={saleForm.status} disabled={readOnly} onChange={(event) => setSaleForm({ ...saleForm, status: event.target.value as SaleContractInput["status"] })}>{editableStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
              </div>
              <div className="form-row">
                <label className="field-label">販売金額（税込） <span className="required">必須</span><input type="number" min="0" value={saleForm.amount} disabled={readOnly} onChange={(event) => setSaleForm({ ...saleForm, amount: Number(event.target.value) })} /></label>
                <label className="field-label">入金方法<select value={saleForm.paymentMethod} disabled={readOnly} onChange={(event) => setSaleForm({ ...saleForm, paymentMethod: event.target.value as PaymentMethod })}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
              </div>
            </div>

            {saleForm.status === "契約済み" && !readOnly ? <div className="contract-link-notice"><strong>保存と同時に連携します</strong><span>対象車両を「売約済み」に変更し、販売代金を未入金として入出金へ登録します。</span></div> : null}
            {!readOnly ? <div className="contract-link-notice"><strong>既存の販売契約書へ引き継げます</strong><span>入力内容を署名待ちで保存し、販売契約システムを開きます。契約完了後に売約済みと入金予定へ一度だけ反映します。</span></div> : null}
            {readOnly ? <p className="form-hint">契約済みの入金・納車状況は、在庫または入出金画面から確認できます。</p> : null}
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={() => setDrawerOpen(false)}>{readOnly ? "閉じる" : "キャンセル"}</button>
              {!readOnly ? <button type="submit" className="secondary-button" disabled={submitting || availableSaleVehicles.length === 0}>{submitting ? "保存中" : saleForm.status === "契約済み" ? "契約して売約済みにする" : "下書きを保存"}</button> : null}
              {!readOnly ? <button type="button" className="primary-button" disabled={submitting || availableSaleVehicles.length === 0} onClick={() => void launchSaleContractSystem()}><ExternalLink size={18} />{submitting ? "準備中" : "販売契約書を開く"}</button> : null}
            </div>
          </form>
        </Drawer>
      ) : null}
    </>
  );
}
