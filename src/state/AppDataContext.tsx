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
  mapVehicleDocumentFromDb,
  newCashflowToDb,
  newExpenseToDb,
  newVehicleToDb,
  purchaseContractToRpc,
  vehiclePatchToDb,
  vehicleDocumentToDb,
} from "../lib/supabaseData";
import type {
  AppData,
  NewCashflowInput,
  NewExpenseInput,
  NewVehicleInput,
  PurchaseContractInput,
  Vehicle,
  VehicleDocument,
  VehicleDocumentInput,
} from "../types";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "order-auto-management-demo-v1";
const emptyData: AppData = { vehicles: [], vehicleDocuments: [], expenses: [], cashflows: [], contracts: [], approvals: [] };

type AppDataContextValue = {
  data: AppData;
  isDemo: boolean;
  addVehicle: (input: NewVehicleInput) => Promise<Vehicle>;
  updateVehicle: (vehicleId: string, patch: Partial<Vehicle>) => Promise<void>;
  markVehicleArrived: (vehicleId: string, arrivedOn: string) => Promise<void>;
  updateVehicleDocument: (input: VehicleDocumentInput) => Promise<VehicleDocument>;
  archiveVehicle: (vehicleId: string) => Promise<void>;
  addExpense: (input: NewExpenseInput) => Promise<void>;
  addCashflow: (input: NewCashflowInput) => Promise<void>;
  completeCashflow: (cashflowId: string, processedOn: string) => Promise<void>;
  savePurchaseContract: (input: PurchaseContractInput) => Promise<void>;
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
    const parsed = JSON.parse(stored) as Partial<AppData>;
    const seed = cloneSeedData();
    return {
      ...seed,
      ...parsed,
      vehicleDocuments: parsed.vehicleDocuments ?? [],
      cashflows: (parsed.cashflows ?? seed.cashflows).map((cashflow) => ({
        ...cashflow,
        kind: cashflow.kind ?? demoCashflowKind(cashflow),
      })),
    };
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

function demoCashflowKind(input: NewCashflowInput) {
  if (input.kind) return input.kind;
  if (input.direction === "支払い" && input.description.includes("買取")) return "買取代金" as const;
  if (input.direction === "入金" && input.description.includes("販売")) return "販売代金" as const;
  if (input.direction === "支払い" && input.description.includes("経費")) return "経費支払い" as const;
  if (input.description.includes("返金")) return "返金" as const;
  return "その他" as const;
}

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
      const [vehiclesResult, documentsResult, expensesResult, cashflowsResult, contractsResult, approvalsResult] = await Promise.all([
        supabase.from("vehicles").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("vehicle_documents").select("*").order("created_at", { ascending: true }),
        supabase.from("expenses").select("*").is("deleted_at", null).order("incurred_on", { ascending: false }),
        supabase.from("cashflows").select("*").is("deleted_at", null).order("scheduled_on", { ascending: false }),
        supabase.from("contracts").select("*").is("deleted_at", null).order("updated_at", { ascending: false }),
        supabase.from("approvals").select("*").order("created_at", { ascending: false }),
      ]);

      const firstError = [vehiclesResult, documentsResult, expensesResult, cashflowsResult, contractsResult, approvalsResult]
        .find((result) => result.error)?.error;
      if (firstError) throw firstError;

      setData({
        vehicles: (vehiclesResult.data ?? []).map(mapVehicleFromDb),
        vehicleDocuments: (documentsResult.data ?? []).map(mapVehicleDocumentFromDb),
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
    markVehicleArrived: async (vehicleId, arrivedOn) => {
      if (!arrivedOn) throw new Error("実際の入庫日を入力してください。");
      if (arrivedOn > new Date().toISOString().slice(0, 10)) {
        throw new Error("実際の入庫日に未来の日付は指定できません。");
      }
      if (configured && supabase) {
        const { error } = await supabase.rpc("mark_vehicle_arrived", {
          p_vehicle_id: vehicleId,
          p_arrived_on: arrivedOn,
        });
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }

      const target = data.vehicles.find((vehicle) => vehicle.id === vehicleId);
      if (!target) throw new Error("対象車両が見つかりません。");
      if (target.status !== "入庫予定") throw new Error("この車両はすでに入庫処理されています。");
      setData((current) => ({
        ...current,
        vehicles: current.vehicles.map((vehicle) => vehicle.id === vehicleId
          ? { ...vehicle, status: "入庫済み", arrivedAt: arrivedOn, updatedAt: new Date().toISOString() }
          : vehicle),
      }));
    },
    updateVehicleDocument: async (input) => {
      if (configured && supabase) {
        const { data: updated, error } = await supabase
          .from("vehicle_documents")
          .upsert(vehicleDocumentToDb(input), { onConflict: "vehicle_id,document_type" })
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        const document = mapVehicleDocumentFromDb(updated);
        setData((current) => ({
          ...current,
          vehicleDocuments: [
            ...current.vehicleDocuments.filter((item) => !(item.vehicleId === document.vehicleId && item.documentType === document.documentType)),
            document,
          ],
        }));
        return document;
      }

      const existing = data.vehicleDocuments.find(
        (item) => item.vehicleId === input.vehicleId && item.documentType === input.documentType,
      );
      const now = new Date().toISOString();
      const document: VehicleDocument = {
        ...input,
        id: existing?.id ?? crypto.randomUUID(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      setData((current) => ({
        ...current,
        vehicleDocuments: [
          ...current.vehicleDocuments.filter((item) => !(item.vehicleId === document.vehicleId && item.documentType === document.documentType)),
          document,
        ],
      }));
      return document;
    },
    archiveVehicle: async (vehicleId) => {
      if (configured && supabase) {
        if (!session?.user.id) throw new Error("ログイン情報を確認できませんでした。");
        const { error } = await supabase
          .from("vehicles")
          .update({ deleted_at: new Date().toISOString(), deleted_by: session.user.id })
          .eq("id", vehicleId);
        if (error) throw new Error(error.message);
      }
      setData((current) => ({
        ...current,
        vehicles: current.vehicles.filter((vehicle) => vehicle.id !== vehicleId),
        vehicleDocuments: current.vehicleDocuments.filter((document) => document.vehicleId !== vehicleId),
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
        cashflows: [{ ...input, kind: demoCashflowKind(input), id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...current.cashflows],
      }));
    },
    completeCashflow: async (cashflowId, processedOn) => {
      if (!processedOn) throw new Error("処理日を入力してください。");
      if (processedOn > new Date().toISOString().slice(0, 10)) {
        throw new Error("処理日に未来の日付は指定できません。");
      }
      if (configured && supabase) {
        const { error } = await supabase.rpc("complete_cashflow", {
          p_cashflow_id: cashflowId,
          p_processed_on: processedOn,
        });
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }

      const cashflow = data.cashflows.find((item) => item.id === cashflowId);
      if (!cashflow) throw new Error("対象の入出金が見つかりません。");
      if (cashflow.kind === "買取代金") {
        const vehicle = data.vehicles.find((item) => item.id === cashflow.vehicleId);
        if (!vehicle) throw new Error("対象車両が見つかりません。");
        if (vehicle.status === "入庫予定") throw new Error("買取代金は車両の入庫後に支払ってください。");
      }
      setData((current) => ({
        ...current,
        cashflows: current.cashflows.map((item) => item.id === cashflowId
          ? { ...item, processedAmount: item.amount, status: "完了", processedOn }
          : item),
      }));
    },
    savePurchaseContract: async (input) => {
      if (configured && supabase) {
        const { error } = await supabase.rpc("save_purchase_contract", purchaseContractToRpc(input));
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }

      const existing = input.contractId
        ? data.contracts.find((contract) => contract.id === input.contractId && contract.type === "買取")
        : null;
      if (existing?.status === "契約済み") {
        throw new Error("契約済みの内容は在庫画面から修正してください。");
      }

      const now = new Date().toISOString();
      const contractId = existing?.id ?? crypto.randomUUID();
      const vehicleId = input.status === "契約済み" ? crypto.randomUUID() : null;
      const contract = {
        id: contractId,
        type: "買取" as const,
        vehicleId,
        customerLabel: input.customerLabel.trim(),
        amount: input.amount,
        status: input.status,
        contractedOn: input.contractedOn,
        vehicleName: input.vehicleName.trim(),
        chassisNumber: input.chassisNumber.trim(),
        acquisitionSource: input.acquisitionSource,
        askingPrice: input.askingPrice,
        storageLocation: input.storageLocation.trim(),
        plannedArrivalDate: input.plannedArrivalDate,
        paymentMethod: input.paymentMethod,
        updatedAt: now,
      };

      setData((current) => {
        const next = {
          ...current,
          contracts: [contract, ...current.contracts.filter((item) => item.id !== contractId)],
        };
        if (!vehicleId) return next;

        const vehicle: Vehicle = {
          id: vehicleId,
          managementNumber: nextManagementNumber(current.vehicles),
          name: input.vehicleName.trim(),
          chassisNumber: input.chassisNumber.trim(),
          status: "入庫予定",
          acquisitionSource: input.acquisitionSource,
          purchasePrice: input.amount,
          askingPrice: input.askingPrice,
          salePrice: null,
          storageLocation: input.storageLocation.trim(),
          plannedArrivalDate: input.plannedArrivalDate,
          arrivedAt: null,
          deliveredAt: null,
          documentsComplete: false,
          createdAt: now,
          updatedAt: now,
        };
        return {
          ...next,
          vehicles: [vehicle, ...current.vehicles],
          cashflows: input.amount === 0 ? current.cashflows : [{
            id: crypto.randomUUID(),
            vehicleId,
            direction: "支払い" as const,
            kind: "買取代金" as const,
            description: `買取代金 ${input.customerLabel.trim()}`,
            amount: input.amount,
            processedAmount: 0,
            status: "未処理" as const,
            method: input.paymentMethod,
            scheduledOn: input.plannedArrivalDate,
            processedOn: null,
            createdAt: now,
          }, ...current.cashflows],
        };
      });
    },
    resetDemoData: () => {
      if (!configured) setData(cloneSeedData());
    },
    refreshData,
  }), [configured, data, refreshData, session?.user.id]);

  if (loading) return <SystemLoading message="共有データを読み込んでいます" />;
  if (loadError) return <DataLoadError message={loadError} onRetry={() => void refreshData()} />;

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export const useAppData = () => {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData must be used within AppDataProvider");
  return value;
};
