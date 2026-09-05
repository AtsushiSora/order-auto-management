import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { getAuthCallbackSession, getSafeAuthErrorDetail, isPasswordSetupUrl } from "../lib/authFlow";
import type { StaffProfile, StaffRole } from "../types";

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
const TEST_SESSION_KEY = "order-auto-test-session";
export const isTestLoginEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_LOGIN === "true";

const hasStoredTestSession = () =>
  isTestLoginEnabled
  && typeof window !== "undefined"
  && window.sessionStorage.getItem(TEST_SESSION_KEY) === "active";

type AuthContextValue = {
  configured: boolean;
  isTestSession: boolean;
  loading: boolean;
  user: User | null;
  session: Session | null;
  profile: StaffProfile | null;
  passwordSetupRequired: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  testSignIn: () => void;
  switchTestRole: (role: "owner" | "spot") => void;
  updatePassword: (password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const demoProfile: StaffProfile = {
  id: "demo-owner",
  displayName: "事業主",
  role: "owner",
  isActive: true,
  employeeNumber: 1,
  employmentStatus: "active",
  profileCompletedAt: new Date().toISOString(),
};

const demoSpotProfile: StaffProfile = {
  id: "demo-spot",
  displayName: "スポットスタッフ",
  role: "spot",
  isActive: true,
  employeeNumber: 4,
  employmentStatus: "active",
  profileCompletedAt: new Date().toISOString(),
};

const AuthContext = createContext<AuthContextValue | null>(null);

const parseProfile = (data: unknown): StaffProfile => {
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    role: row.role as StaffRole,
    isActive: Boolean(row.is_active),
    employeeNumber: row.employee_number == null ? null : Number(row.employee_number),
    employmentStatus: (["active", "paused", "retired"].includes(String(row.employment_status))
      ? String(row.employment_status)
      : Boolean(row.is_active) ? "active" : "paused") as StaffProfile["employmentStatus"],
    lastName: String(row.last_name ?? ""),
    firstName: String(row.first_name ?? ""),
    lastNameKana: String(row.last_name_kana ?? ""),
    firstNameKana: String(row.first_name_kana ?? ""),
    postalCode: String(row.postal_code ?? ""),
    address: String(row.address ?? ""),
    phone: String(row.phone ?? ""),
    birthDate: row.birth_date ? String(row.birth_date) : null,
    licenseFrontPath: String(row.license_front_path ?? ""),
    licenseBackPath: String(row.license_back_path ?? ""),
    licenseExpiry: row.license_expiry ? String(row.license_expiry) : null,
    profileCompletedAt: row.profile_completed_at ? String(row.profile_completed_at) : null,
  };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isTestSession, setIsTestSession] = useState(hasStoredTestSession);
  const [loading, setLoading] = useState(isSupabaseConfigured && !hasStoredTestSession());
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(
    isSupabaseConfigured && !hasStoredTestSession() ? null : demoProfile,
  );
  const [passwordSetupRequired, setPasswordSetupRequired] = useState(
    isSupabaseConfigured && isPasswordSetupUrl(window.location.href),
  );
  const [error, setError] = useState<string | null>(null);
  const inactivityTimer = useRef<number | null>(null);

  const clearAuthenticatedState = useCallback(() => {
    setUser(null);
    setSession(null);
    setProfile(null);
  }, []);

  const loadProfile = useCallback(async (nextSession: Session | null) => {
    if (!supabase || !nextSession) {
      clearAuthenticatedState();
      setLoading(false);
      return;
    }

    setSession(nextSession);
    setUser(nextSession.user);
    setError(null);
    const { data, error: profileError } = await supabase
      .from("staff_profiles")
      .select("*")
      .eq("id", nextSession.user.id)
      .maybeSingle();

    if (profileError) {
      setProfile(null);
      setError("利用者情報を確認できませんでした。事業主へ連絡してください。");
    } else if (!data) {
      setProfile(null);
      setError("このログインには社内利用者の登録がありません。");
    } else {
      const nextProfile = parseProfile(data);
      setProfile(nextProfile);
      if (!nextProfile.isActive) {
        setError("この利用者は現在、利用停止になっています。");
      }
    }
    setLoading(false);
  }, [clearAuthenticatedState]);

  useEffect(() => {
    if (isTestSession) {
      setLoading(false);
      setError(null);
      setProfile(demoProfile);
      return;
    }
    if (!supabase) return;

    const authClient = supabase;
    let active = true;
    const callbackSession = getAuthCallbackSession(window.location.href);

    const restoreSession = async () => {
      if (callbackSession) {
        setPasswordSetupRequired(true);
        const { data, error: sessionError } = await authClient.auth.setSession({
          access_token: callbackSession.accessToken,
          refresh_token: callbackSession.refreshToken,
        });

        if (!active) return;
        if (sessionError || !data.session) {
          clearAuthenticatedState();
          const detail = getSafeAuthErrorDetail(sessionError);
          setError(`再設定リンクを確認できませんでした（${detail}）。`);
          setLoading(false);
          return;
        }

        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
        await loadProfile(data.session);
        return;
      }

      const { data } = await authClient.auth.getSession();
      if (active) await loadProfile(data.session);
    };

    void restoreSession();

    const { data: listener } = authClient.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && isPasswordSetupUrl(window.location.href))) {
        setPasswordSetupRequired(true);
      }
      window.setTimeout(() => {
        if (active) void loadProfile(nextSession);
      }, 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [clearAuthenticatedState, isTestSession, loadProfile]);

  const signOut = useCallback(async () => {
    if (isTestSession) {
      window.sessionStorage.removeItem(TEST_SESSION_KEY);
      setIsTestSession(false);
      clearAuthenticatedState();
      return;
    }
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    clearAuthenticatedState();
    if (signOutError) throw signOutError;
  }, [clearAuthenticatedState, isTestSession]);

  useEffect(() => {
    if (!supabase || !session || !profile?.isActive) return;

    const resetTimer = () => {
      if (inactivityTimer.current !== null) window.clearTimeout(inactivityTimer.current);
      inactivityTimer.current = window.setTimeout(() => void signOut(), INACTIVITY_LIMIT_MS);
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((event) => window.addEventListener(event, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      if (inactivityTimer.current !== null) window.clearTimeout(inactivityTimer.current);
    };
  }, [profile?.isActive, session, signOut]);

  const value = useMemo<AuthContextValue>(() => ({
    configured: isSupabaseConfigured && !isTestSession,
    isTestSession,
    loading,
    user,
    session,
    profile,
    passwordSetupRequired,
    error,
    signIn: async (email, password) => {
      if (!supabase) return;
      setError(null);
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw new Error("メールアドレスまたはパスワードを確認してください。");
    },
    testSignIn: () => {
      if (!isTestLoginEnabled) return;
      window.sessionStorage.setItem(TEST_SESSION_KEY, "active");
      setError(null);
      setProfile(demoProfile);
      setIsTestSession(true);
      setLoading(false);
      window.location.hash = "#/dashboard";
    },
    switchTestRole: (role) => {
      if (!isTestSession) return;
      setProfile(role === "spot" ? demoSpotProfile : demoProfile);
      window.location.hash = role === "spot" ? "#/spot-workspace" : "#/dashboard";
    },
    updatePassword: async (password) => {
      if (!supabase) return;
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error("パスワードを設定できませんでした。招待メールをもう一度開いてください。");
      setPasswordSetupRequired(false);
      window.history.replaceState({}, document.title, window.location.pathname);
      window.location.hash = "#/dashboard";
    },
    refreshProfile: async () => {
      if (isTestSession) return;
      await loadProfile(session);
    },
    signOut,
  }), [error, isTestSession, loadProfile, loading, passwordSetupRequired, profile, session, signOut, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
};
