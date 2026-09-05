import {
  Archive,
  Building2,
  Download,
  Mail,
  MessageSquarePlus,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "../components/Drawer";
import { PageHeader } from "../components/PageHeader";
import { formatCurrency, formatDate } from "../lib/format";
import { formatPostalCode, lookupPostalAddress, postalCodeDigits } from "../lib/postalCode";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
import type {
  Customer,
  CustomerCategory,
  CustomerContactChannel,
  CustomerEntityType,
  PageId,
  SaveCustomerInput,
} from "../types";

const todayTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

const blankCustomer = (): SaveCustomerInput => ({
  customerId: null,
  entityType: "個人",
  category: "一般のお客様",
  displayName: "",
  lastName: "",
  firstName: "",
  kana: "",
  birthDate: null,
  contactPerson: "",
  postalCode: "",
  address: "",
  phone: "",
  email: "",
  invoiceRegistrationNumber: "",
  importantNote: "",
  memo: "",
  isActive: true,
});

const categories: CustomerCategory[] = ["一般のお客様", "オークション", "廃車業者", "保険会社", "外注先", "その他"];
const channels: CustomerContactChannel[] = ["電話", "LINE", "メール", "対面", "その他"];
const normalizePhone = (value: string) => value.replace(/[^0-9]/g, "");
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const currentYear = new Date().getFullYear();
const birthYears = Array.from({ length: currentYear - 1899 }, (_, index) => String(currentYear - index));
const birthMonths = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
type BirthParts = { year: string; month: string; day: string };
const emptyBirthParts = (): BirthParts => ({ year: "", month: "", day: "" });
const parseBirthDate = (value: string | null): BirthParts => {
  const [year = "", month = "", day = ""] = value?.split("-") ?? [];
  return { year, month, day };
};

export function CustomersPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const {
    data,
    saveCustomer,
    setCustomerActive,
    deleteCustomer,
    addCustomerContact,
  } = useAppData();
  const { profile } = useAuth();
  const canEdit = profile?.role === "owner" || profile?.role === "regular";
  const isOwner = profile?.role === "owner";
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CustomerCategory | "すべて">("すべて");
  const [showInactive, setShowInactive] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SaveCustomerInput>(blankCustomer);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactedAt, setContactedAt] = useState(todayTime);
  const [contactChannel, setContactChannel] = useState<CustomerContactChannel>("電話");
  const [contactNote, setContactNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [birthParts, setBirthParts] = useState<BirthParts>(emptyBirthParts);
  const [postalStatus, setPostalStatus] = useState<"idle" | "loading" | "found" | "not-found">("idle");
  const [postalMessage, setPostalMessage] = useState("");
  const lastPostalLookup = useRef("");

  useEffect(() => {
    if (!formOpen) return;
    const digits = postalCodeDigits(form.postalCode);
    if (digits.length !== 7 || digits === lastPostalLookup.current) return;
    lastPostalLookup.current = digits;
    const controller = new AbortController();
    setPostalStatus("loading");
    setPostalMessage("住所を検索しています…");
    const timer = window.setTimeout(() => {
      void lookupPostalAddress(digits, controller.signal).then((result) => {
        setForm((current) => ({ ...current, postalCode: result.postalCode, address: result.address }));
        setPostalStatus("found");
        setPostalMessage("住所を自動入力しました。番地・建物名を続けて入力してください。");
      }).catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setPostalStatus("not-found");
        setPostalMessage(reason instanceof Error ? reason.message : "住所を検索できませんでした。");
      });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [form.postalCode, formOpen]);

  const transactionsByCustomer = useMemo(() => {
    const result = new Map<string, typeof data.contracts>();
    data.contracts.forEach((contract) => {
      if (!contract.customerId) return;
      result.set(contract.customerId, [...(result.get(contract.customerId) ?? []), contract]);
    });
    return result;
  }, [data.contracts]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.customers.filter((customer) => {
      if (!showInactive && !customer.isActive) return false;
      if (category !== "すべて" && customer.category !== category) return false;
      if (!needle) return true;
      const vehicleLabels = (transactionsByCustomer.get(customer.id) ?? []).map((contract) => {
        const vehicle = data.vehicles.find((item) => item.id === contract.vehicleId);
        return `${vehicle?.managementNumber ?? ""} ${vehicle?.maker ?? ""} ${vehicle?.model ?? vehicle?.name ?? contract.vehicleName ?? ""}`;
      }).join(" ");
      return [customer.customerNumber, customer.displayName, customer.kana, customer.phone, customer.email, customer.address, vehicleLabels]
        .join(" ").toLowerCase().includes(needle);
    });
  }, [category, data.customers, data.vehicles, query, showInactive, transactionsByCustomer]);

  const duplicates = data.customers.filter((customer) => {
    if (customer.id === form.customerId) return false;
    const samePhone = normalizePhone(form.phone).length >= 7 && normalizePhone(customer.phone) === normalizePhone(form.phone);
    const sameEmail = form.email.trim() && customer.email.toLowerCase() === form.email.trim().toLowerCase();
    return samePhone || sameEmail;
  });

  const openNew = () => {
    setForm(blankCustomer());
    setBirthParts(emptyBirthParts());
    lastPostalLookup.current = "";
    setPostalStatus("idle");
    setPostalMessage("");
    setError("");
    setFormOpen(true);
  };
  const openEdit = (customer: Customer) => {
    setForm({
      customerId: customer.id,
      entityType: customer.entityType,
      category: customer.category,
      displayName: customer.displayName,
      lastName: customer.lastName,
      firstName: customer.firstName,
      kana: customer.kana,
      birthDate: customer.birthDate,
      contactPerson: customer.contactPerson,
      postalCode: customer.postalCode,
      address: customer.address,
      phone: customer.phone,
      email: customer.email,
      invoiceRegistrationNumber: customer.invoiceRegistrationNumber,
      importantNote: customer.importantNote,
      memo: customer.memo,
      isActive: customer.isActive,
    });
    setBirthParts(parseBirthDate(customer.birthDate));
    lastPostalLookup.current = postalCodeDigits(customer.postalCode);
    setPostalStatus("idle");
    setPostalMessage("");
    setError("");
    setFormOpen(true);
  };

  const updateBirthPart = (part: keyof BirthParts, value: string) => {
    let next = { ...birthParts, [part]: value };
    if (next.year && next.month && next.day) {
      const maxDay = new Date(Number(next.year), Number(next.month), 0).getDate();
      if (Number(next.day) > maxDay) next = { ...next, day: String(maxDay).padStart(2, "0") };
    }
    setBirthParts(next);
    const birthDate = next.year && next.month && next.day ? `${next.year}-${next.month}-${next.day}` : null;
    setForm((current) => ({ ...current, birthDate }));
  };

  const submitCustomer = async () => {
    setSaving(true); setError("");
    try {
      const saved = await saveCustomer(form);
      setFormOpen(false);
      setSelected(saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "顧客情報を保存できませんでした。");
    } finally { setSaving(false); }
  };

  const submitContact = async () => {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      await addCustomerContact({ customerId: selected.id, contactedAt: new Date(contactedAt).toISOString(), channel: contactChannel, note: contactNote });
      setContactOpen(false); setContactNote(""); setContactedAt(todayTime());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "連絡履歴を保存できませんでした。");
    } finally { setSaving(false); }
  };

  const exportCsv = () => {
    const header = ["顧客番号", "区分", "種別", "氏名・会社名", "名字", "名前", "フリガナ", "担当者", "生年月日", "郵便番号", "住所", "電話番号", "メール", "登録番号", "状態", "取引件数", "最終取引日", "メモ"];
    const rows = filtered.map((customer) => {
      const contracts = transactionsByCustomer.get(customer.id) ?? [];
      const latest = [...contracts].sort((a, b) => b.contractedOn.localeCompare(a.contractedOn))[0];
      return [customer.customerNumber, customer.entityType, customer.category, customer.displayName, customer.lastName, customer.firstName, customer.kana, customer.contactPerson, customer.birthDate ?? "", customer.postalCode, customer.address, customer.phone, customer.email, customer.invoiceRegistrationNumber, customer.isActive ? "利用中" : "利用停止", contracts.length, latest?.contractedOn ?? "", customer.memo];
    });
    const blob = new Blob(["\ufeff", [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `顧客一覧_${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  const selectedTransactions = selected ? [...(transactionsByCustomer.get(selected.id) ?? [])].sort((a, b) => b.contractedOn.localeCompare(a.contractedOn)) : [];
  const selectedLogs = selected ? data.customerContactLogs.filter((log) => log.customerId === selected.id).sort((a, b) => b.contactedAt.localeCompare(a.contactedAt)) : [];

  return <>
    <PageHeader
      title="顧客"
      description="お客様・業者の連絡先、取引内容、連絡履歴をまとめて管理します。"
      action={canEdit ? <button type="button" className="primary-button" onClick={openNew}><Plus size={20} />顧客を登録</button> : undefined}
    />

    <section className="mini-summary-grid customer-summary-grid">
      <div className="mini-summary-card teal"><UsersRound size={22} /><small>利用中</small><strong>{data.customers.filter((item) => item.isActive).length}件</strong></div>
      <div className="mini-summary-card blue"><UserRound size={22} /><small>個人</small><strong>{data.customers.filter((item) => item.isActive && item.entityType === "個人").length}件</strong></div>
      <div className="mini-summary-card"><Building2 size={22} /><small>法人・業者</small><strong>{data.customers.filter((item) => item.isActive && item.entityType === "法人・業者").length}件</strong></div>
    </section>

    <section className="panel customer-filter-bar">
      <label className="customer-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="氏名・会社名・電話・車両・管理番号で検索" /></label>
      <select value={category} onChange={(event) => setCategory(event.target.value as CustomerCategory | "すべて")}><option value="すべて">すべての顧客区分</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
      <label className="customer-inactive-toggle"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />利用停止も表示</label>
      {isOwner ? <button type="button" className="secondary-button" onClick={exportCsv}><Download size={17} />CSV</button> : null}
    </section>

    <section className="panel table-panel customer-table-panel">
      <div className="table-scroll"><table className="data-table"><thead><tr><th>顧客番号</th><th>氏名・会社名</th><th>区分</th><th>連絡先</th><th>取引</th><th>最終取引</th><th>状態</th><th>操作</th></tr></thead><tbody>
        {filtered.map((customer) => {
          const contracts = transactionsByCustomer.get(customer.id) ?? [];
          const latest = [...contracts].sort((a, b) => b.contractedOn.localeCompare(a.contractedOn))[0];
          return <tr key={customer.id}><td><strong className="management-number">{customer.customerNumber}</strong></td><td><strong>{customer.displayName}</strong>{customer.entityType === "法人・業者" && customer.contactPerson ? <small className="table-subtext">担当：{customer.contactPerson}</small> : null}</td><td>{customer.category}<small className="table-subtext">{customer.entityType}</small></td><td>{customer.phone || customer.email || "未登録"}</td><td>{contracts.length}件</td><td>{latest ? formatDate(latest.contractedOn) : "—"}</td><td><span className={`status-badge ${customer.isActive ? "green" : "slate"}`}>{customer.isActive ? "利用中" : "利用停止"}</span></td><td><button type="button" className="table-action-button" onClick={() => setSelected(customer)}>確認</button></td></tr>;
        })}
      </tbody></table></div>
      <div className="mobile-customer-list">{filtered.map((customer) => {
        const contracts = transactionsByCustomer.get(customer.id) ?? [];
        const latest = [...contracts].sort((a, b) => b.contractedOn.localeCompare(a.contractedOn))[0];
        return <button key={customer.id} type="button" onClick={() => setSelected(customer)}><span className="mobile-customer-heading"><strong>{customer.displayName}</strong><span className={`status-badge ${customer.isActive ? "green" : "slate"}`}>{customer.isActive ? "利用中" : "停止"}</span></span><small>{customer.customerNumber}　{customer.category}</small><span className="mobile-customer-meta"><span>{customer.phone || customer.email || "連絡先未登録"}</span><span>取引 {contracts.length}件{latest ? `・最終 ${formatDate(latest.contractedOn)}` : ""}</span></span></button>;
      })}</div>
      {filtered.length === 0 ? <div className="table-empty"><UsersRound size={28} /><p>該当する顧客はありません。</p></div> : null}
    </section>

    {formOpen ? <Drawer title={form.customerId ? "顧客情報を修正" : "顧客を登録"} subtitle={form.customerId ? data.customers.find((item) => item.id === form.customerId)?.customerNumber : "保存後に顧客番号を自動発行します"} onClose={() => setFormOpen(false)}>
      <div className="form-stack">
        <section className="form-section"><h3>基本情報</h3><div className="form-grid two-columns">
          <label className="field-label">個人・法人 <span className="required">必須</span><select value={form.entityType} onChange={(event) => setForm((current) => ({ ...current, entityType: event.target.value as CustomerEntityType }))}><option>個人</option><option>法人・業者</option></select></label>
          <label className="field-label">顧客区分 <span className="required">必須</span><select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as CustomerCategory }))}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          {form.entityType === "個人" ? <>
            <label className="field-label">名字 <span className="required">必須</span><input value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} autoComplete="family-name" /></label>
            <label className="field-label">名前 <span className="required">必須</span><input value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} autoComplete="given-name" /></label>
          </> : <label className="field-label">会社名・業者名 <span className="required">必須</span><input value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} /></label>}
          <label className="field-label">フリガナ<input value={form.kana} onChange={(event) => setForm((current) => ({ ...current, kana: event.target.value }))} /></label>
          {form.entityType === "個人" ? <div className="field-label full-span">生年月日<div className="birth-date-selects">
            <select aria-label="生まれた年" value={birthParts.year} onChange={(event) => updateBirthPart("year", event.target.value)}><option value="">年</option>{birthYears.map((year) => <option key={year} value={year}>{year}年</option>)}</select>
            <select aria-label="生まれた月" value={birthParts.month} onChange={(event) => updateBirthPart("month", event.target.value)}><option value="">月</option>{birthMonths.map((month) => <option key={month} value={month}>{Number(month)}月</option>)}</select>
            <select aria-label="生まれた日" value={birthParts.day} onChange={(event) => updateBirthPart("day", event.target.value)}><option value="">日</option>{Array.from({ length: birthParts.year && birthParts.month ? new Date(Number(birthParts.year), Number(birthParts.month), 0).getDate() : 31 }, (_, index) => String(index + 1).padStart(2, "0")).map((day) => <option key={day} value={day}>{Number(day)}日</option>)}</select>
          </div><small className="field-help">年・月・日をスクロールして選択できます。</small></div> : <><label className="field-label">担当者名<input value={form.contactPerson} onChange={(event) => setForm((current) => ({ ...current, contactPerson: event.target.value }))} /></label><label className="field-label">適格請求書発行事業者 登録番号<input value={form.invoiceRegistrationNumber} onChange={(event) => setForm((current) => ({ ...current, invoiceRegistrationNumber: event.target.value }))} placeholder="任意" /></label></>}
        </div></section>
        <section className="form-section"><h3>住所・連絡先</h3><div className="form-grid two-columns">
          <label className="field-label postal-code-field">郵便番号<input value={form.postalCode} onChange={(event) => { lastPostalLookup.current = ""; setPostalStatus("idle"); setPostalMessage(""); setForm((current) => ({ ...current, postalCode: formatPostalCode(event.target.value) })); }} inputMode="numeric" autoComplete="postal-code" placeholder="123-4567" maxLength={8} />{postalMessage ? <small className={`postal-lookup-status ${postalStatus}`}>{postalMessage}</small> : null}</label>
          <label className="field-label">電話番号<input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} inputMode="tel" /></label>
          <label className="field-label full-span">住所<input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} autoComplete="street-address" /></label>
          <label className="field-label full-span">メールアドレス<input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} /></label>
        </div><p className="form-hint">電話番号またはメールアドレスのどちらかを入力してください。</p></section>
        <section className="form-section"><h3>社内メモ</h3><label className="field-label">重要メモ・対応時の注意事項<textarea value={form.importantNote} onChange={(event) => setForm((current) => ({ ...current, importantNote: event.target.value }))} /></label><label className="field-label">メモ<textarea value={form.memo} onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))} /></label></section>
        {duplicates.length > 0 ? <div className="duplicate-customer-warning"><strong>同じ電話番号またはメールアドレスの登録があります</strong>{duplicates.map((item) => <button key={item.id} type="button" onClick={() => { setFormOpen(false); setSelected(item); }}>{item.customerNumber} {item.displayName}を確認</button>)}<small>別人の場合は、このまま新しい顧客として保存できます。</small></div> : null}
        {error ? <p className="form-error">{error}</p> : null}<div className="form-actions"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>キャンセル</button><button type="button" className="primary-button" disabled={saving} onClick={() => void submitCustomer()}>{saving ? "保存中" : "保存する"}</button></div>
      </div>
    </Drawer> : null}

    {selected ? <Drawer title={selected.displayName} subtitle={`${selected.customerNumber}　${selected.category}`} onClose={() => setSelected(null)}>
      <div className="form-stack customer-detail">
        {!selected.isActive ? <div className="integration-banner warning"><Archive size={21} /><div><strong>利用停止中</strong><span>過去の情報と取引履歴は保持されています。</span></div></div> : null}
        <section className="detail-section"><div className="detail-section-heading"><h3>顧客情報</h3>{canEdit ? <button type="button" className="table-action-button" onClick={() => openEdit(selected)}><Pencil size={16} />修正</button> : null}</div><dl className="detail-list"><div><dt>個人・法人</dt><dd>{selected.entityType}</dd></div>{selected.entityType === "個人" ? <><div><dt>名字</dt><dd>{selected.lastName || "—"}</dd></div><div><dt>名前</dt><dd>{selected.firstName || "—"}</dd></div></> : null}{selected.contactPerson ? <div><dt>担当者</dt><dd>{selected.contactPerson}</dd></div> : null}<div><dt>住所</dt><dd>〒{selected.postalCode || "—"} {selected.address || "未登録"}</dd></div><div><dt>電話</dt><dd>{selected.phone ? <a href={`tel:${selected.phone}`}><Phone size={15} />{selected.phone}</a> : "未登録"}</dd></div><div><dt>メール</dt><dd>{selected.email ? <a href={`mailto:${selected.email}`}><Mail size={15} />{selected.email}</a> : "未登録"}</dd></div>{selected.birthDate ? <div><dt>生年月日</dt><dd>{formatDate(selected.birthDate)}</dd></div> : null}</dl></section>
        {selected.importantNote || selected.memo ? <section className="detail-section customer-notes"><h3>社内メモ</h3>{selected.importantNote ? <div><strong>重要メモ・対応時の注意事項</strong><p>{selected.importantNote}</p></div> : null}{selected.memo ? <div><strong>メモ</strong><p>{selected.memo}</p></div> : null}</section> : null}
        <section className="detail-section"><div className="detail-section-heading"><h3>取引内容</h3><span>{selectedTransactions.length}件</span></div>{selectedTransactions.length ? <div className="customer-history-list">{selectedTransactions.map((contract) => { const vehicle = data.vehicles.find((item) => item.id === contract.vehicleId); const cashflow = data.cashflows.find((item) => item.vehicleId === contract.vehicleId && item.kind === (contract.type === "販売" ? "販売代金" : "買取代金")); const staffAssignment = data.spotAssignments.find((item) => item.contractId === contract.id); const staff = data.staffProfiles.find((item) => item.id === staffAssignment?.staffId); const docs = data.issuedDocuments.filter((item) => item.contractId === contract.id && item.status === "有効"); return <article key={contract.id}><div><strong>{contract.type}　{formatDate(contract.contractedOn)}</strong><span className="status-badge">{contract.status}</span></div><p>{vehicle ? `${vehicle.managementNumber}　${vehicle.maker} ${vehicle.model || vehicle.name} ${vehicle.grade}` : contract.vehicleName || "車両登録前"}</p><dl><div><dt>契約金額</dt><dd>{formatCurrency(contract.amount)}</dd></div><div><dt>入出金</dt><dd>{cashflow?.status ?? "未作成"}</dd></div><div><dt>担当</dt><dd>{staff?.displayName ?? "事業主・通常スタッフ"}</dd></div></dl><div className="customer-history-actions"><button type="button" className="text-button" onClick={() => onNavigate(contract.type === "販売" ? "sales-contracts" : "purchase-contracts")}>契約を開く</button>{docs.length ? <button type="button" className="text-button" onClick={() => onNavigate("issued-documents")}>S・Rを開く（{docs.length}）</button> : null}</div></article>; })}</div> : <p className="table-empty compact">紐付いた取引はありません。</p>}</section>
        <section className="detail-section"><div className="detail-section-heading"><h3>連絡履歴</h3><button type="button" className="table-action-button" onClick={() => { setError(""); setContactOpen(true); }}><MessageSquarePlus size={16} />追加</button></div>{selectedLogs.length ? <div className="contact-log-list">{selectedLogs.map((log) => <article key={log.id}><strong>{new Date(log.contactedAt).toLocaleString("ja-JP")}　{log.channel}</strong><p>{log.note}</p><small>{data.staffProfiles.find((staff) => staff.id === log.staffId)?.displayName ?? "担当者"}</small></article>)}</div> : <p className="table-empty compact">連絡履歴はありません。</p>}</section>
        {isOwner ? <section className="detail-section customer-danger-actions"><h3>管理</h3><button type="button" className="secondary-button" onClick={async () => { await setCustomerActive(selected.id, !selected.isActive); setSelected({ ...selected, isActive: !selected.isActive }); }}>{selected.isActive ? <Archive size={17} /> : <RotateCcw size={17} />}{selected.isActive ? "利用停止にする" : "利用を再開する"}</button><button type="button" className="danger-button" onClick={async () => { if (!window.confirm("この顧客を完全に削除しますか？取引履歴がある場合は削除できません。")) return; try { await deleteCustomer(selected.id); setSelected(null); } catch (reason) { setError(reason instanceof Error ? reason.message : "削除できませんでした。"); } }}><Trash2 size={17} />完全削除</button></section> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </div>
    </Drawer> : null}

    {contactOpen && selected ? <Drawer title="連絡履歴を追加" subtitle={selected.displayName} onClose={() => setContactOpen(false)}><div className="form-stack"><section className="form-section"><label className="field-label">日時 <span className="required">必須</span><input type="datetime-local" value={contactedAt} onChange={(event) => setContactedAt(event.target.value)} /></label><label className="field-label">連絡方法 <span className="required">必須</span><select value={contactChannel} onChange={(event) => setContactChannel(event.target.value as CustomerContactChannel)}>{channels.map((item) => <option key={item}>{item}</option>)}</select></label><label className="field-label">内容 <span className="required">必須</span><textarea value={contactNote} onChange={(event) => setContactNote(event.target.value)} placeholder="話した内容や次の対応を入力" /></label></section>{error ? <p className="form-error">{error}</p> : null}<div className="form-actions"><button type="button" className="secondary-button" onClick={() => setContactOpen(false)}>キャンセル</button><button type="button" className="primary-button" disabled={saving} onClick={() => void submitContact()}>{saving ? "保存中" : "保存する"}</button></div></div></Drawer> : null}
  </>;
}
