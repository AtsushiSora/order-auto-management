import { Camera, Save, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatPostalCode, lookupPostalAddress, postalCodeDigits } from "../lib/postalCode";
import type { SaveStaffProfileDetailsInput, StaffProfile } from "../types";

const currentYear = new Date().getFullYear();
const years = Array.from({ length: currentYear - 1899 }, (_, index) => String(currentYear - index));
const months = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));

const dateParts = (value: string | null | undefined) => {
  const [year = "", month = "", day = ""] = value?.split("-") ?? [];
  return { year, month, day };
};

export function StaffDetailsForm({
  staff,
  submitting,
  submitLabel = "スタッフ情報を保存",
  onSubmit,
  onCancel,
}: {
  staff: StaffProfile;
  submitting: boolean;
  submitLabel?: string;
  onSubmit: (input: SaveStaffProfileDetailsInput, licenseFront: File | null, licenseBack: File | null) => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<SaveStaffProfileDetailsInput>({
    staffId: staff.id,
    lastName: staff.lastName ?? "",
    firstName: staff.firstName ?? "",
    lastNameKana: staff.lastNameKana ?? "",
    firstNameKana: staff.firstNameKana ?? "",
    postalCode: staff.postalCode ?? "",
    address: staff.address ?? "",
    phone: staff.phone ?? "",
    birthDate: staff.birthDate ?? "",
    licenseExpiry: staff.licenseExpiry ?? "",
  });
  const [birth, setBirth] = useState(dateParts(staff.birthDate));
  const [licenseFront, setLicenseFront] = useState<File | null>(null);
  const [licenseBack, setLicenseBack] = useState<File | null>(null);
  const [postalMessage, setPostalMessage] = useState("");
  const [error, setError] = useState("");
  const lastPostalLookup = useRef(postalCodeDigits(staff.postalCode ?? ""));

  useEffect(() => {
    const digits = postalCodeDigits(form.postalCode);
    if (digits.length !== 7 || digits === lastPostalLookup.current) return;
    lastPostalLookup.current = digits;
    const controller = new AbortController();
    setPostalMessage("住所を検索しています…");
    const timer = window.setTimeout(() => {
      void lookupPostalAddress(digits, controller.signal).then((result) => {
        setForm((current) => ({ ...current, postalCode: result.postalCode, address: result.address }));
        setPostalMessage("住所を自動入力しました。番地・建物名を続けて入力してください。");
      }).catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setPostalMessage(reason instanceof Error ? reason.message : "住所を検索できませんでした。");
      });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [form.postalCode]);

  const updateBirth = (part: keyof typeof birth, value: string) => {
    const next = { ...birth, [part]: value };
    const maxDay = next.year && next.month ? new Date(Number(next.year), Number(next.month), 0).getDate() : 31;
    if (Number(next.day) > maxDay) next.day = "";
    setBirth(next);
    setForm((current) => ({
      ...current,
      birthDate: next.year && next.month && next.day ? `${next.year}-${next.month}-${next.day}` : "",
    }));
  };
  const dayCount = birth.year && birth.month ? new Date(Number(birth.year), Number(birth.month), 0).getDate() : 31;

  const submit = async () => {
    setError("");
    try {
      await onSubmit(form, licenseFront, licenseBack);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "スタッフ情報を保存できませんでした。");
    }
  };

  return <div className="staff-details-form form-stack">
    <section className="form-section">
      <h3>氏名</h3>
      <div className="form-grid two-columns">
        <label className="field-label">名字 <span className="required">必須</span><input value={form.lastName} autoComplete="family-name" onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} /></label>
        <label className="field-label">名前 <span className="required">必須</span><input value={form.firstName} autoComplete="given-name" onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} /></label>
        <label className="field-label">名字（フリガナ） <span className="required">必須</span><input value={form.lastNameKana} onChange={(event) => setForm((current) => ({ ...current, lastNameKana: event.target.value }))} /></label>
        <label className="field-label">名前（フリガナ） <span className="required">必須</span><input value={form.firstNameKana} onChange={(event) => setForm((current) => ({ ...current, firstNameKana: event.target.value }))} /></label>
      </div>
    </section>

    <section className="form-section">
      <h3>住所・連絡先</h3>
      <div className="form-grid two-columns">
        <label className="field-label postal-code-field">郵便番号 <span className="required">必須</span><input value={form.postalCode} inputMode="numeric" maxLength={8} placeholder="123-4567" onChange={(event) => { lastPostalLookup.current = ""; setPostalMessage(""); setForm((current) => ({ ...current, postalCode: formatPostalCode(event.target.value) })); }} />{postalMessage ? <small className="postal-lookup-status">{postalMessage}</small> : null}</label>
        <label className="field-label">電話番号 <span className="required">必須</span><input value={form.phone} inputMode="tel" autoComplete="tel" onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></label>
        <label className="field-label full-span">住所 <span className="required">必須</span><input value={form.address} autoComplete="street-address" onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /></label>
      </div>
    </section>

    <section className="form-section">
      <h3>生年月日・免許証</h3>
      <div className="field-label">生年月日 <span className="required">必須</span><div className="birth-date-selects">
        <select aria-label="生まれた年" value={birth.year} onChange={(event) => updateBirth("year", event.target.value)}><option value="">年</option>{years.map((year) => <option key={year} value={year}>{year}年</option>)}</select>
        <select aria-label="生まれた月" value={birth.month} onChange={(event) => updateBirth("month", event.target.value)}><option value="">月</option>{months.map((month) => <option key={month} value={month}>{Number(month)}月</option>)}</select>
        <select aria-label="生まれた日" value={birth.day} onChange={(event) => updateBirth("day", event.target.value)}><option value="">日</option>{Array.from({ length: dayCount }, (_, index) => String(index + 1).padStart(2, "0")).map((day) => <option key={day} value={day}>{Number(day)}日</option>)}</select>
      </div><small className="field-help">年・月・日をスクロールして選択できます。</small></div>
      <label className="field-label">運転免許証の有効期限 <span className="required">必須</span><input type="date" value={form.licenseExpiry} onChange={(event) => setForm((current) => ({ ...current, licenseExpiry: event.target.value }))} /></label>
      <div className="staff-license-grid">
        <label className="staff-license-picker"><Camera size={22} /><strong>免許証・表面</strong><span>{licenseFront?.name ?? (staff.licenseFrontPath ? "登録済み・選ぶと差し替え" : "写真を撮る／選ぶ")}</span><input type="file" accept="image/*" capture="environment" onChange={(event) => setLicenseFront(event.target.files?.[0] ?? null)} /></label>
        <label className="staff-license-picker"><Camera size={22} /><strong>免許証・裏面</strong><span>{licenseBack?.name ?? (staff.licenseBackPath ? "登録済み・選ぶと差し替え" : "写真を撮る／選ぶ")}</span><input type="file" accept="image/*" capture="environment" onChange={(event) => setLicenseBack(event.target.files?.[0] ?? null)} /></label>
      </div>
      <p className="staff-license-note"><ShieldCheck size={17} />免許証画像は非公開で保存し、本人と事業主だけが確認できます。</p>
    </section>

    {error ? <p className="form-error">{error}</p> : null}
    <div className="form-actions">
      {onCancel ? <button type="button" className="secondary-button" disabled={submitting} onClick={onCancel}>キャンセル</button> : null}
      <button type="button" className="primary-button" disabled={submitting} onClick={() => void submit()}><Save size={18} />{submitting ? "保存中…" : submitLabel}</button>
    </div>
  </div>;
}
