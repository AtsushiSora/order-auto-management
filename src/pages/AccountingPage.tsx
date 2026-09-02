import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Clock3,
  Download,
  Save,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Drawer } from "../components/Drawer";
import { PageHeader } from "../components/PageHeader";
import { buildJournalCandidates, createJournalCsv, taxTreatmentLabels } from "../lib/accounting";
import { formatCurrency, formatDate } from "../lib/format";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
import type {
  JournalCandidate,
  JournalCandidateStatus,
  JournalReviewStatus,
  SaveJournalCandidateReviewInput,
  TaxTreatment,
} from "../types";

const statusTone: Record<JournalCandidateStatus, string> = {
  確認待ち: "blue",
  税区分未確認: "amber",
  再確認: "red",
  確認済み: "green",
};

const formFromCandidate = (candidate: JournalCandidate): SaveJournalCandidateReviewInput => ({
  sourceKey: candidate.sourceKey,
  candidateDate: candidate.candidateDate,
  description: candidate.description,
  debitAccount: candidate.debitAccount,
  creditAccount: candidate.creditAccount,
  amount: candidate.amount,
  taxTreatment: candidate.taxTreatment,
  reviewStatus: candidate.reviewStatus,
  sourceFingerprint: candidate.sourceFingerprint,
  note: candidate.note,
});

