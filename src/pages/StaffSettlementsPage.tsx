import { Ban, BriefcaseBusiness, CheckCircle2, HandCoins, Pencil, Plus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Drawer } from "../components/Drawer";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { calculateVehicleProfit } from "../lib/calculations";
import { formatCurrency } from "../lib/format";
import { calculateStaffPlannedAmount, staffSettlementCondition, staffSettlementDisplayAmount } from "../lib/staffSettlements";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
import type {
  PaymentMethod,
  SaveStaffSettlementInput,
  SaveSpotAssignmentInput,
  SpotAssignment,
  StaffBusinessType,
  StaffCalculationMethod,
  StaffEngagementType,
  StaffSettlement,
  StaffSettlementStatus,
} from "../types";

const paymentMethods: PaymentMethod[] = ["振込", "現金", "カード", "その他"];
const businessTypes: StaffBusinessType[] = ["販売", "買取・オークション", "廃車"];
const calculationMethods: StaffCalculationMethod[] = ["粗利率", "固定額", "手入力"];
const engagementTypes: StaffEngagementType[] = ["紹介のみ", "契約から全て担当"];

const initialForm = (staffId = "", vehicleId = ""): SaveStaffSettlementInput => ({
  settlementId: null,
  staffId,
  vehicleId,
  contractId: null,
  direction: "スタッフへ支給",
  engagementType: "紹介のみ",
  businessType: "販売",
  calculationMethod: "粗利率",
  grossProfitBasis: 0,
  ratePercent: 0,
  manualAmount: 0,
  paymentMethod: "振込",
  agreementConfirmed: false,
  agreementNote: "",
  note: "",
});

