import {
  BarChart3,
  BookOpen,
  Car,
  ChevronDown,
  FileSignature,
  FileOutput,
  Home,
  Globe2,
  LogOut,
  Menu,
  ReceiptJapaneseYen,
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
}> = [
  { id: "dashboard", label: "TOP", icon: Home },
  { id: "vehicles", label: "在庫", icon: Car },
  { id: "purchase-contracts", label: "買取契約", icon: FileSignature },
  { id: "sales-contracts", label: "販売契約", icon: ShoppingCart },
  { id: "expenses", label: "経費", icon: ReceiptJapaneseYen },
  { id: "payments", label: "入出金", icon: WalletCards },
  { id: "issued-documents", label: "S・R発行", icon: FileOutput, hiddenForSpot: true },
  { id: "profits", label: "利益", icon: BarChart3 },
  { id: "site-integration", label: "サイト連携", icon: Globe2 },
  { id: "antique-ledger", label: "古物台帳", icon: BookOpen, hiddenForSpot: true },
  { id: "accounting", label: "経理・仕訳候補", icon: ReceiptJapaneseYen },
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
  const { profile, signOut, isTestSession } = useAuth();
  const { isDemo } = useAppData();
  const visibleNavItems = navItems.filter((item) =>
    (!item.ownerOnly || profile?.role === "owner") &&
    (!item.hiddenForSpot || profile?.role !== "spot"),
  );
  const userLabel = profile?.displayName ?? "利用者";
  const roleLabel = profile ? staffRoleLabels[profile.role] : "確認中";

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
    </div>
  );
}
