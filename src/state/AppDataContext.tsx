import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DataLoadError, SystemLoading } from "../components/SystemState";
import { seedData } from "../data/seed";
import { supabase } from "../lib/supabase";
import {
  mapApprovalFromDb,
  mapCashflowFromDb,
  mapContractFromDb,
  mapExpenseFromDb,
  mapVehicleFromDb,
  newCashflowToDb,
  newExpenseToDb,
  newVehicleToDb,
  vehiclePatchToDb,
} from "../lib/supabaseData";
import type {
  AppData,
  NewCashflowInput,
  NewExpenseInput,
  NewVehicleInput,
  Vehicle,
} from "../types";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "order-auto-management-demo-v1";
const emptyData: AppData = { vehicles: [], expenses: [], cashflows: [], contracts: [], approvals: [] };

type AppDataContextValue = {
  data: AppData;
  isDemo: boolean;
  addVehicle: (input: NewVehicleInput) => Promise<Vehicle>;
  updateVehicle: (vehicleId: string, patch: Partial<Vehicle>) => Promise<void>;
  addExpense: (input: NewExpenseInput) => Promise<void>;
  addCashflow: (input: NewCashflowInput) => Promise<void>;
  resetDemoData: () => void;
  refreshData: () => Promise<void>;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

const cloneSeedData = (): AppData => structuredClone(seedData);

const loadInitialDemoData = (): AppData => {
  if (typeof window === "undefined") return cloneSeedData();
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return cloneSeedData();
    return JSON.parse(stored) as AppData;
  } catch {
    return cloneSeedData();
  }
};

const nextManagementNumber = (vehicles: Vehicle[]): string => {
  const year = String(new Date().getFullYear()).slice(-2);
  const currentNumbers = vehicles
    .map((vehicle) => vehicle.managementNumber)
    .filter((number) => number.startsWith(`${year}-`))
    .map((number) => Number(number.split("-")[1]))
    .filter(Number.isFinite);
  const next = Math.max(0, ...currentNumbers) + 1;
  return `${year}-${String(next).padStart(4, "0")}`;
};

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return "予期しないエラーが発生しました。";
};

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { configured, session } = useAuth();
  const [data, setData] = useState<AppData>(() => configured ? emptyData : loadInitialDemoData());
  const [loading, setLoading] = useState(configured);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [configured, data]);

  const refreshData = useCallback(async () => {
    if (!configured || !supabase || !session) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [vehiclesResult, expensesResult, cashflowsResult, contractsResult, approvalsResult] = await Promise.all([
        supabase.from("vehicles").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("expenses").select("*").is("deleted_at", null).order("incurred_on", { ascending: false }),
        supabase.from("cashflows").select("*").is("deleted_at", null).order("scheduled_on", { ascending: false }),
        supabase.from("contracts").select("*").is("deleted_at", null).order("updated_at", { ascending: false }),
        supabase.from("approvals").select("*").order("created_at", { ascending: false }),
      ]);

      const firstError = [vehiclesResult, expensesResult, cashflowsResult, contractsResult, approvalsResult]
        .find((result) => result.error)?.error;
      if (firstError) throw firstError;

      setData({
        vehicles: (vehiclesResult.data ?? []).map(mapVehicleFromDb),
        expenses: (expensesResult.data ?? []).map(mapExpenseFromDb),
        cashflows: (cashflowsResult.data ?? []).map(mapCashflowFromDb),
        contracts: (contractsResult.data ?? []).map(mapContractFromDb),
        approvals: (approvalsResult.data ?? []).map(mapApprovalFromDb),
      });
    } catch (reason) {
      setLoadError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [configured, session]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const value = useMemo<AppDataContextValue>(() => ({
    data,
    isDemo: !configured,
    addVehicle: async (input) => {
      if (configured && supabase) {
        const { data: inserted, error } = await supabase
          .from("vehicles")
          .insert(newVehicleToDb(input))
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        const vehicle = mapVehicleFromDb(inserted);
        setData((current) => ({ ...current, vehicles: [vehicle, ...current.vehicles] }));
        return vehicle;
      }

      const now = new Date().toISOString();
      const vehicle: Vehicle = {
        id: crypto.randomUUID(),
        managementNumber: nextManagementNumber(data.vehicles),
        ...input,
        salePrice: null,
        arrivedAt: input.status === "入庫予定" ? null : now.slice(0, 10),
        deliveredAt: null,
        documentsComplete: false,
        createdAt: now,
        updatedAt: now,
      };
      setData((current) => ({ ...current, vehicles: [vehicle, ...current.vehicles] }));
      return vehicle;
    },
    updateVehicle: async (vehicleId, patch) => {
      if (configured && supabase) {
        const { data: updated, error } = await supabase
          .from("vehicles")
          .update(vehiclePatchToDb(patch))
          .eq("id", vehicleId)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        const vehicle = mapVehicleFromDb(updated);
        setData((current) => ({
          ...current,
          vehicles: current.vehicles.map((item) => item.id === vehicleId ? vehicle : item),
        }));
        return;
      }

      setData((current) => ({
        ...current,
        vehicles: current.vehicles.map((vehicle) => vehicle.id === vehicleId
          ? { ...vehicle, ...patch, updatedAt: new Date().toISOString() }
          : vehicle),
      }));
    },
    addExpense: async (input) => {
      if (configured && supabase) {
        const { data: inserted, error } = await supabase
          .from("expenses")
          .insert(newExpenseToDb(input))
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        const expense = mapExpenseFromDb(inserted);
        setData((current) => ({ ...current, expenses: [expense, ...current.expenses] }));
        return;
      }

      setData((current) => ({
        ...current,
        expenses: [{ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...current.expenses],
      }));
    },
    addCashflow: async (input) => {
      if (configured && supabase) {
        const { data: inserted, error } = await supabase
          .from("cashflows")
          .insert(newCashflowToDb(input))
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        const cashflow = mapCashflowFromDb(inserted);
        setData((current) => ({ ...current, cashflows: [cashflow, ...current.cashflows] }));
        return;
      }

      setData((current) => ({
        ...current,
        cashflows: [{ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...current.cashflows],
      }));
    },
    resetDemoData: () => {
      if (!configured) setData(cloneSeedData());
    },
    refreshData,
  }), [configured, data, refreshData]);

  if (loading) return <SystemLoading message="共有データを読み込んでいます" />;
  if (loadError) return <DataLoadError message={loadError} onRetry={() => void refreshData()} />;

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export const useAppData = () => {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData must be used within AppDataProvider");
  return value;
};

