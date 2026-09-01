import { BookOpen, Calculator, CheckCircle2 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

export function AccountingPlaceholderPage({ type }: { type: "古物台帳" | "経理・仕訳候補" }) {
  const isLedger = type === "古物台帳";
  const Icon = isLedger ? BookOpen : Calculator;
  const items = isLedger
    ? ["買取契約から取得記録を作成", "入庫日を受取日として確定", "納車日を引渡日として記録"]
    : ["元取引から仕訳候補を作成", "奥様が確認済みに変更", "月ごとに会計ソフト用CSVを作成"];

  return (
    <>
      <PageHeader title={type} description={`${type}は第2段階で、日々の取引データから自動作成します。`} />
      <section className="placeholder-card panel">
        <span className="placeholder-icon"><Icon size={38} /></span>
        <span className="phase-chip">第2段階</span>
        <h2>土台となるデータを先に整えています</h2>
        <p>車両・契約・費用・入出金の重複入力をなくしてから、{type}へ連携します。</p>
        <ul>
          {items.map((item) => <li key={item}><CheckCircle2 size={18} />{item}</li>)}
        </ul>
      </section>
    </>
  );
}

