import { History, Inbox, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { getEffectiveContractHandoffStatus, type EffectiveContractHandoffStatus } from "../lib/contractHandoff";
import { formatDateTime } from "../lib/format";
import { useAppData } from "../state/AppDataContext";

type FilterStatus = "すべて" | EffectiveContractHandoffStatus;

const filterStatuses: FilterStatus[] = ["すべて", "連携待ち", "完了", "期限切れ", "無効"];

export function ContractHandoffsPage() {
  const { data, refreshData } = useAppData();
  const [filter, setFilter] = useState<FilterStatus>("すべて");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const now = Date.now();

  const rows = useMemo(() => data.contractHandoffs.map((handoff) => {
    const assignment = data.spotAssignments.find((item) => item.id === handoff.assignmentId);
    const contract = data.contracts.find((item) => item.id === handoff.contractId);
    const staff = data.staffProfiles.find((item) => item.id === assignment?.staffId);
    const vehicle = data.vehicles.find((item) => item.id === (contract?.vehicleId ?? assignment?.vehicleId));
    return {
      handoff,
      status: getEffectiveContractHandoffStatus(handoff, now),
      assignment,
      contract,
      staff,
      vehicle,
    };
  }), [data.contractHandoffs, data.contracts, data.spotAssignments, data.staffProfiles, data.vehicles, now]);

  const counts = useMemo(() => ({
    waiting: rows.filter((row) => row.status === "連携待ち").length,
    completed: rows.filter((row) => row.status === "完了").length,
    expired: rows.filter((row) => row.status === "期限切れ").length,
    revoked: rows.filter((row) => row.status === "無効").length,
  }), [rows]);

  const visibleRows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== "すべて" && row.status !== filter) return false;
      if (!normalized) return true;
      return [
        row.assignment?.leadLabel,
        row.contract?.customerLabel,
        row.staff?.displayName,
        row.vehicle?.managementNumber,
        row.vehicle?.name,
        row.handoff.externalContractId,
      ].some((value) => value?.toLowerCase().includes(normalized));
    });
  }, [filter, rows, search]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshData();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <PageHeader
        title="契約連携履歴"
        description="販売・買取契約システムから管理システムへの反映状況を確認します。事業主だけが閲覧できます。"
        action={<button type="button" className="secondary-button" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={17} className={refreshing ? "spin" : ""} />{refreshing ? "確認中" : "最新状態を確認"}</button>}
      />

      <div className="mini-summary-grid handoff-summary-grid">
        <button type="button" className="mini-summary-card amber" onClick={() => setFilter("連携待ち")}><small>連携待ち</small><strong>{counts.waiting}件</strong></button>
        <button type="button" className="mini-summary-card green" onClick={() => setFilter("完了")}><small>管理へ反映済み</small><strong>{counts.completed}件</strong></button>
        <button type="button" className="mini-summary-card red" onClick={() => setFilter("期限切れ")}><small>期限切れ</small><strong>{counts.expired}件</strong></button>
        <button type="button" className="mini-summary-card" onClick={() => setFilter("無効")}><small>再発行等で無効</small><strong>{counts.revoked}件</strong></button>
      </div>

      <section className="integration-note panel">
        <History size={24} />
        <div><strong>完了した契約は在庫・入出金へ一度だけ反映されます</strong><p>連携待ちは契約システム側で署名・保存が完了していない状態です。期限切れの場合は、担当案件から契約システムをもう一度開くと新しい連携が発行されます。</p></div>
      </section>

      <section className="filter-bar panel">
        <label className="search-field"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="案件・担当者・車両・外部契約IDで検索" /></label>
        <div className="segmented-control handoff-filter" aria-label="連携状態で絞り込む">
          {filterStatuses.map((status) => <button key={status} type="button" className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status}</button>)}
        </div>
        <span className="result-count">{visibleRows.length}件</span>
      </section>

      <section className="table-panel panel">
        <div className="panel-heading"><div><h2>連携の発行・完了履歴</h2><p>再発行前の履歴も削除せず残ります。</p></div></div>
        <div className="table-scroll">
          <table className="data-table handoff-table">
            <thead><tr><th>発行日時</th><th>種別・案件</th><th>担当者</th><th>状態</th><th>外部契約ID</th><th>完了・期限</th></tr></thead>
            <tbody>
              {visibleRows.map(({ handoff, status, assignment, contract, staff, vehicle }) => (
                <tr key={handoff.id}>
                  <td>{formatDateTime(handoff.issuedAt)}</td>
                  <td><span className="vehicle-reference"><strong>{handoff.contractType}　{assignment?.leadLabel || contract?.customerLabel || "担当案件"}</strong><small>{vehicle ? `${vehicle.managementNumber} ${vehicle.name}` : contract?.status ?? "契約確認中"}</small></span></td>
                  <td>{staff?.displayName ?? "利用停止・未登録"}</td>
                  <td><StatusBadge>{status}</StatusBadge></td>
                  <td><span className="handoff-external-id">{handoff.externalContractId ?? "—"}</span></td>
                  <td><span className="vehicle-reference"><strong>{handoff.completedAt ? formatDateTime(handoff.completedAt) : "未完了"}</strong><small>{status === "完了" ? "管理システムへ反映済み" : `期限 ${formatDateTime(handoff.expiresAt)}`}</small></span></td>
                </tr>
              ))}
              {!visibleRows.length ? <tr><td colSpan={6} className="table-empty"><Inbox size={24} /><p>{data.contractHandoffs.length ? "条件に一致する履歴はありません。" : "契約連携の履歴はまだありません。"}</p></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