export function StaffSettlementsPage() {
  const { data, saveStaffSettlement, confirmStaffSettlement, settleStaffSettlement, cancelStaffSettlement, saveSpotAssignment, finishSpotAssignment } = useAppData();
  const { profile } = useAuth();
  const isOwner = profile?.role === "owner";
  const canConfirm = isOwner || profile?.role === "accounting";
  const eligibleStaff = data.staffProfiles.filter((staff) => staff.isActive && ["regular", "spot"].includes(staff.role));
  const spotStaff = data.staffProfiles.filter((staff) => staff.isActive && staff.role === "spot");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SaveStaffSettlementInput>(() => initialForm());
  const [confirming, setConfirming] = useState<StaffSettlement | null>(null);
  const [confirmedAmount, setConfirmedAmount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"すべて" | StaffSettlementStatus>("すべて");
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [busy, setBusy] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState<SaveSpotAssignmentInput>({
    assignmentId: null, staffId: "", engagementType: "紹介のみ", businessType: "販売",
    vehicleId: null, leadLabel: "", referralNote: "",
  });

  const roleVisibleSettlements = profile?.role === "spot" ? data.staffSettlements.filter((item) => item.staffId === profile.id) : data.staffSettlements;
  const visibleSettlements = roleVisibleSettlements.filter((item) => statusFilter === "すべて" || item.status === statusFilter);
  const linkedContracts = data.contracts.filter((contract) => contract.vehicleId === form.vehicleId);
  const previewAmount = calculateStaffPlannedAmount(form.calculationMethod, form.grossProfitBasis, form.ratePercent ?? 0, form.manualAmount);
  const totals = roleVisibleSettlements.reduce((result, settlement) => {
    if (settlement.status === "取消") return result;
    const amount = staffSettlementDisplayAmount(settlement);
    if (settlement.status === "精算済み") result.settled += amount;
    else if (settlement.direction === "スタッフへ支給") result.payable += amount;
    else result.receivable += amount;
    return result;
  }, { payable: 0, receivable: 0, settled: 0 });

  const profitForVehicle = (vehicleId: string) => {
    const vehicle = data.vehicles.find((item) => item.id === vehicleId);
    return vehicle ? Math.max(0, calculateVehicleProfit(vehicle, data.expenses).expectedProfit) : 0;
  };

  const openNew = () => {
    const vehicleId = data.vehicles[0]?.id ?? "";
    setForm({ ...initialForm(eligibleStaff[0]?.id ?? "", vehicleId), grossProfitBasis: profitForVehicle(vehicleId) });
    setError("");
    setFormOpen(true);
  };

  const openEdit = (settlement: StaffSettlement) => {
    setForm({
      settlementId: settlement.id,
      staffId: settlement.staffId,
      vehicleId: settlement.vehicleId,
      contractId: settlement.contractId,
      direction: settlement.direction,
      engagementType: settlement.engagementType,
      businessType: settlement.businessType,
      calculationMethod: settlement.calculationMethod,
      grossProfitBasis: settlement.grossProfitBasis,
      ratePercent: settlement.ratePercent,
      manualAmount: settlement.plannedAmount,
      paymentMethod: settlement.paymentMethod,
      agreementConfirmed: settlement.agreementConfirmed,
      agreementNote: settlement.agreementNote,
      note: settlement.note,
    });
    setError("");
    setFormOpen(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveStaffSettlement(form);
      setFormOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "スタッフ精算を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const openConfirm = (settlement: StaffSettlement) => {
    setConfirming(settlement);
    setConfirmedAmount(settlement.plannedAmount);
    setError("");
  };

  const confirmSettlement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!confirming) return;
    setBusy(true);
    setError("");
    try {
      await confirmStaffSettlement(confirming.id, confirmedAmount, new Date().toISOString().slice(0, 10));
      setConfirming(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "精算を確定できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const settle = async (settlement: StaffSettlement) => {
    const verb = settlement.direction === "スタッフへ支給" ? "支払済み" : "回収済み";
    if (!window.confirm(`${formatCurrency(staffSettlementDisplayAmount(settlement))}を${verb}にしますか？`)) return;
    setListError("");
    try { await settleStaffSettlement(settlement.id, new Date().toISOString().slice(0, 10)); }
    catch (reason) { setListError(reason instanceof Error ? reason.message : "精算を完了できませんでした。"); }
  };

  const cancel = async (settlement: StaffSettlement) => {
    if (!window.confirm("この精算を取り消しますか？履歴は残り、未処理の入出金は取り消されます。")) return;
    setListError("");
    try { await cancelStaffSettlement(settlement.id); }
    catch (reason) { setListError(reason instanceof Error ? reason.message : "精算を取り消せませんでした。"); }
  };

  const staffName = (id: string) => data.staffProfiles.find((staff) => staff.id === id)?.displayName ?? "スタッフ";
  const vehicleLabel = (id: string) => {
    const vehicle = data.vehicles.find((item) => item.id === id);
    return vehicle ? `${vehicle.managementNumber} ${vehicle.name}` : "車両情報なし";
  };

  if (profile?.role === "spot") {
    return (
      <>
        <PageHeader
          title="紹介料・報酬の確認"
          description="事業主が登録した紹介料・報酬の金額と支払い状況を確認できます。入力や変更はできません。"
        />

        <section className="mini-summary-grid">
          <div className="mini-summary-card amber"><small>支給予定・未払い</small><strong>{formatCurrency(totals.payable)}</strong></div>
          <div className="mini-summary-card blue"><small>請求予定・未回収</small><strong>{formatCurrency(totals.receivable)}</strong></div>
          <div className="mini-summary-card green"><small>精算済み累計</small><strong>{formatCurrency(totals.settled)}</strong></div>
        </section>

        <div className="filter-bar panel">
          <div className="segmented-control" aria-label="紹介料・報酬の状態">
            {(["すべて", "予定", "確定", "精算済み", "取消"] as const).map((status) => (
              <button type="button" key={status} className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)}>{status}</button>
            ))}
          </div>
          <div className="result-count">{visibleSettlements.length}件</div>
        </div>

        <section className="spot-assignment-grid spot-settlement-review-grid">
          {visibleSettlements.map((settlement) => (
            <article className="panel spot-assignment-card spot-settlement-review-card" key={settlement.id}>
              <div className="spot-assignment-heading">
                <span><Users size={21} /></span>
                <div>
                  <strong>{vehicleLabel(settlement.vehicleId)}</strong>
                  <small>{settlement.businessType}・{settlement.engagementType}</small>
                </div>
                <StatusBadge>{settlement.status}</StatusBadge>
              </div>
              <dl>
                <div><dt>内容</dt><dd>{settlement.direction === "スタッフへ支給" ? "紹介料・報酬" : "合意済み請求"}</dd></div>
                <div><dt>金額</dt><dd>{formatCurrency(staffSettlementDisplayAmount(settlement))}</dd></div>
                <div><dt>条件</dt><dd>{staffSettlementCondition(settlement)}</dd></div>
                <div><dt>精算方法</dt><dd>{settlement.paymentMethod}</dd></div>
              </dl>
              {settlement.confirmedAmount !== null && settlement.confirmedAmount !== settlement.plannedAmount ? (
                <p>予定額は {formatCurrency(settlement.plannedAmount)}、確定額は {formatCurrency(settlement.confirmedAmount)} です。</p>
              ) : null}
            </article>
          ))}
          {!visibleSettlements.length ? (
            <div className="panel table-empty spot-assignment-empty">
              <Users size={32} />
              <p>確認できる紹介料・報酬はまだありません。</p>
            </div>
          ) : null}
        </section>
      </>
    );
  }

  const openAssignment = (assignment?: SpotAssignment) => {
    setAssignmentForm({
      assignmentId: assignment?.id ?? null,
      staffId: assignment?.staffId ?? spotStaff[0]?.id ?? "",
      engagementType: assignment?.engagementType ?? "紹介のみ",
      businessType: assignment?.businessType ?? "販売",
      vehicleId: assignment?.vehicleId ?? null,
      leadLabel: assignment?.leadLabel ?? "",
      referralNote: assignment?.referralNote ?? "",
    });
    setError("");
    setAssignmentOpen(true);
  };

  const submitAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError("");
    try { await saveSpotAssignment(assignmentForm); setAssignmentOpen(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "担当案件を保存できませんでした。"); }
    finally { setBusy(false); }
  };

  const finishAssignment = async (assignment: SpotAssignment, cancelAssignment: boolean) => {
    const action = cancelAssignment ? "取り消し" : "完了";
    if (!window.confirm(`この担当案件を${action}にしますか？履歴は残ります。`)) return;
    setListError("");
    try { await finishSpotAssignment(assignment.id, cancelAssignment); }
    catch (reason) { setListError(reason instanceof Error ? reason.message : `担当案件を${action}にできませんでした。`); }
  };

  return (
    <>
      <PageHeader title="スタッフ精算" description="通常・スポットスタッフの担当案件、紹介料、成果報酬、合意済みの例外請求を管理します。" action={isOwner ? <div className="page-header-actions"><button type="button" className="secondary-button" onClick={() => openAssignment()}><BriefcaseBusiness size={20} />担当案件を登録</button><button type="button" className="primary-button" onClick={openNew}><Plus size={20} />精算予定を登録</button></div> : undefined} />

      {isOwner || profile?.role === "accounting" ? <section className="panel spot-management-panel"><div className="section-heading"><div><h2>スポット担当案件</h2><p>本人には、ここで事業主が割り当てた案件だけが表示されます。</p></div></div><div className="spot-management-list">{data.spotAssignments.map((assignment) => <article key={assignment.id}><div><strong>{assignment.leadLabel || (assignment.vehicleId ? vehicleLabel(assignment.vehicleId) : "名称未入力")}</strong><span>{staffName(assignment.staffId)}・{assignment.businessType}・{assignment.engagementType}</span></div><StatusBadge>{assignment.status}</StatusBadge><div className="staff-settlement-actions">{isOwner && assignment.status === "進行中" && !assignment.contractId ? <button type="button" className="table-action-button" onClick={() => openAssignment(assignment)}><Pencil size={14} />修正</button> : null}{isOwner && assignment.status === "進行中" ? <><button type="button" className="table-action-button" onClick={() => void finishAssignment(assignment, false)}>完了</button><button type="button" className="table-action-button danger-table-button" onClick={() => void finishAssignment(assignment, true)}>取消</button></> : null}</div></article>)}{!data.spotAssignments.length ? <div className="table-empty"><BriefcaseBusiness size={27} /><p>スポット担当案件はまだありません。</p></div> : null}</div></section> : null}

      <section className="mini-summary-grid">
        <div className="mini-summary-card amber"><small>支給予定・未払い</small><strong>{formatCurrency(totals.payable)}</strong></div>
        <div className="mini-summary-card blue"><small>請求予定・未回収</small><strong>{formatCurrency(totals.receivable)}</strong></div>
        <div className="mini-summary-card green"><small>精算済み累計</small><strong>{formatCurrency(totals.settled)}</strong></div>
      </section>

      <div className="filter-bar panel"><div className="segmented-control" aria-label="精算状態">{(["すべて", "予定", "確定", "精算済み", "取消"] as const).map((status) => <button type="button" key={status} className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)}>{status}</button>)}</div><div className="result-count">{visibleSettlements.length}件</div></div>
      {listError ? <p className="form-error list-error">{listError}</p> : null}

      <section className="panel table-panel"><div className="table-scroll"><table className="data-table staff-settlement-table"><thead><tr><th>スタッフ</th><th>対象</th><th>内容・条件</th><th>方向</th><th>状態</th><th className="number-cell">予定／確定額</th><th>操作</th></tr></thead><tbody>{visibleSettlements.map((settlement) => <tr key={settlement.id}>
        <td><strong>{staffName(settlement.staffId)}</strong><span className="cell-note">{settlement.engagementType}</span></td>
        <td><strong>{vehicleLabel(settlement.vehicleId)}</strong><span className="cell-note">{settlement.businessType}</span></td>
        <td><strong>{settlement.calculationMethod}</strong><span className="cell-note">{staffSettlementCondition(settlement)}</span></td>
        <td><span className={`settlement-direction ${settlement.direction === "スタッフへ支給" ? "pay" : "charge"}`}>{settlement.direction}</span></td>
        <td><StatusBadge>{settlement.status}</StatusBadge></td>
        <td className="number-cell"><strong>{formatCurrency(staffSettlementDisplayAmount(settlement))}</strong>{settlement.confirmedAmount !== null && settlement.confirmedAmount !== settlement.plannedAmount ? <span className="cell-note">予定 {formatCurrency(settlement.plannedAmount)}</span> : null}</td>
        <td><div className="staff-settlement-actions">
          {isOwner && settlement.status === "予定" ? <button type="button" className="table-action-button" onClick={() => openEdit(settlement)}><Pencil size={14} />修正</button> : null}
          {canConfirm && settlement.status === "予定" ? <button type="button" className="table-action-button" onClick={() => openConfirm(settlement)}><CheckCircle2 size={14} />確定</button> : null}
          {canConfirm && settlement.status === "確定" ? <button type="button" className="table-action-button" onClick={() => void settle(settlement)}><HandCoins size={14} />{settlement.direction === "スタッフへ支給" ? "支払済み" : "回収済み"}</button> : null}
          {isOwner && ["予定", "確定"].includes(settlement.status) ? <button type="button" className="table-action-button danger-table-button" onClick={() => void cancel(settlement)}><Ban size={14} />取消</button> : null}
        </div></td>
      </tr>)}</tbody></table></div>{!visibleSettlements.length ? <div className="table-empty"><Users size={28} /><p>スタッフ精算はまだありません。</p></div> : null}</section>

      {assignmentOpen ? <Drawer title={assignmentForm.assignmentId ? "担当案件を修正" : "スポット担当案件を登録"} subtitle="本人にはこの案件だけが表示されます。" onClose={() => setAssignmentOpen(false)}><form className="form-stack" onSubmit={submitAssignment}><section className="form-section"><h3>担当スタッフと範囲</h3><label className="field-label">スポットスタッフ <span className="required">必須</span><select value={assignmentForm.staffId} onChange={(event) => setAssignmentForm({ ...assignmentForm, staffId: event.target.value })}><option value="">選択してください</option>{spotStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.displayName}</option>)}</select></label><div className="form-row"><label className="field-label">担当範囲<select value={assignmentForm.engagementType} onChange={(event) => setAssignmentForm({ ...assignmentForm, engagementType: event.target.value as StaffEngagementType })}>{engagementTypes.map((item) => <option key={item}>{item}</option>)}</select></label><label className="field-label">業務区分<select value={assignmentForm.businessType} onChange={(event) => setAssignmentForm({ ...assignmentForm, businessType: event.target.value as StaffBusinessType, vehicleId: null })}>{businessTypes.map((item) => <option key={item}>{item}</option>)}</select></label></div><label className="field-label">対象車両{assignmentForm.engagementType === "契約から全て担当" && assignmentForm.businessType === "販売" ? <span className="required">必須</span> : null}<select value={assignmentForm.vehicleId ?? ""} onChange={(event) => setAssignmentForm({ ...assignmentForm, vehicleId: event.target.value || null })}><option value="">車両登録前・指定なし</option>{data.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.managementNumber} {vehicle.name}</option>)}</select></label></section><section className="form-section"><h3>案件内容</h3><label className="field-label">案件名・紹介先<input maxLength={160} value={assignmentForm.leadLabel} onChange={(event) => setAssignmentForm({ ...assignmentForm, leadLabel: event.target.value })} placeholder="お客様名・業者名・案件の呼び名" /></label><label className="field-label">本人への伝達事項<textarea maxLength={1000} value={assignmentForm.referralNote} onChange={(event) => setAssignmentForm({ ...assignmentForm, referralNote: event.target.value })} /></label></section>{error ? <p className="form-error">{error}</p> : null}<div className="form-actions"><button type="button" className="secondary-button" onClick={() => setAssignmentOpen(false)}>キャンセル</button><button type="submit" className="primary-button" disabled={busy || !assignmentForm.staffId || (assignmentForm.engagementType === "契約から全て担当" && assignmentForm.businessType === "販売" && !assignmentForm.vehicleId)}>{busy ? "保存中" : "担当を保存"}</button></div></form></Drawer> : null}

      {formOpen ? <Drawer title={form.settlementId ? "精算予定を修正" : "精算予定を登録"} subtitle="登録時点の条件を保存し、粗利が変わっても自動変更しません。" onClose={() => setFormOpen(false)}><form className="form-stack" onSubmit={submit}>
        <section className="form-section"><h3>スタッフと担当内容</h3>
          <label className="field-label">対象スタッフ <span className="required">必須</span><select value={form.staffId} onChange={(event) => setForm({ ...form, staffId: event.target.value })}><option value="">選択してください</option>{eligibleStaff.map((staff) => <option key={staff.id} value={staff.id}>{staff.displayName}（{staff.role === "regular" ? "通常" : "スポット"}）</option>)}</select></label>
          <div className="form-row"><label className="field-label">担当方法<select value={form.engagementType} onChange={(event) => setForm({ ...form, engagementType: event.target.value as StaffEngagementType })}>{engagementTypes.map((item) => <option key={item}>{item}</option>)}</select></label><label className="field-label">業務区分<select value={form.businessType} onChange={(event) => setForm({ ...form, businessType: event.target.value as StaffBusinessType })}>{businessTypes.map((item) => <option key={item}>{item}</option>)}</select></label></div>
          <label className="field-label">対象車両 <span className="required">必須</span><select value={form.vehicleId} onChange={(event) => { const vehicleId = event.target.value; setForm({ ...form, vehicleId, contractId: null, grossProfitBasis: profitForVehicle(vehicleId) }); }}><option value="">選択してください</option>{data.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.managementNumber} {vehicle.name}</option>)}</select></label>
          <label className="field-label">関連契約<select value={form.contractId ?? ""} onChange={(event) => setForm({ ...form, contractId: event.target.value || null })}><option value="">契約を指定しない</option>{linkedContracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.type}契約・{contract.customerLabel}</option>)}</select></label>
        </section>
        <section className="form-section"><h3>精算方向と条件</h3>
          <div className="segmented-control large"><button type="button" className={form.direction === "スタッフへ支給" ? "active" : ""} onClick={() => setForm({ ...form, direction: "スタッフへ支給", agreementConfirmed: false })}>スタッフへ支給</button><button type="button" className={form.direction === "スタッフへ請求" ? "active" : ""} onClick={() => setForm({ ...form, direction: "スタッフへ請求" })}>スタッフへ請求</button></div>
          <label className="field-label">計算方法<select value={form.calculationMethod} onChange={(event) => setForm({ ...form, calculationMethod: event.target.value as StaffCalculationMethod })}>{calculationMethods.map((item) => <option key={item}>{item}</option>)}</select></label>
          {form.calculationMethod === "粗利率" ? <div className="form-row"><label className="field-label">粗利基準額<input type="number" min="0" step="1" value={form.grossProfitBasis} onChange={(event) => setForm({ ...form, grossProfitBasis: Number(event.target.value) })} /></label><label className="field-label">割合（%）<input type="number" min="0" max="100" step="0.001" value={form.ratePercent ?? 0} onChange={(event) => setForm({ ...form, ratePercent: Number(event.target.value) })} /></label></div> : <label className="field-label">予定額<input type="number" min="0" step="1" value={form.manualAmount} onChange={(event) => setForm({ ...form, manualAmount: Number(event.target.value) })} /></label>}
          <div className="settlement-preview"><span>予定額</span><strong>{formatCurrency(previewAmount)}</strong><small>1円未満切り捨て・登録後は自動変更しません</small></div>
          <label className="field-label">精算方法<select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as PaymentMethod })}>{paymentMethods.map((item) => <option key={item}>{item}</option>)}</select></label>
        </section>
        {form.direction === "スタッフへ請求" ? <section className="form-section charge-agreement-section"><h3>双方合意の記録</h3><label className="document-check"><input type="checkbox" checked={form.agreementConfirmed} onChange={(event) => setForm({ ...form, agreementConfirmed: event.target.checked })} /><span><strong>スタッフと話し合い、請求に合意した</strong><small>事故の見落としなど、例外的な請求だけに使用します</small></span></label><label className="field-label">合意内容 <span className="required">必須</span><textarea maxLength={1000} value={form.agreementNote} onChange={(event) => setForm({ ...form, agreementNote: event.target.value })} placeholder="合意した理由・金額・日付など" /></label></section> : null}
        <section className="form-section"><h3>備考</h3><label className="field-label">社内メモ<textarea maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label></section>
        {error ? <p className="form-error">{error}</p> : null}<div className="form-actions"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>キャンセル</button><button type="submit" className="primary-button" disabled={busy || !form.staffId || !form.vehicleId || previewAmount <= 0}>{busy ? "保存中" : "予定を保存"}</button></div>
      </form></Drawer> : null}

      {confirming ? <Drawer title="精算額を確定" subtitle="確定すると入出金へ連携し、支払い／回収待ちになります。" onClose={() => setConfirming(null)}><form className="form-stack" onSubmit={confirmSettlement}><section className="form-section"><h3>{staffName(confirming.staffId)}・{confirming.direction}</h3><div className="document-source-preview"><span>対象<strong>{vehicleLabel(confirming.vehicleId)}</strong></span><span>予定額<strong>{formatCurrency(confirming.plannedAmount)}</strong></span><span>条件<strong>{staffSettlementCondition(confirming)}</strong></span></div><label className="field-label">最終確定額 <span className="required">必須</span><input type="number" min="1" step="1" value={confirmedAmount} onChange={(event) => setConfirmedAmount(Number(event.target.value))} /></label><p className="form-hint">予定額と異なる金額にも変更できます。確定後は入出金に未処理として表示されます。</p></section>{error ? <p className="form-error">{error}</p> : null}<div className="form-actions"><button type="button" className="secondary-button" onClick={() => setConfirming(null)}>キャンセル</button><button type="submit" className="primary-button" disabled={busy || confirmedAmount <= 0}>{busy ? "確定中" : "確定して入出金へ"}</button></div></form></Drawer> : null}
    </>
  );
}
