import { useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { AccountingPlaceholderPage } from "./pages/AccountingPlaceholderPage";
import { ContractsPage } from "./pages/ContractsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { ProfitsPage } from "./pages/ProfitsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SiteIntegrationPage } from "./pages/SiteIntegrationPage";
import { VehiclesPage } from "./pages/VehiclesPage";
import { useAuth } from "./state/AuthContext";
import type { PageId } from "./types";

const pageIds: PageId[] = [
  "dashboard",
  "vehicles",
  "purchase-contracts",
  "sales-contracts",
  "expenses",
  "payments",
  "profits",
  "site-integration",
  "antique-ledger",
  "accounting",
  "settings",
];

const getPageFromHash = (): PageId => {
  const hash = window.location.hash.replace("#/", "") as PageId;
  return pageIds.includes(hash) ? hash : "dashboard";
};

export default function App() {
  const { profile } = useAuth();
  const [page, setPage] = useState<PageId>(getPageFromHash);
  const [vehicleFormRequested, setVehicleFormRequested] = useState(false);

  useEffect(() => {
    const onHashChange = () => setPage(getPageFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (page === "settings" && profile?.role !== "owner") {
      window.location.hash = "#/dashboard";
      setPage("dashboard");
    }
  }, [page, profile?.role]);

  const navigate = (nextPage: PageId) => {
    window.location.hash = `#/${nextPage}`;
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const renderPage = () => {
    switch (page) {
      case "vehicles":
        return (
          <VehiclesPage
            openNewForm={vehicleFormRequested}
            onNewFormOpened={() => setVehicleFormRequested(false)}
          />
        );
      case "purchase-contracts":
        return <ContractsPage type="買取" />;
      case "sales-contracts":
        return <ContractsPage type="販売" />;
      case "expenses":
        return <ExpensesPage />;
      case "payments":
        return <PaymentsPage />;
      case "profits":
        return <ProfitsPage />;
      case "site-integration":
        return <SiteIntegrationPage />;
      case "antique-ledger":
        return <AccountingPlaceholderPage type="古物台帳" />;
      case "accounting":
        return <AccountingPlaceholderPage type="経理・仕訳候補" />;
      case "settings":
        return <SettingsPage />;
      default:
        return (
          <DashboardPage
            onNavigate={navigate}
            onCreateVehicle={() => {
              setVehicleFormRequested(true);
              navigate("vehicles");
            }}
          />
        );
    }
  };

  return (
    <Layout currentPage={page} onNavigate={navigate}>
      {renderPage()}
    </Layout>
  );
}
