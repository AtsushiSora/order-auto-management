import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AccessBlocked, SystemLoading } from "./components/SystemState";
import { LoginPage } from "./pages/LoginPage";
import { PasswordSetupPage } from "./pages/PasswordSetupPage";
import { AppDataProvider } from "./state/AppDataContext";
import { AuthProvider, useAuth } from "./state/AuthContext";
import "./styles.css";

function AppGate() {
  const { configured, loading, session, profile, passwordSetupRequired, error, signOut } = useAuth();

  if (loading) return <SystemLoading message="ログイン状態を確認しています" />;
  if (configured && session && passwordSetupRequired) return <PasswordSetupPage />;
  if (configured && error && passwordSetupRequired) {
    return <AccessBlocked message={error} onLogout={() => void signOut()} />;
  }
  if (configured && !session) return <LoginPage />;
  if (configured && (error || !profile?.isActive)) {
    return <AccessBlocked message={error ?? "この利用者は現在利用できません。"} onLogout={() => void signOut()} />;
  }
  return <AppDataProvider><App /></AppDataProvider>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  </StrictMode>,
);
