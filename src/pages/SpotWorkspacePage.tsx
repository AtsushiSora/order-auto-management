import {
  BriefcaseBusiness,
  ExternalLink,
  FileSignature,
  Handshake,
  Plus,
  ShoppingCart,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Drawer } from "../components/Drawer";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import {
  createContractHandoff,
  isSameOriginContractHandoff,
} from "../lib/contractHandoff";
import { formatCurrency, formatDate } from "../lib/format";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
import type {
  AcquisitionSource,
  ContractStatus,
  PaymentMethod,
  PurchaseContractInput,
  SaleContractInput,
  SpotAssignment,
  StaffBusinessType,
} from "../types";

const businessTypes: StaffBusinessType[] = [
  "販売",
  "買取・オークション",
  "廃車",
];
const acquisitionSources: AcquisitionSource[] = [
  "一般のお客様",
  "オークション",
  "業者",
  "保険関係",
];
const paymentMethods: PaymentMethod[] = [
  "振込",
  "現金",
  "ローン会社",
  "カード",
  "その他",
];
const contractStatuses: Array<Exclude<ContractStatus, "キャンセル済み">> = [
  "下書き",
  "署名待ち",
  "契約済み",
];

const newPurchase = (): PurchaseContractInput => ({
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

export function SpotWorkspacePage() {
  const { profile } = useAuth();
  const {
    data,
    createSpotReferral,
    updateSpotReferral,
    saveSpotPurchaseContract,
    saveSpotSaleContract,
  } = useAppData();
  const assignments = data.spotAssignments.filter(
    (item) => item.staffId === profile?.id,
  );
  const activeCount = assignments.filter(
    (item) => item.status === "進行中",
  ).length;
  const [referralOpen, setReferralOpen] = useState(false);
  const [editingReferral, setEditingReferral] = useState<SpotAssignment | null>(
    null,
  );
  const [businessType, setBusinessType] = useState<StaffBusinessType>("販売");
  const [leadLabel, setLeadLabel] = useState("");
  const [referralNote, setReferralNote] = useState("");
  const [contractAssignment, setContractAssignment] =
    useState<SpotAssignment | null>(null);
  const [purchaseForm, setPurchaseForm] =
    useState<PurchaseContractInput>(newPurchase);
  const [saleForm, setSaleForm] = useState<SaleContractInput>({
    contractId: null,
    vehicleId: "",
    customerLabel: "",
    amount: 0,
    status: "下書き",
    contractedOn: new Date().toISOString().slice(0, 10),
    paymentMethod: "振込",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const vehicleLabel = (id: string | null) => {
    const vehicle = data.vehicles.find((item) => item.id === id);
    return vehicle
      ? `${vehicle.managementNumber} ${vehicle.name}`
      : "車両登録前";
  };

  const openReferral = (assignment?: SpotAssignment) => {
    setEditingReferral(assignment ?? null);
    setBusinessType(assignment?.businessType ?? "販売");
    setLeadLabel(assignment?.leadLabel ?? "");
    setReferralNote(assignment?.referralNote ?? "");
    setError("");
    setReferralOpen(true);
  };

  const submitReferral = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editingReferral)
        await updateSpotReferral(editingReferral.id, leadLabel, referralNote);
      else await createSpotReferral(businessType, leadLabel, referralNote);
      setReferralOpen(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "紹介を保存できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };

  const openContract = (assignment: SpotAssignment) => {
    const contract = data.contracts.find(
      (item) => item.id === assignment.contractId,
    );
    const vehicle = data.vehicles.find(
      (item) => item.id === assignment.vehicleId,
    );
    setContractAssignment(assignment);
    setError("");
    if (assignment.businessType === "販売") {
      setSaleForm({
        contractId: contract?.id ?? null,
        vehicleId: assignment.vehicleId ?? "",
        customerLabel: contract?.customerLabel ?? assignment.leadLabel,
        amount: contract?.amount ?? vehicle?.askingPrice ?? 0,
        status:
          contract?.status === "キャンセル済み"
            ? "下書き"
            : (contract?.status ?? "下書き"),
        contractedOn:
          contract?.contractedOn ?? new Date().toISOString().slice(0, 10),
        paymentMethod: contract?.salePaymentMethod ?? "振込",
      });
    } else {
      setPurchaseForm({
        contractId: contract?.id ?? null,
        customerLabel: contract?.customerLabel ?? assignment.leadLabel,
        amount: contract?.amount ?? 0,
        status:
          contract?.status === "キャンセル済み"
            ? "下書き"
            : (contract?.status ?? "下書き"),
        contractedOn:
          contract?.contractedOn ?? new Date().toISOString().slice(0, 10),
        vehicleName: contract?.vehicleName ?? "",
        chassisNumber: contract?.chassisNumber ?? "",
        acquisitionSource: contract?.acquisitionSource ?? "一般のお客様",
        askingPrice: contract?.askingPrice ?? 0,
        storageLocation: contract?.storageLocation ?? "自宅",
        plannedArrivalDate:
          contract?.plannedArrivalDate ?? new Date().toISOString().slice(0, 10),
        paymentMethod: contract?.paymentMethod ?? "振込",
      });
    }
  };

  const submitPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contractAssignment) return;
    if (!purchaseForm.customerLabel.trim() || !purchaseForm.vehicleName.trim())
      return setError("お客様名と車両名を入力してください。");
    setBusy(true);
    setError("");
    try {
      await saveSpotPurchaseContract(contractAssignment.id, purchaseForm);
      setContractAssignment(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "買取契約を保存できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!contractAssignment) return;
    if (!saleForm.customerLabel.trim())
      return setError("お客様名を入力してください。");
    setBusy(true);
    setError("");
    try {
      await saveSpotSaleContract(contractAssignment.id, saleForm);
      setContractAssignment(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "販売契約を保存できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  };

  const launchPurchaseContractSystem = async () => {
    if (!contractAssignment) return;
    if (!purchaseForm.customerLabel.trim() || !purchaseForm.vehicleName.trim())
      return setError("お客様名と車両名を入力してください。");
    let handoffStorageKey = "";
    setBusy(true);
    setError("");
    try {
      const nextForm = { ...purchaseForm, status: "署名待ち" as const };
      const handoff = createContractHandoff(window.sessionStorage, "purchase", {
        assignmentId: contractAssignment.id,
        customerName: nextForm.customerLabel.trim(),
        contractDate: nextForm.contractedOn,
        vehicleName: nextForm.vehicleName.trim(),
        chassisNumber: nextForm.chassisNumber.trim(),
        amount: nextForm.amount,
        plannedArrivalDate: nextForm.plannedArrivalDate,
        storageLocation: nextForm.storageLocation.trim(),
        paymentMethod: nextForm.paymentMethod,
      });
      handoffStorageKey = handoff.storageKey;
      if (!isSameOriginContractHandoff(window.location.origin, handoff.url)) {
        window.sessionStorage.removeItem(handoff.storageKey);
        throw new Error(
          "入力引き継ぎは公開版の管理システムから実行してください。",
        );
      }
      await saveSpotPurchaseContract(contractAssignment.id, nextForm);
      window.location.assign(handoff.url);
    } catch (reason) {
      if (handoffStorageKey) window.sessionStorage.removeItem(handoffStorageKey);
      setError(
        reason instanceof Error
          ? reason.message
          : "買取契約システムへ引き継げませんでした。",
      );
      setBusy(false);
    }
  };

  const launchSaleContractSystem = async () => {
    if (!contractAssignment) return;
    const vehicle = data.vehicles.find(
      (item) => item.id === contractAssignment.vehicleId,
    );
    if (!vehicle) return setError("対象車両が見つかりません。");
    if (!saleForm.customerLabel.trim())
      return setError("お客様名を入力してください。");
    let handoffStorageKey = "";
    setBusy(true);
    setError("");
    try {
      const nextForm = { ...saleForm, status: "署名待ち" as const };
      const handoff = createContractHandoff(window.sessionStorage, "sale", {
        assignmentId: contractAssignment.id,
        customerName: nextForm.customerLabel.trim(),
        contractDate: nextForm.contractedOn,
        vehicleName: vehicle.name,
        chassisNumber: vehicle.chassisNumber,
        managementNumber: vehicle.managementNumber,
        amount: nextForm.amount,
        paymentMethod: nextForm.paymentMethod,
      });
      handoffStorageKey = handoff.storageKey;
      if (!isSameOriginContractHandoff(window.location.origin, handoff.url)) {
        window.sessionStorage.removeItem(handoff.storageKey);
        throw new Error(
          "入力引き継ぎは公開版の管理システムから実行してください。",
        );
      }
      await saveSpotSaleContract(contractAssignment.id, nextForm);
      window.location.assign(handoff.url);
    } catch (reason) {
      if (handoffStorageKey) window.sessionStorage.removeItem(handoffStorageKey);
      setError(
        reason instanceof Error
          ? reason.message
          : "販売契約システムへ引き継げませんでした。",
      );
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="担当案件"
        description="自分に割り当てられた案件と、自分が登録した紹介だけを表示します。"
        action={
          <button
            type="button"
            className="primary-button"
            onClick={() => openReferral()}
          >
            <Plus size={20} />
            紹介を登録
          </button>
        }
      />
      <section className="mini-summary-grid">
        <div className="mini-summary-card blue">
          <small>進行中の案件</small>
          <strong>{activeCount}件</strong>
        </div>
        <div className="mini-summary-card green">
          <small>完了した案件</small>
          <strong>
            {assignments.filter((item) => item.status === "完了").length}件
          </strong>
        </div>
        <div className="mini-summary-card">
          <small>自分の精算</small>
          <strong>
            {
              data.staffSettlements.filter(
                (item) => item.staffId === profile?.id,
              ).length
            }
            件
          </strong>
        </div>
      </section>

      <section className="spot-assignment-grid">
        {assignments.map((assignment) => {
          const canContract =
            assignment.status === "進行中" &&
            assignment.engagementType === "契約から全て担当";
          const Icon =
            assignment.businessType === "販売"
              ? ShoppingCart
              : assignment.businessType === "廃車"
                ? Handshake
                : FileSignature;
          return (
            <article className="panel spot-assignment-card" key={assignment.id}>
              <div className="spot-assignment-heading">
                <span>
                  <Icon size={21} />
                </span>
                <div>
                  <strong>
                    {assignment.leadLabel || vehicleLabel(assignment.vehicleId)}
                  </strong>
                  <small>
                    {assignment.businessType}・{assignment.engagementType}
                  </small>
                </div>
                <StatusBadge>{assignment.status}</StatusBadge>
              </div>
              <dl>
                <div>
                  <dt>対象</dt>
                  <dd>{vehicleLabel(assignment.vehicleId)}</dd>
                </div>
                <div>
                  <dt>登録日</dt>
                  <dd>{formatDate(assignment.createdAt)}</dd>
                </div>
              </dl>
              {assignment.referralNote ? (
                <p>{assignment.referralNote}</p>
              ) : null}
              <div className="spot-assignment-actions">
                {assignment.status === "進行中" &&
                assignment.engagementType === "紹介のみ" ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => openReferral(assignment)}
                  >
                    紹介内容を修正
                  </button>
                ) : null}
                {canContract ? (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => openContract(assignment)}
                  >
                    {assignment.contractId
                      ? "契約を確認・修正"
                      : `${assignment.businessType === "販売" ? "販売" : "買取"}契約を入力`}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
        {!assignments.length ? (
          <div className="panel table-empty spot-assignment-empty">
            <BriefcaseBusiness size={32} />
            <p>担当案件はまだありません。紹介案件は右上から登録できます。</p>
          </div>
        ) : null}
      </section>

      {referralOpen ? (
        <Drawer
          title={editingReferral ? "紹介内容を修正" : "紹介を登録"}
          subtitle="登録した紹介は事業主にも共有されます。"
          onClose={() => setReferralOpen(false)}
        >
          <form className="form-stack" onSubmit={submitReferral}>
            <section className="form-section">
              <h3>紹介内容</h3>
              <label className="field-label">
                業務区分
                <select
                  value={businessType}
                  disabled={Boolean(editingReferral)}
                  onChange={(event) =>
                    setBusinessType(event.target.value as StaffBusinessType)
                  }
                >
                  {businessTypes.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                紹介先・案件名 <span className="required">必須</span>
                <input
                  maxLength={160}
                  value={leadLabel}
                  onChange={(event) => setLeadLabel(event.target.value)}
                  placeholder="お客様名・業者名・案件の呼び名"
                />
              </label>
              <label className="field-label">
                紹介内容
                <textarea
                  maxLength={1000}
                  value={referralNote}
                  onChange={(event) => setReferralNote(event.target.value)}
                  placeholder="連絡先を直接書く場合は必要な範囲だけ入力してください"
                />
              </label>
            </section>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setReferralOpen(false)}
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={busy || !leadLabel.trim()}
              >
                {busy ? "保存中" : "保存する"}
              </button>
            </div>
          </form>
        </Drawer>
      ) : null}

      {contractAssignment && contractAssignment.businessType !== "販売" ? (
        <Drawer
          title="買取契約を入力"
          subtitle="この担当案件の契約だけを操作できます。"
          onClose={() => setContractAssignment(null)}
        >
          <form className="form-stack" onSubmit={submitPurchase}>
            <section className="form-section">
              <h3>契約情報</h3>
              <label className="field-label">
                お客様名・取引先名 <span className="required">必須</span>
                <input
                  value={purchaseForm.customerLabel}
                  disabled={purchaseForm.status === "契約済み"}
                  onChange={(event) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      customerLabel: event.target.value,
                    })
                  }
                />
              </label>
              <div className="form-row">
                <label className="field-label">
                  契約日
                  <input
                    type="date"
                    value={purchaseForm.contractedOn}
                    disabled={purchaseForm.status === "契約済み"}
                    onChange={(event) =>
                      setPurchaseForm({
                        ...purchaseForm,
                        contractedOn: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  状態
                  <select
                    value={purchaseForm.status}
                    disabled={purchaseForm.status === "契約済み"}
                    onChange={(event) =>
                      setPurchaseForm({
                        ...purchaseForm,
                        status: event.target
                          .value as PurchaseContractInput["status"],
                      })
                    }
                  >
                    {contractStatuses.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label className="field-label">
                  買取金額（税込）
                  <input
                    type="number"
                    min="0"
                    value={purchaseForm.amount}
                    disabled={purchaseForm.status === "契約済み"}
                    onChange={(event) =>
                      setPurchaseForm({
                        ...purchaseForm,
                        amount: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  支払い方法
                  <select
                    value={purchaseForm.paymentMethod}
                    disabled={purchaseForm.status === "契約済み"}
                    onChange={(event) =>
                      setPurchaseForm({
                        ...purchaseForm,
                        paymentMethod: event.target.value as PaymentMethod,
                      })
                    }
                  >
                    {paymentMethods.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
            <section className="form-section">
              <h3>車両・入庫情報</h3>
              <label className="field-label">
                車両名 <span className="required">必須</span>
                <input
                  value={purchaseForm.vehicleName}
                  disabled={purchaseForm.status === "契約済み"}
                  onChange={(event) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      vehicleName: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field-label">
                車台番号
                <input
                  value={purchaseForm.chassisNumber}
                  disabled={purchaseForm.status === "契約済み"}
                  onChange={(event) =>
                    setPurchaseForm({
                      ...purchaseForm,
                      chassisNumber: event.target.value,
                    })
                  }
                />
              </label>
              <div className="form-row">
                <label className="field-label">
                  仕入れ元
                  <select
                    value={purchaseForm.acquisitionSource}
                    disabled={purchaseForm.status === "契約済み"}
                    onChange={(event) =>
                      setPurchaseForm({
                        ...purchaseForm,
                        acquisitionSource: event.target
                          .value as AcquisitionSource,
                      })
                    }
                  >
                    {acquisitionSources.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  販売予定価格（税込）
                  <input
                    type="number"
                    min="0"
                    value={purchaseForm.askingPrice}
                    disabled={purchaseForm.status === "契約済み"}
                    onChange={(event) =>
                      setPurchaseForm({
                        ...purchaseForm,
                        askingPrice: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <div className="form-row">
                <label className="field-label">
                  入庫予定日
                  <input
                    type="date"
                    value={purchaseForm.plannedArrivalDate}
                    disabled={purchaseForm.status === "契約済み"}
                    onChange={(event) =>
                      setPurchaseForm({
                        ...purchaseForm,
                        plannedArrivalDate: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  保管場所
                  <input
                    value={purchaseForm.storageLocation}
                    disabled={purchaseForm.status === "契約済み"}
                    onChange={(event) =>
                      setPurchaseForm({
                        ...purchaseForm,
                        storageLocation: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            </section>
            {purchaseForm.status === "契約済み" ? (
              <p className="form-hint">契約済みのため確認のみです。</p>
            ) : (
              <p className="form-hint">
                契約システムへ進むと、入力内容を署名待ちで保存し、10分間だけ安全に引き継ぎます。
              </p>
            )}
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setContractAssignment(null)}
              >
                閉じる
              </button>
              {purchaseForm.status !== "契約済み" ? (
                <>
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={busy}
                  >
                    {busy ? "保存中" : "保存する"}
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy}
                    onClick={launchPurchaseContractSystem}
                  >
                    <ExternalLink size={18} />買取契約システムへ
                  </button>
                </>
              ) : null}
            </div>
          </form>
        </Drawer>
      ) : null}

      {contractAssignment?.businessType === "販売" ? (
        <Drawer
          title="販売契約を入力"
          subtitle="割り当てられた車両だけを契約できます。"
          onClose={() => setContractAssignment(null)}
        >
          <form className="form-stack" onSubmit={submitSale}>
            <section className="form-section">
              <h3>販売車両</h3>
              <div className="document-source-preview">
                <span>
                  対象車両
                  <strong>{vehicleLabel(contractAssignment.vehicleId)}</strong>
                </span>
                <span>
                  販売予定価格
                  <strong>
                    {formatCurrency(
                      data.vehicles.find(
                        (item) => item.id === contractAssignment.vehicleId,
                      )?.askingPrice ?? 0,
                    )}
                  </strong>
                </span>
              </div>
            </section>
            <section className="form-section">
              <h3>契約情報</h3>
              <label className="field-label">
                お客様名 <span className="required">必須</span>
                <input
                  value={saleForm.customerLabel}
                  disabled={saleForm.status === "契約済み"}
                  onChange={(event) =>
                    setSaleForm({
                      ...saleForm,
                      customerLabel: event.target.value,
                    })
                  }
                />
              </label>
              <div className="form-row">
                <label className="field-label">
                  契約日
                  <input
                    type="date"
                    value={saleForm.contractedOn}
                    disabled={saleForm.status === "契約済み"}
                    onChange={(event) =>
                      setSaleForm({
                        ...saleForm,
                        contractedOn: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  状態
                  <select
                    value={saleForm.status}
                    disabled={saleForm.status === "契約済み"}
                    onChange={(event) =>
                      setSaleForm({
                        ...saleForm,
                        status: event.target
                          .value as SaleContractInput["status"],
                      })
                    }
                  >
                    {contractStatuses.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label className="field-label">
                  販売金額（税込）
                  <input
                    type="number"
                    min="0"
                    value={saleForm.amount}
                    disabled={saleForm.status === "契約済み"}
                    onChange={(event) =>
                      setSaleForm({
                        ...saleForm,
                        amount: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  入金方法
                  <select
                    value={saleForm.paymentMethod}
                    disabled={saleForm.status === "契約済み"}
                    onChange={(event) =>
                      setSaleForm({
                        ...saleForm,
                        paymentMethod: event.target.value as PaymentMethod,
                      })
                    }
                  >
                    {paymentMethods.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
            {saleForm.status === "契約済み" ? (
              <p className="form-hint">契約済みのため確認のみです。</p>
            ) : (
              <p className="form-hint">
                契約システムへ進むと、入力内容を署名待ちで保存し、10分間だけ安全に引き継ぎます。
              </p>
            )}
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setContractAssignment(null)}
              >
                閉じる
              </button>
              {saleForm.status !== "契約済み" ? (
                <>
                  <button
                    type="submit"
                    className="secondary-button"
                    disabled={busy}
                  >
                    {busy ? "保存中" : "保存する"}
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy}
                    onClick={launchSaleContractSystem}
                  >
                    <ExternalLink size={18} />販売契約システムへ
                  </button>
                </>
              ) : null}
            </div>
          </form>
        </Drawer>
      ) : null}
    </>
  );
}
