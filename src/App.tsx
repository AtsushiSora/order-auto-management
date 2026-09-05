import { useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { AccountingPage } from "./pages/AccountingPage";
import { AntiqueLedgerPage } from "./pages/AntiqueLedgerPage";
import { ContractsPage } from "./pages/ContractsPage";
import { CustomersPage } from "./pages/CustomersPage";
import { ContractHandoffsPage } from "./pages/ContractHandoffsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { IssuedDocumentsPage } from "./pages/IssuedDocumentsPage";
import { ProfitsPage } from "./pages/ProfitsPage";
import { ProductionReadinessPage } from "./pages/ProductionReadinessPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SiteIntegrationPage } from "./pages/SiteIntegrationPage";
import { StaffSettlementsPage } from "./pages/StaffSettlementsPage";
import { StaffProfileSetupPage } from "./pages/StaffProfileSetupPage";
import { SpotWorkspacePage } from "./pages/SpotWorkspacePage";
import { VehiclesPage } from "./pages/VehiclesPage";
import { useAuth } from "./state/AuthContext";
import type { PageId } from "./types";

const pageIds: PageId[] = [
  "dashboard",
  "customers",
  "vehicles",
  "purchase-contracts",
  "sales-contracts",
  "expenses",
  "payments",
  "profits",
  "site-integration",
  "antique-ledger",
  "accounting",
  "issued-documents",
  "staff-settlements",
  "contract-handoffs",
  "spot-workspace",
  "production-readiness",
  "settings",
];

const getPageFromHash = (): PageId => {
  const hash = window.location.hash.replace("#/", "") as PageId;
  return pageIds.includes(hash) ? hash : "dashboard";
};

export default function App() {
  const { profile, isTestSession } = useAuth();
  const [page, setPage] = useState<PageId>(getPageFromHash);
  const [vehicleFormRequested, setVehicleFormRequested] = useState(false);

  useEffect(() => {
    const onHashChange = () => setPage(getPageFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const spotAllowed = page === "spot-workspace" || page === "staff-settlements" || page === "customers";
    const restrictedForSpot = profile?.role === "spot" && !spotAllowed;
    const restrictedForOthers = profile?.role !== "spot" && page === "spot-workspace";
    const restrictedOwnerPage = ["settings", "contract-handoffs", "production-readiness"].includes(page) && profile?.role !== "owner";
    if (restrictedForSpot || restrictedForOthers || restrictedOwnerPage) {
      const fallback: PageId = profile?.role === "spot" ? "spot-workspace" : "dashboard";
      window.location.hash = `#/${fallback}`;
      setPage(fallback);
    }
  }, [page, profile?.role]);

  const navigate = (nextPage: PageId) => {
    window.location.hash = `#/${nextPage}`;
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const renderPage = () => {
    switch (page) {
      case "customers":
        return <CustomersPage onNavigate={navigate} />;
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
        return <AntiqueLedgerPage />;
      case "accounting":
        return <AccountingPage />;
      case "issued-documents":
        return <IssuedDocumentsPage />;
      case "staff-settlements":
        return <StaffSettlementsPage />;
      case "contract-handoffs":
        return <ContractHandoffsPage />;
      case "spot-workspace":
        return <SpotWorkspacePage />;
      case "settings":
        return <SettingsPage />;
      case "production-readiness":
        return <ProductionReadinessPage />;
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

  if (!isTestSession && profile && !profile.profileCompletedAt) return <StaffProfileSetupPage />;

  return (
    <Layout currentPage={page} onNavigate={navigate}>
      {renderPage()}
    </Layout>
  );
}
