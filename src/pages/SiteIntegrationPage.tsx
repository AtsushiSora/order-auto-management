import { Globe2, Inbox, Pencil, Save } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Drawer } from "../components/Drawer";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { canPublishToSalesSite, getSalesSiteLabel } from "../lib/publication";
import { formatCurrency, formatDate } from "../lib/format";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
import type { SoldDisplayMode, Vehicle, VehiclePublicationInput, WebsiteInquiryStatus } from "../types";

const inquiryStatuses: WebsiteInquiryStatus[] = ["新着", "対応中", "完了"];

const publicationInput = (vehicle: Vehicle): VehiclePublicationInput => ({
  vehicleId: vehicle.id,
  salesSitePublished: vehicle.salesSitePublished,
  soldDisplayMode: vehicle.soldDisplayMode,
  publicMaker: vehicle.publicMaker,
  publicGrade: vehicle.publicGrade,
  publicYear: vehicle.publicYear,
  publicMileage: vehicle.publicMileage,
  publicColor: vehicle.publicColor,
  publicInspection: vehicle.publicInspection,
  publicPrice: vehicle.publicPrice || vehicle.askingPrice,
  publicDescription: vehicle.publicDescription,
  publicImageUrl: vehicle.publicImageUrl,
});

export function SiteIntegrationPage() {
  const { data, saveVehiclePublication, updateWebsiteInquiryStatus } = useAppData();
  const { profile } = useAuth();
  const canEditPublication = profile?.role === "owner" || profile?.role === "regular";
  const canHandleInquiry = canEditPublication || profile?.role === "accounting";
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehiclePublicationInput | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const siteVehicles = useMemo(
    () => data.vehicles.filter((vehicle) => canPublishToSalesSite(vehicle)),
    [data.vehicles],
  );
  const publishedCount = siteVehicles.filter((vehicle) => getSalesSiteLabel(vehicle) !== null).length;
  const newInquiryCount = data.websiteInquiries.filter((inquiry) => inquiry.status === "新着").length;

  const openPublication = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setForm(publicationInput(vehicle));
    setError("");
  };

  const submitPublication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setError("");
    try {
      await saveVehiclePublication(form);
      setSelectedVehicle(null);
      setForm(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "公開設定を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const changeInquiryStatus = async (inquiryId: string, status: WebsiteInquiryStatus) => {
    setBusy(true);
    setError("");
    try {
      await updateWebsiteInquiryStatus(inquiryId, status);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "問い合わせ状態を更新できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="サイト連携" description="販売サイトへの車両掲載と、販売・廃車サイトから届く問い合わせを管理します。" />

      <div className="mini-summary-grid">
        <div className="mini-summary-card teal"><small>販売サイト掲載中</small><strong>{publishedCount}台</strong></div>
        <div className="mini-summary-card"><small>公開設定の対象</small><strong>{siteVehicles.length}台</strong></div>
        <div className="mini-summary-card amber"><small>新着問い合わせ</small><strong>{newInquiryCount}件</strong></div>
      </div>

      <section className="integration-note panel">
        <Globe2 size={24} />
        <div><strong>外部サイトへ渡すのは公開用情報だけです</strong><p>車台番号・仕入額・保管場所・契約相手などの社内情報は公開されません。管理画面が「納車済み」でも、販売サイトは「売約済み」のまま表示できます。</p></div>
      </section>

      <section className="table-panel panel section-block">
        <div className="panel-heading"><div><h2>販売サイトの車両</h2><p>公開・非公開と、売れた後に表示を残すかを車両ごとに選べます。</p></div></div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>車両</th><th>管理状態</th><th>サイト表示</th><th>表示価格</th><th>操作</th></tr></thead>
            <tbody>
              {siteVehicles.map((vehicle) => {
                const label = getSalesSiteLabel(vehicle);
                return (
                  <tr key={vehicle.id}>
                    <td><span className="vehicle-reference"><strong>{vehicle.managementNumber} {vehicle.name}</strong><small>{vehicle.publicMaker || "メーカー未入力"} {vehicle.publicGrade}</small></span></td>
                    <td><StatusBadge>{vehicle.status}</StatusBadge></td>
                    <td><span className={`status-badge ${label === "掲載中" ? "green" : "slate"}`}>{label ?? "非公開"}</span>{vehicle.status !== "販売中" && vehicle.salesSitePublished ? <small className="cell-note">売却後：{vehicle.soldDisplayMode}</small> : null}</td>
                    <td className="number-cell">{formatCurrency(vehicle.publicPrice || vehicle.askingPrice)}</td>
                    <td>{canEditPublication ? <button type="button" className="table-action-button" onClick={() => openPublication(vehicle)}><Pencil size={14} />設定</button> : <span className="muted-cell">閲覧のみ</span>}</td>
                  </tr>
                );
              })}
              {!siteVehicles.length ? <tr><td colSpan={5} className="muted-cell">販売中・売約済み・納車済みの車両がありません。</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-panel panel">
        <div className="panel-heading"><div><h2>サイトからの問い合わせ</h2><p>販売サイトと廃車サイトの問い合わせを同じ一覧で確認できます。</p></div></div>
        <div className="table-scroll">
          <table className="data-table inquiry-table">
            <thead><tr><th>受信日時</th><th>サイト</th><th>お客様</th><th>連絡先</th><th>内容</th><th>対応状況</th></tr></thead>
            <tbody>
              {data.websiteInquiries.map((inquiry) => (
                <tr key={inquiry.id}>
                  <td>{formatDate(inquiry.receivedAt)}</td>
                  <td>{inquiry.source}</td>
                  <td>{inquiry.customerName}</td>
                  <td><span className="vehicle-reference"><strong>{inquiry.phone || "電話なし"}</strong><small>{inquiry.email || "メールなし"}</small></span></td>
                  <td className="inquiry-message">{inquiry.message}</td>
                  <td>{canHandleInquiry ? <select value={inquiry.status} disabled={busy} onChange={(event) => void changeInquiryStatus(inquiry.id, event.target.value as WebsiteInquiryStatus)}>{inquiryStatuses.map((status) => <option key={status}>{status}</option>)}</select> : <StatusBadge>{inquiry.status}</StatusBadge>}</td>
                </tr>
              ))}
              {!data.websiteInquiries.length ? <tr><td colSpan={6} className="table-empty"><Inbox size={24} /><p>問い合わせはまだありません。</p></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      {error ? <p className="form-error page-error">{error}</p> : null}

      {selectedVehicle && form ? (
        <Drawer title="販売サイトの公開設定" subtitle={`${selectedVehicle.managementNumber} ${selectedVehicle.name}`} onClose={() => setSelectedVehicle(null)}>
          <form className="form-stack" onSubmit={submitPublication}>
            <section className="form-section">
              <h3>公開状態</h3>
              <label className="document-check"><input type="checkbox" checked={form.salesSitePublished} onChange={(event) => setForm({ ...form, salesSitePublished: event.target.checked })} /><span><strong>販売サイトに掲載する</strong><small>チェックを外すとサイト一覧から消えます</small></span></label>
              <label className="field-label">売れた後の表示<select value={form.soldDisplayMode} onChange={(event) => setForm({ ...form, soldDisplayMode: event.target.value as SoldDisplayMode })}><option>売約済み表示</option><option>非表示</option></select></label>
              <p className="form-hint">「売約済み表示」なら、管理側が納車済みになっても販売サイトでは売約済みのまま残ります。</p>
            </section>
            <section className="form-section">
              <h3>公開する車両情報</h3>
              <div className="form-row"><label className="field-label">メーカー {form.salesSitePublished ? <span className="required">必須</span> : null}<input value={form.publicMaker} onChange={(event) => setForm({ ...form, publicMaker: event.target.value })} /></label><label className="field-label">グレード<input value={form.publicGrade} onChange={(event) => setForm({ ...form, publicGrade: event.target.value })} /></label></div>
              <div className="form-row"><label className="field-label">年式<input value={form.publicYear} placeholder="例：2022年" onChange={(event) => setForm({ ...form, publicYear: event.target.value })} /></label><label className="field-label">走行距離<input value={form.publicMileage} placeholder="例：38,000km" onChange={(event) => setForm({ ...form, publicMileage: event.target.value })} /></label></div>
              <div className="form-row"><label className="field-label">色<input value={form.publicColor} onChange={(event) => setForm({ ...form, publicColor: event.target.value })} /></label><label className="field-label">車検<input value={form.publicInspection} placeholder="例：2027年8月" onChange={(event) => setForm({ ...form, publicInspection: event.target.value })} /></label></div>
              <label className="field-label">サイト表示価格（税込）<input type="number" min="0" step="1" value={form.publicPrice} onChange={(event) => setForm({ ...form, publicPrice: Number(event.target.value) })} /></label>
              <label className="field-label">公開説明<textarea value={form.publicDescription} rows={4} onChange={(event) => setForm({ ...form, publicDescription: event.target.value })} /></label>
              <label className="field-label">画像URL<input type="url" value={form.publicImageUrl} placeholder="https://..." onChange={(event) => setForm({ ...form, publicImageUrl: event.target.value })} /></label>
            </section>
            {error ? <p className="form-error">{error}</p> : null}
            <button type="submit" className="primary-button full-button" disabled={busy}><Save size={17} />{busy ? "保存中" : "公開設定を保存"}</button>
          </form>
        </Drawer>
      ) : null}
    </>
  );
}
