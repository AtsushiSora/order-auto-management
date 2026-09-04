import { ExternalLink, Eye, FileSignature, Plus, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { Drawer } from "../components/Drawer";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { createContractHandoff, getContractAppUrl, isSameOriginContractHandoff } from "../lib/contractHandoff";
import { formatCurrency, formatDate } from "../lib/format";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
import type { Contract, SaleContractInput } from "../types";

const today = () => new Date().toISOString().slice(0, 10);

export function ContractsPage({ type }: { type: "買取" | "販売" }) {
  const { data, savePurchaseContract, saveSaleContract, issueDirectContractHandoff } = useAppData();
  const { profile } = useAuth();
  const canEdit = profile?.role === "owner" || profile?.role === "regular";
  const contracts = data.contracts.filter((contract) => contract.type === type);
  const Icon = type === "買取" ? FileSignature : ShoppingCart;
  const [saleDrawerOpen, setSaleDrawerOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [saleVehicleId, setSaleVehicleId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const availableSaleVehicles = data.vehicles.filter((vehicle) => ["入庫済み", "販売中"].includes(vehicle.status));

  const ensurePublicOrigin = (target: "purchase" | "sale") => {
    if (isSameOriginContractHandoff(window.location.origin, getContractAppUrl(target))) return true;
    setError("契約サイトへの連携は公開版の管理システムから実行してください。");
    return false;
  };

  const openPurchaseSite = async () => {
    if (!ensurePublicOrigin("purchase")) return;
    setSubmitting(true); setError("");
    let storageKey = "";
    try {
      const contractId = await savePurchaseContract({ contractId: null, customerLabel: "契約サイトで入力", amount: 0, status: "署名待ち", contractedOn: today(), vehicleName: "車両情報入力待ち", chassisNumber: "", acquisitionSource: "一般のお客様", askingPrice: 0, storageLocation: "自宅", plannedArrivalDate: today(), paymentMethod: "振込" });
      const completion = await issueDirectContractHandoff(contractId);
      const handoff = createContractHandoff(window.sessionStorage, "purchase", { assignmentId: null, completionToken: completion.completionToken, customerName: "", contractDate: today(), vehicleName: "", chassisNumber: "", amount: 0, plannedArrivalDate: today(), storageLocation: "自宅", paymentMethod: "振込" });
      storageKey = handoff.storageKey;
      window.location.assign(handoff.url);
    } catch (reason) {
      if (storageKey) window.sessionStorage.removeItem(storageKey);
      setError(reason instanceof Error ? reason.message : "買取契約サイトを開けませんでした。");
      setSubmitting(false);
    }
  };

  const openSaleSite = async () => {
    if (!ensurePublicOrigin("sale")) return;
    const vehicle = data.vehicles.find((item) => item.id === saleVehicleId);
    if (!vehicle) return setError("販売する車両を選択してください。");
    setSubmitting(true); setError("");
    let storageKey = "";
    try {
      const input: SaleContractInput = { contractId: null, vehicleId: vehicle.id, customerLabel: "契約サイトで入力", amount: 0, status: "署名待ち", contractedOn: today(), paymentMethod: "振込" };
      const contractId = await saveSaleContract(input);
      const completion = await issueDirectContractHandoff(contractId);
      const handoff = createContractHandoff(window.sessionStorage, "sale", { assignmentId: null, completionToken: completion.completionToken, customerName: "", contractDate: today(), vehicleName: vehicle.model || vehicle.name, vehicleMaker: vehicle.maker || vehicle.publicMaker, vehicleGrade: vehicle.grade || vehicle.publicGrade, vehicleYear: vehicle.firstRegistration || vehicle.publicYear, chassisNumber: vehicle.chassisNumber, managementNumber: vehicle.managementNumber, vehicleMileage: vehicle.mileage || vehicle.publicMileage, vehicleColor: vehicle.bodyColor || vehicle.publicColor, inspectionDate: vehicle.inspectionExpiry || vehicle.publicInspection, amount: 0, paymentMethod: "振込" });
      storageKey = handoff.storageKey;
      window.location.assign(handoff.url);
    } catch (reason) {
      if (storageKey) window.sessionStorage.removeItem(storageKey);
      setError(reason instanceof Error ? reason.message : "販売契約サイトを開けませんでした。");
      setSubmitting(false);
    }
  };

  const resumeSelectedContract = async () => {
    const contract = selectedContract;
    if (!contract || contract.status !== "署名待ち") return;
    const target = contract.type === "買取" ? "purchase" : "sale";
    if (!ensurePublicOrigin(target)) return;

    const vehicle = contract.vehicleId ? data.vehicles.find((item) => item.id === contract.vehicleId) : undefined;
    if (target === "sale" && !vehicle) {
      setError("販売する車両が見つかりません。在庫を確認してください。");
      return;
    }

    setSubmitting(true);
    setError("");
    let storageKey = "";
    try {
      const completion = await issueDirectContractHandoff(contract.id);
      const handoff = target === "purchase"
        ? createContractHandoff(window.sessionStorage, "purchase", {
            assignmentId: null,
            completionToken: completion.completionToken,
            customerName: contract.customerLabel === "契約サイトで入力" ? "" : contract.customerLabel,
            contractDate: contract.contractedOn,
            vehicleName: contract.vehicleName === "車両情報入力待ち" ? "" : contract.vehicleName ?? "",
            chassisNumber: contract.chassisNumber ?? "",
            amount: contract.amount,
            plannedArrivalDate: contract.plannedArrivalDate ?? today(),
            storageLocation: contract.storageLocation ?? "自宅",
            paymentMethod: contract.paymentMethod ?? "振込",
          })
        : createContractHandoff(window.sessionStorage, "sale", {
            assignmentId: null,
            completionToken: completion.completionToken,
            customerName: contract.customerLabel === "契約サイトで入力" ? "" : contract.customerLabel,
            contractDate: contract.contractedOn,
            vehicleName: vehicle!.model || vehicle!.name,
            vehicleMaker: vehicle!.maker || vehicle!.publicMaker,
            vehicleGrade: vehicle!.grade || vehicle!.publicGrade,
            vehicleYear: vehicle!.firstRegistration || vehicle!.publicYear,
            chassisNumber: vehicle!.chassisNumber,
            managementNumber: vehicle!.managementNumber,
            vehicleMileage: vehicle!.mileage || vehicle!.publicMileage,
            vehicleColor: vehicle!.bodyColor || vehicle!.publicColor,
            inspectionDate: vehicle!.inspectionExpiry || vehicle!.publicInspection,
            amount: contract.amount,
            paymentMethod: contract.salePaymentMethod ?? "振込",
          });
      storageKey = handoff.storageKey;
      window.location.assign(handoff.url);
    } catch (reason) {
      if (storageKey) window.sessionStorage.removeItem(storageKey);
      setError(reason instanceof Error ? reason.message : "契約サイトで入力を再開できませんでした。");
      setSubmitting(false);
    }
  };

  const startNew = () => {
    setError("");
    if (type === "買取") void openPurchaseSite();
    else { setSaleVehicleId(""); setSaleDrawerOpen(true); }
  };

  return <>
    <PageHeader title={`${type}契約`} description={type === "買取" ? "契約内容は買取契約サイトで入力し、完了後に在庫・支払い予定へ自動反映します。" : "在庫車両だけ選び、契約内容は販売契約サイトで入力します。"} action={canEdit ? <button type="button" className="primary-button" disabled={submitting} onClick={startNew}><Plus size={20} />{submitting ? "準備中" : `${type}契約サイトを開く`}</button> : undefined} />
    <div className="integration-banner connected"><Icon size={23} /><div><strong>管理システムでの二重入力は不要です</strong><span>{type === "買取" ? "お客様・車両・金額は契約サイトで入力します。契約完了時に管理へ自動登録されます。" : "管理では対象在庫だけを選択し、お客様・金額は契約サイトで入力します。"}</span></div><span className="phase-chip">自動連携</span></div>
    {error ? <p className="form-error">{error}</p> : null}

    <section className="panel table-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>契約日</th><th>車両</th><th>お客様・取引先</th><th>状態</th><th className="number-cell">契約金額</th><th>操作</th></tr></thead><tbody>{contracts.map((contract) => { const vehicle = data.vehicles.find((item) => item.id === contract.vehicleId); return <tr key={contract.id}><td className="muted-cell">{formatDate(contract.contractedOn)}</td><td><span className="vehicle-reference"><strong>{vehicle?.managementNumber ?? "在庫登録前"}</strong><small>{vehicle?.name || contract.vehicleName || "契約サイトで入力中"}</small></span></td><td>{contract.customerLabel === "契約サイトで入力" ? "入力中" : contract.customerLabel}</td><td><StatusBadge>{contract.status}</StatusBadge></td><td className="number-cell"><strong>{formatCurrency(contract.amount)}</strong></td><td><button type="button" className="table-action-button" onClick={() => setSelectedContract(contract)}><Eye size={16} />確認</button></td></tr>; })}</tbody></table></div>{contracts.length === 0 ? <div className="table-empty"><Icon size={28} /><p>{type}契約はまだありません。</p></div> : null}</section>

    {saleDrawerOpen ? <Drawer title="販売する車両を選択" subtitle="お客様情報と販売金額は販売契約サイトで入力します" onClose={() => setSaleDrawerOpen(false)}><div className="form-stack"><section className="form-section"><label className="field-label">対象車両 <span className="required">必須</span><select value={saleVehicleId} onChange={(event) => setSaleVehicleId(event.target.value)}><option value="">選択してください</option>{availableSaleVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.managementNumber}　{vehicle.name}（{vehicle.status}）</option>)}</select></label>{availableSaleVehicles.length === 0 ? <p className="form-hint">入庫済みまたは販売中の車両がありません。</p> : null}</section>{error ? <p className="form-error">{error}</p> : null}<div className="form-actions"><button type="button" className="secondary-button" onClick={() => setSaleDrawerOpen(false)}>キャンセル</button><button type="button" className="primary-button" disabled={submitting || !saleVehicleId} onClick={() => void openSaleSite()}><ExternalLink size={18} />{submitting ? "準備中" : "販売契約サイトへ進む"}</button></div></div></Drawer> : null}

    {selectedContract ? <Drawer title={`${selectedContract.type}契約を確認`} subtitle={selectedContract.status} onClose={() => setSelectedContract(null)}><div className="form-stack"><section className="detail-section"><dl className="detail-list"><div><dt>契約日</dt><dd>{formatDate(selectedContract.contractedOn)}</dd></div><div><dt>お客様・取引先</dt><dd>{selectedContract.customerLabel}</dd></div><div><dt>車両</dt><dd>{data.vehicles.find((item) => item.id === selectedContract.vehicleId)?.name || selectedContract.vehicleName || "入力中"}</dd></div><div><dt>契約金額</dt><dd>{formatCurrency(selectedContract.amount)}</dd></div><div><dt>状態</dt><dd>{selectedContract.status}</dd></div></dl></section>{selectedContract.status === "署名待ち" ? <button type="button" className="primary-button full-button" disabled={submitting} onClick={() => void resumeSelectedContract()}><ExternalLink size={18} />{submitting ? "準備中" : "契約サイトで入力を再開"}</button> : <a className="primary-button full-button" href={getContractAppUrl(selectedContract.type === "買取" ? "purchase" : "sale")}><ExternalLink size={18} />契約サイトで確認・修正</a>}<p className="form-hint">{selectedContract.status === "署名待ち" ? "以前の連携は無効にし、この契約の新しい連携を発行します。空の契約は増えません。" : "契約サイトで修正して保存すると、契約履歴が残ります。"}</p>{error ? <p className="form-error">{error}</p> : null}</div></Drawer> : null}
  </>;
}