export function AccountingPage() {
  const { data, saveJournalCandidateReview, recordJournalExport } = useAppData();
  const { profile } = useAuth();
  const canReview = profile?.role === "owner" || profile?.role === "accounting";
  const candidates = useMemo(() => buildJournalCandidates(data), [data]);
  const [targetMonth, setTargetMonth] = useState(new Date().toISOString().slice(0, 7));
  const [statusFilter, setStatusFilter] = useState<"すべて" | "未確認" | "確認済み">("すべて");
  const [selected, setSelected] = useState<JournalCandidate | null>(null);
  const [form, setForm] = useState<SaveJournalCandidateReviewInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pageMessage, setPageMessage] = useState("");

  const monthly = candidates.filter((candidate) => candidate.candidateDate.startsWith(targetMonth));
  const filtered = monthly.filter((candidate) => {
    if (statusFilter === "確認済み") return candidate.status === "確認済み";
    if (statusFilter === "未確認") return candidate.status !== "確認済み";
    return true;
  });
  const confirmed = monthly.filter((candidate) => candidate.status === "確認済み");
  const pending = monthly.length - confirmed.length;
  const exportsForMonth = data.journalExports.filter((item) => item.targetMonth === targetMonth);

  const openCandidate = (candidate: JournalCandidate) => {
    setSelected(candidate);
    setForm(formFromCandidate(candidate));
    setError("");
  };

  const closeCandidate = () => {
    setSelected(null);
    setForm(null);
    setError("");
  };

  const saveReview = async (reviewStatus: JournalReviewStatus) => {
    if (!form) return;
    setBusy(true);
    setError("");
    try {
      await saveJournalCandidateReview({ ...form, reviewStatus });
      closeCandidate();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "仕訳候補を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const downloadCsv = async () => {
    if (!confirmed.length) return;
    if (exportsForMonth.length > 0 && !window.confirm(`${targetMonth}はすでに${exportsForMonth.length}回出力されています。もう一度出力しますか？`)) return;
    setBusy(true);
    setPageMessage("");
    try {
      await recordJournalExport(targetMonth, confirmed.length);
      const blob = new Blob(["\uFEFF", createJournalCsv(confirmed)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `仕訳候補_${targetMonth}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setPageMessage(`${targetMonth}の確認済み${confirmed.length}件をCSVに出力しました。`);
    } catch (reason) {
      setPageMessage(reason instanceof Error ? reason.message : "CSVを出力できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="経理・仕訳候補"
        description="元取引から候補を作り、確認済みのものだけ月別CSVへ出力します。"
        action={canReview ? <button type="button" className="primary-button" disabled={busy || !confirmed.length} onClick={() => void downloadCsv()}><Download size={18} />確認済みをCSV出力</button> : undefined}
      />

      <section className="integration-note panel accounting-note">
        <Calculator size={24} />
        <div><strong>会計ソフトそのものではありません</strong><p>仕訳候補の確認と受渡しを行う画面です。勘定科目と税区分は自動確定せず、奥様または事業主が確認します。</p></div>
      </section>

      <section className="mini-summary-grid accounting-summary-grid">
        <button type="button" className="mini-summary-card blue" onClick={() => setStatusFilter("すべて")}><Calculator size={22} /><small>候補合計</small><strong>{monthly.length}件</strong></button>
        <button type="button" className="mini-summary-card amber" onClick={() => setStatusFilter("未確認")}><AlertTriangle size={22} /><small>未確認・再確認</small><strong>{pending}件</strong></button>
        <button type="button" className="mini-summary-card teal" onClick={() => setStatusFilter("確認済み")}><CheckCircle2 size={22} /><small>CSV出力可能</small><strong>{confirmed.length}件</strong></button>
      </section>

      <div className="filter-bar panel accounting-filter-bar">
        <label className="month-field"><span>対象月</span><input type="month" value={targetMonth} onChange={(event) => { setTargetMonth(event.target.value); setStatusFilter("すべて"); }} /></label>
        <div className="segmented-control" aria-label="確認状態">
          {(["すべて", "未確認", "確認済み"] as const).map((status) => <button type="button" key={status} className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)}>{status}</button>)}
        </div>
        <div className="result-count">{filtered.length}件</div>
      </div>

      {exportsForMonth.length ? <p className="accounting-export-history"><Clock3 size={16} />この月は{exportsForMonth.length}回出力済み・最終 {formatDate(exportsForMonth[0].createdAt)}</p> : null}
      {pageMessage ? <p className="form-success page-message">{pageMessage}</p> : null}

      <section className="panel table-panel accounting-table-panel">
        <div className="table-scroll">
          <table className="data-table accounting-table">
            <thead><tr><th>日付</th><th>元取引</th><th>借方</th><th>貸方</th><th className="number-cell">金額</th><th>税区分</th><th>状態</th><th>確認</th></tr></thead>
            <tbody>
              {filtered.map((candidate) => (
                <tr key={candidate.sourceKey}>
                  <td>{formatDate(candidate.candidateDate)}</td>
                  <td><strong>{candidate.description}</strong><small>{candidate.vehicleLabel}</small></td>
                  <td>{candidate.debitAccount}</td>
                  <td>{candidate.creditAccount}</td>
                  <td className="number-cell">{formatCurrency(candidate.amount)}</td>
                  <td>{candidate.taxTreatment}</td>
                  <td><span className={`status-badge ${statusTone[candidate.status]}`}>{candidate.status}</span></td>
                  <td><button type="button" className="table-action-button" onClick={() => openCandidate(candidate)}>{canReview ? "確認・修正" : "詳細"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length ? <div className="empty-state compact"><Calculator size={30} /><h2>この月の仕訳候補はありません</h2><p>対象月または絞り込みを変更してください。</p></div> : null}
      </section>

      {selected && form ? (
        <Drawer title="仕訳候補を確認" subtitle={`${selected.sourceType}・${formatDate(selected.candidateDate)}`} onClose={closeCandidate}>
          <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void saveReview("確認済み"); }}>
            <section className="form-section">
              <h3>元取引</h3>
              <dl className="detail-list"><div><dt>摘要</dt><dd>{selected.description}</dd></div><div><dt>対象</dt><dd>{selected.vehicleLabel}</dd></div><div><dt>金額</dt><dd>{formatCurrency(selected.amount)}</dd></div></dl>
              {selected.status === "再確認" ? <p className="form-warning">元取引が前回確認後に変更されています。現在の内容でもう一度確認してください。</p> : null}
            </section>
            <section className="form-section">
              <h3>仕訳内容</h3>
              <div className="form-row"><label className="field-label">借方科目 <span className="required">必須</span><input value={form.debitAccount} disabled={!canReview} onChange={(event) => setForm({ ...form, debitAccount: event.target.value })} /></label><label className="field-label">貸方科目 <span className="required">必須</span><input value={form.creditAccount} disabled={!canReview} onChange={(event) => setForm({ ...form, creditAccount: event.target.value })} /></label></div>
              <label className="field-label">税区分 <span className="required">確認済みには必須</span><select value={form.taxTreatment} disabled={!canReview} onChange={(event) => setForm({ ...form, taxTreatment: event.target.value as TaxTreatment })}>{taxTreatmentLabels.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="field-label">確認メモ<textarea rows={3} value={form.note} disabled={!canReview} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="奥様・税理士へ確認する内容など" /></label>
            </section>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions">
              <button type="button" className="secondary-button" onClick={closeCandidate}>閉じる</button>
              {canReview ? <><button type="button" className="secondary-button" disabled={busy} onClick={() => void saveReview("確認待ち")}><Save size={17} />確認待ちで保存</button><button type="submit" className="primary-button" disabled={busy}><CheckCircle2 size={17} />確認済みにする</button></> : null}
            </div>
          </form>
        </Drawer>
      ) : null}
    </>
  );
}
