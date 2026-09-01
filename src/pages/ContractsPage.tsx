import { ExternalLink, FileSignature, Plus, ShoppingCart } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { formatCurrency, formatDate } from "../lib/format";
import { useAppData } from "../state/AppDataContext";

export function ContractsPage({ type }: { type: "買取" | "販売" }) {
  const { data } = useAppData();
  const contracts = data.contracts.filter((contract) => contract.type === type);
  const Icon = type === "買取" ? FileSignature : ShoppingCart;

  return (
    <>
      <PageHeader
        title={`${type}契約`}
        description={`既存の${type}契約機能を車両管理番号へひもづけて表示します。`}
        action={
          <button type="button" className="primary-button" disabled title="Supabase統合後に有効になります">
            <Plus size={20} />
            {type}契約を作成
          </button>
        }
      />

      <div className="integration-banner">
        <Icon size={23} />
        <div>
          <strong>既存の契約機能と連携予定</strong>
          <span>現在は画面確認用です。新しい共通Supabaseへの統合後、ここから契約作成・署名を開始できるようにします。</span>
        </div>
        <span className="phase-chip">連携前</span>
      </div>

      <section className="panel table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>契約日</th><th>車両</th><th>お客様</th><th>状態</th><th className="number-cell">契約金額</th><th>操作</th></tr>
            </thead>
            <tbody>
              {contracts.map((contract) => {
                const vehicle = data.vehicles.find((item) => item.id === contract.vehicleId);
                return (
                  <tr key={contract.id}>
                    <td className="muted-cell">{formatDate(contract.contractedOn)}</td>
                    <td>{vehicle ? <span className="vehicle-reference"><strong>{vehicle.managementNumber}</strong><small>{vehicle.name}</small></span> : "—"}</td>
                    <td>{contract.customerLabel}</td>
                    <td><StatusBadge>{contract.status}</StatusBadge></td>
                    <td className="number-cell"><strong>{formatCurrency(contract.amount)}</strong></td>
                    <td><button type="button" className="table-action-button" disabled><ExternalLink size={16} />確認</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

