import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, ListChecks, Rocket, RotateCcw, Save, ShieldCheck, Wrench } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { formatDateTime } from "../lib/format";
import { productionReadinessItems, readinessProgress } from "../lib/productionReadiness";
import { useAppData } from "../state/AppDataContext";
import type { ProductionReadinessCheckKey, ReadinessCheckStatus } from "../types";

const statuses: Array<{ value: ReadinessCheckStatus; label: string }> = [
  { value: "未確認", label: "未確認" },
  { value: "確認済み", label: "確認済み" },
  { value: "要修正", label: "要修正" },
];

function ReadinessItem({ checkKey, title, description, steps, targetPage, targetLabel }: {
  checkKey: ProductionReadinessCheckKey;
  title: string;
  description: string;
  steps: string[];
  targetPage?: string;
  targetLabel?: string;
}) {
  const { productionReadiness, saveProductionReadinessCheck } = useAppData();
  const saved = productionReadiness.checks[checkKey];
  const [status, setStatus] = useState<ReadinessCheckStatus>(saved?.status ?? "未確認");
  const [note, setNote] = useState(saved?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const changed = status !== (saved?.status ?? "未確認") || note.trim() !== (saved?.note ?? "");

  useEffect(() => {
    setStatus(saved?.status ?? "未確認");
    setNote(saved?.note ?? "");
  }, [saved?.note, saved?.status]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await saveProductionReadinessCheck(checkKey, status, note);
      setMessage("保存しました。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "確認結果を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  const Icon = status === "確認済み" ? CheckCircle2 : status === "要修正" ? Wrench : Circle;

  return (
    <article className={`readiness-item ${status === "確認済み" ? "passed" : status === "要修正" ? "needs-fix" : "pending"}`}>
      <div className="readiness-item-heading">
        <span className="readiness-status-icon"><Icon size={22} /></span>
        <div><strong>{title}</strong><p>{description}</p></div>
      </div>
      <details className="readiness-steps">
        <summary><ListChecks size={16} />確認手順を表示</summary>
        <ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol>
        {targetPage ? <a className="readiness-target-link" href={`#/${targetPage}`}>{targetLabel ?? "対象画面を開く"}<ArrowRight size={15} /></a> : null}
      </details>
      <div className="readiness-item-fields">
        <label className="field-label">確認結果
          <select value={status} onChange={(event) => { setStatus(event.target.value as ReadinessCheckStatus); setMessage(null); }}>
            {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="field-label readiness-note">確認メモ
          <textarea value={note} maxLength={1000} placeholder="使用した端末、確認した内容、修正が必要な点など" onChange={(event) => { setNote(event.target.value); setMessage(null); }} />
        </label>
      </div>
      <div className="readiness-item-footer">
        <span>{saved?.checkedAt ? `最終確認：${formatDateTime(saved.checkedAt)}` : "まだ確認されていません"}</span>
        <button type="button" className="secondary-button" disabled={!changed || saving} onClick={() => void save()}><Save size={16} />{saving ? "保存中…" : "結果を保存"}</button>
      </div>
      {message ? <p className="inline-success">{message}</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}
    </article>
  );
}

export function ProductionReadinessPage() {
  const { productionReadiness, setProductionApproved } = useAppData();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const progress = readinessProgress(productionReadiness);
  const approved = Boolean(productionReadiness.approvedAt);
  const categories = [...new Set(productionReadinessItems.map((item) => item.category))];

  const changeApproval = async (next: boolean) => {
    const warning = next
      ? "すべて架空データで確認済みで、本物のお客様・車両を登録する準備が整ったものとして承認しますか？"
      : "本番利用の承認を取り消して、確認中へ戻しますか？";
    if (!window.confirm(warning)) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await setProductionApproved(next);
      setMessage(next ? "本番利用を承認しました。" : "本番利用の承認を取り消しました。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "承認状態を変更できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="本番前チェック" description="架空データで一連の業務と安全性を確認し、本番利用の開始判断を記録します。" />

      <section className="integration-note panel readiness-automation-note">
        <ShieldCheck size={24} />
        <div><strong>公開のたびに自動テストを実行しています</strong><p>計算・連携・入力制限などは自動確認済みです。ここでは自動テストだけでは判断できない実際の操作、表示、端末での結果を1項目ずつ記録します。</p></div>
      </section>

      <section className={`panel readiness-summary ${approved ? "approved" : "reviewing"}`}>
        <div className="readiness-summary-main">
          <span className="readiness-summary-icon">{approved ? <ShieldCheck size={30} /> : <AlertTriangle size={30} />}</span>
          <div>
            <strong>{approved ? "本番利用 承認済み" : "本番利用前の確認中"}</strong>
            <p>{approved ? `事業主承認：${formatDateTime(productionReadiness.approvedAt!)}` : "承認までは本物のお客様情報を登録せず、架空データだけで確認してください。"}</p>
          </div>
        </div>
        <div className="readiness-progress-wrap">
          <div><span>確認済み {progress.confirmed} / {progress.total}</span><span>{Math.round((progress.confirmed / progress.total) * 100)}%</span></div>
          <div className="readiness-progress"><span style={{ width: `${(progress.confirmed / progress.total) * 100}%` }} /></div>
          {progress.needsFix ? <small>要修正が{progress.needsFix}件あります。</small> : <small>各項目の結果とメモを保存してください。</small>}
        </div>
        <div className="readiness-approval-actions">
          {approved
            ? <button type="button" className="secondary-button" disabled={busy} onClick={() => void changeApproval(false)}><RotateCcw size={17} />承認を取り消す</button>
            : <button type="button" className="primary-button" disabled={!progress.complete || busy} onClick={() => void changeApproval(true)}><Rocket size={18} />本番利用を承認</button>}
          {!approved && !progress.complete ? <p>全{progress.total}項目が「確認済み」になると承認できます。</p> : null}
        </div>
        {message ? <p className="inline-success">{message}</p> : null}
        {error ? <p className="inline-error">{error}</p> : null}
      </section>

      {categories.map((category) => (
        <section className="section-block readiness-category" key={category}>
          <div className="section-heading"><div><h2>{category}</h2><p>実際の運用と同じ順番で、架空データを使用して確認します。</p></div></div>
          <div className="readiness-list">
            {productionReadinessItems.filter((item) => item.category === category).map((item) => (
              <ReadinessItem key={item.key} checkKey={item.key} title={item.title} description={item.description} steps={item.steps} targetPage={item.targetPage} targetLabel={item.targetLabel} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
