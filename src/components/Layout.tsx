import {
  BarChart3,
  BriefcaseBusiness,
  BookOpen,
  Car,
  ChevronDown,
  FileSignature,
  History,
  ListChecks,
  FileOutput,
  Home,
  Globe2,
  LogOut,
  Menu,
  ReceiptJapaneseYen,
  Users,
  Settings,
  ShoppingCart,
  WalletCards,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAppData } from "../state/AppDataContext";
import { useAuth } from "../state/AuthContext";
import { staffRoleLabels, type PageId } from "../types";

const navItems: Array<{
  id: PageId;
  label: string;
  icon: typeof Home;
  phase?: "第2段階";
  ownerOnly?: boolean;
  hiddenForSpot?: boolean;
  spotOnly?: boolean;
}> = [
  { id: "dashboard", label: "TOP", icon: Home },
  { id: "vehicles", label: "在庫", icon: Car },
  { id: "purchase-contracts", label: "買取契約", icon: FileSignature },
  { id: "sales-contracts", label: "販売契約", icon: ShoppingCart },
  { id: "expenses", label: "経費", icon: ReceiptJapaneseYen },
  { id: "payments", label: "入出金", icon: WalletCards },
  { id: "issued-documents", label: "S・R発行", icon: FileOutput, hiddenForSpot: true },
  { id: "staff-settlements", label: "スタッフ精算", icon: Users },
  { id: "contract-handoffs", label: "契約連携履歴", icon: History, ownerOnly: true },
  { id: "spot-workspace", label: "担当案件", icon: BriefcaseBusiness, spotOnly: true },
  { id: "profits", label: "利益", icon: BarChart3 },
  { id: "site-integration", label: "サイト連携", icon: Globe2 },
  { id: "antique-ledger", label: "古物台帳", icon: BookOpen, hiddenForSpot: true },
  { id: "accounting", label: "経理・仕訳候補", icon: ReceiptJapaneseYen },
  { id: "production-readiness", label: "本番前チェック", icon: ListChecks, ownerOnly: true },
  { id: "settings", label: "設定", icon: Settings, ownerOnly: true },
];

export function Layout({
  currentPage,
  onNavigate,
  children,
}: {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  children: ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { profile, signOut, isTestSession, switchTestRole } = useAuth();
  const { isDemo } = useAppData();
  const visibleNavItems = navItems
    .filter((item) => {
      if (profile?.role === "spot") return item.spotOnly || item.id === "staff-settlements";
      return !item.spotOnly && (!item.ownerOnly || profile?.role === "owner");
    })
    .map((item) => profile?.role === "spot" && item.id === "staff-settlements"
      ? { ...item, label: "紹介料確認" }
      : item);
  const userLabel = profile?.displayName ?? "利用者";
  const roleLabel = profile ? staffRoleLabels[profile.role] : "確認中";
  const mobileNavItems = profile?.role === "spot"
    ? [
        { id: "spot-workspace" as PageId, label: "担当案件", icon: BriefcaseBusiness },
        { id: "staff-settlements" as PageId, label: "紹介料", icon: Users },
      ]
    : [
        { id: "dashboard" as PageId, label: "TOP", icon: Home },
        { id: "vehicles" as PageId, label: "在庫", icon: Car },
        { id: "purchase-contracts" as PageId, label: "契約", icon: FileSignature },
        { id: "payments" as PageId, label: "入出金", icon: WalletCards },
      ];
  const contractPageActive = currentPage === "purchase-contracts" || currentPage === "sales-contracts";
  const mainMobilePageActive = mobileNavItems.some(({ id }) =>
    id === "purchase-contracts" ? contractPageActive : currentPage === id,
  );

  const navigate = (page: PageId) => {
    onNavigate(page);
    setMobileMenuOpen(false);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">O</div>
          <div>
            <strong>オーダーオート</strong>
            <span>管理システム</span>
          </div>
          <button
            className="sidebar-close"
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="メニューを閉じる"
          >
            <X size={22} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="メインメニュー">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={currentPage === item.id ? "active" : ""}
                onClick={() => navigate(item.id)}
              >
                <Icon size={21} strokeWidth={2} />
                <span>{item.label}</span>
                {item.phase ? <small>{item.phase}</small> : null}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="demo-dot" />
          <div>
            <strong>{isTestSession ? "テストモード" : isDemo ? "初期デモ版" : "共有データ接続中"}</strong>
            <span>{isDemo ? "架空データのみ" : "Supabase・社内限定"}</span>
          </div>
        </div>
      </aside>

      {mobileMenuOpen ? (
        <button
          type="button"
          className="mobile-overlay"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="メニューを閉じる"
        />
      ) : null}

      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu-button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="メニューを開く"
          >
            <Menu size={24} />
          </button>
          <div className="topbar-title">オーダーオート 管理システム</div>
          <div className="user-menu-wrap">
            <button
              type="button"
              className="user-menu"
              aria-label="利用者メニュー"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((open) => !open)}
            >
              <span className="user-avatar">{userLabel.slice(0, 1)}</span>
              <span>
                <strong>{userLabel}</strong>
                <small>{roleLabel}</small>
              </span>
              <ChevronDown size={17} />
            </button>
            {userMenuOpen ? (
              <div className="user-dropdown panel">
                <div><strong>{userLabel}</strong><small>{roleLabel}</small></div>
                {isTestSession ? <button type="button" onClick={() => { switchTestRole(profile?.role === "spot" ? "owner" : "spot"); setUserMenuOpen(false); }}><Users size={17} />{profile?.role === "spot" ? "事業主表示を確認" : "スポット表示を確認"}</button> : null}
                <button type="button" onClick={() => void signOut()} disabled={isDemo && !isTestSession}>
                  <LogOut size={17} />
                  {isTestSession ? "テスト終了" : isDemo ? "デモモード" : "ログアウト"}
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <main className="content">{children}</main>
      </div>

      <nav
        className={`mobile-bottom-nav ${profile?.role === "spot" ? "spot" : ""}`}
        aria-label="スマートフォン用メニュー"
      >
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = item.id === "purchase-contracts" ? contractPageActive : currentPage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={active ? "active" : ""}
              onClick={() => navigate(item.id)}
            >
              <Icon size={21} strokeWidth={active ? 2.5 : 2} />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={mobileMenuOpen || !mainMobilePageActive ? "active" : ""}
          onClick={() => setMobileMenuOpen(true)}
        >
          <Menu size={21} />
          <span>その他</span>
        </button>
      </nav>
    </div>
  );
}
