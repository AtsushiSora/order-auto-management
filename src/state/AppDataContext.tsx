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
import { buildAntiqueLedgerEntries } from "../lib/antiqueLedger";
import { supabase } from "../lib/supabase";
import {
  antiqueLedgerDetailToDb,
  mapApprovalFromDb,
  mapAntiqueLedgerDetailFromDb,
  mapCashflowFromDb,
  mapContractFromDb,
  mapExpenseFromDb,
  mapVehicleFromDb,
  mapVehicleDocumentFromDb,
  mapWebsiteInquiryFromDb,
  expenseToRpc,
  newCashflowToDb,
  newVehicleToDb,
  purchaseContractToRpc,
  saleContractToRpc,
  vehiclePatchToDb,
  vehicleInspectionImportToRpc,
  vehiclePublicationToRpc,
  vehicleDocumentToDb,
  websiteInquiryStatusToRpc,
} from "../lib/supabaseData";
import type {
  AppData,
  NewCashflowInput,
  NewExpenseInput,
  NewVehicleInput,
  PurchaseContractInput,
  SaleContractInput,
  SaveAntiqueLedgerDetailInput,
  SaveExpenseInput,
  Vehicle,
  VehicleInspectionImportInput,
  VehicleDocument,
  VehicleDocumentInput,
  VehiclePublicationInput,
  WebsiteInquiryStatus,
} from "../types";
import { useAuth } from "./AuthContext";

const STORAGE_KEY = "order-auto-management-demo-v1";
const emptyData: AppData = {
  vehicles: [],
  vehicleDocuments: [],
  expenses: [],
  cashflows: [],
  contracts: [],
  approvals: [],
  websiteInquiries: [],
  antiqueLedgerDetails: [],
};

type AppDataContextValue = {
  data: AppData;
  isDemo: boolean;
  addVehicle: (input: NewVehicleInput) => Promise<Vehicle>;
  updateVehicle: (vehicleId: string, patch: Partial<Vehicle>) => Promise<void>;
  saveVehiclePublication: (input: VehiclePublicationInput) => Promise<void>;
  updateWebsiteInquiryStatus: (inquiryId: string, status: WebsiteInquiryStatus) => Promise<void>;
  markVehicleArrived: (vehicleId: string, arrivedOn: string) => Promise<void>;
  markVehicleDelivered: (vehicleId: string, deliveredOn: string) => Promise<void>;
  updateVehicleDocument: (input: VehicleDocumentInput) => Promise<VehicleDocument>;
  archiveVehicle: (vehicleId: string) => Promise<void>;
  addExpense: (input: NewExpenseInput) => Promise<void>;
  saveExpense: (input: SaveExpenseInput) => Promise<void>;
  addCashflow: (input: NewCashflowInput) => Promise<void>;
  completeCashflow: (cashflowId: string, processedOn: string) => Promise<void>;
  savePurchaseContract: (input: PurchaseContractInput) => Promise<void>;
  saveSaleContract: (input: SaleContractInput) => Promise<void>;
  saveAntiqueLedgerDetail: (input: SaveAntiqueLedgerDetailInput) => Promise<void>;
  applyVehicleInspectionImport: (input: VehicleInspectionImportInput) => Promise<void>;
  resetDemoData: () => void;
  refreshData: () => Promise<void>;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

const cloneSeedData = (): AppData => structuredClone(seedData);

const publicationDefaults = (vehicle: Pick<Vehicle, "askingPrice">) => ({
  salesSitePublished: false,
  soldDisplayMode: "売約済み表示" as const,
  publicMaker: "",
  publicGrade: "",
  publicYear: "",
  publicMileage: "",
  publicColor: "",
  publicInspection: "",
  publicPrice: vehicle.askingPrice,
  publicDescription: "",
  publicImageUrl: "",
});

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
      vehicles: (parsed.vehicles ?? seed.vehicles).map((vehicle) => ({
        ...publicationDefaults(vehicle),
        ...vehicle,
      })),
      vehicleDocuments: parsed.vehicleDocuments ?? [],
      expenses: (parsed.expenses ?? seed.expenses).map((expense) => ({
        ...expense,
        paymentMethod: expense.paymentMethod ?? "振込",
      })),
      cashflows: (parsed.cashflows ?? seed.cashflows).map((cashflow) => ({
        ...cashflow,
        kind: cashflow.kind ?? demoCashflowKind(cashflow),
      })),
      websiteInquiries: parsed.websiteInquiries ?? seed.websiteInquiries,
      antiqueLedgerDetails: parsed.antiqueLedgerDetails ?? seed.antiqueLedgerDetails,
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
      const [vehiclesResult, documentsResult, expensesResult, cashflowsResult, contractsResult, approvalsResult, inquiriesResult, ledgerResult] = await Promise.all([
        supabase.from("vehicles").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        supabase.from("vehicle_documents").select("*").order("created_at", { ascending: true }),
        supabase.from("expenses").select("*").is("deleted_at", null).order("incurred_on", { ascending: false }),
        supabase.from("cashflows").select("*").is("deleted_at", null).order("scheduled_on", { ascending: false }),
        supabase.from("contracts").select("*").is("deleted_at", null).order("updated_at", { ascending: false }),
        supabase.from("approvals").select("*").order("created_at", { ascending: false }),
        supabase.from("website_inquiries").select("*").order("received_at", { ascending: false }),
        supabase.from("antique_ledger_details").select("*").order("updated_at", { ascending: false }),
      ]);

      const firstError = [vehiclesResult, documentsResult, expensesResult, cashflowsResult, contractsResult, approvalsResult, inquiriesResult, ledgerResult]
        .find((result) => result.error)?.error;
      if (firstError) throw firstError;

      setData({
        vehicles: (vehiclesResult.data ?? []).map(mapVehicleFromDb),
        vehicleDocuments: (documentsResult.data ?? []).map(mapVehicleDocumentFromDb),
        expenses: (expensesResult.data ?? []).map(mapExpenseFromDb),
        cashflows: (cashflowsResult.data ?? []).map(mapCashflowFromDb),
        contracts: (contractsResult.data ?? []).map(mapContractFromDb),
        approvals: (approvalsResult.data ?? []).map(mapApprovalFromDb),
        websiteInquiries: (inquiriesResult.data ?? []).map(mapWebsiteInquiryFromDb),
        antiqueLedgerDetails: (ledgerResult.data ?? []).map(mapAntiqueLedgerDetailFromDb),
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

  const persistExpense = useCallback(async (input: SaveExpenseInput) => {
    if (!input.category.trim() || !input.description.trim()) throw new Error("費用項目と内容を入力してください。");
    if (input.amount <= 0) throw new Error("金額は1円以上で入力してください。");
    if (!input.incurredOn) throw new Error("発生日を入力してください。");
    if (input.expenseStatus === "予定" && input.paymentStatus === "支払済み") {
      throw new Error("予定費用を支払済みにはできません。");
    }

    if (configured && supabase) {
      const { error } = await supabase.rpc("save_expense", expenseToRpc(input));
      if (error) throw new Error(error.message);
      await refreshData();
      return;
    }

    const existing = input.expenseId ? data.expenses.find((expense) => expense.id === input.expenseId) : null;
    if (input.expenseId && !existing) throw new Error("対象の経費が見つかりません。");
    const linked = input.expenseId
      ? data.cashflows.find((cashflow) => cashflow.expenseId === input.expenseId && cashflow.kind === "経費支払い")
      : null;
    if (input.expenseStatus === "予定" && linked && linked.processedAmount > 0) {
      throw new Error("支払い処理済みの経費は予定費用へ戻せません。");
    }
    if (input.paymentStatus === "未払い" && linked?.status === "完了") {
      throw new Error("支払済みの取消は入出金の訂正機能から行ってください。");
    }
    if (linked && input.amount < linked.processedAmount) {
      throw new Error("金額を支払い済み額より少なくできません。");
    }

    const now = new Date().toISOString();
    const expenseId = existing?.id ?? crypto.randomUUID();
    const expense = {
      id: expenseId,
      vehicleId: input.vehicleId,
      category: input.category.trim(),
      description: input.description.trim(),
      amount: input.amount,
      expenseStatus: input.expenseStatus,
      paymentStatus: input.expenseStatus === "予定" ? "未払い" as const : input.paymentStatus,
      paymentMethod: input.paymentMethod,
      incurredOn: input.incurredOn,
      createdAt: existing?.createdAt ?? now,
    };

    setData((current) => {
      let cashflows = current.cashflows;
      if (input.expenseStatus === "予定") {
        cashflows = linked ? cashflows.filter((cashflow) => cashflow.id !== linked.id) : cashflows;
      } else {
        const processedAmount = input.paymentStatus === "支払済み" ? input.amount : linked?.processedAmount ?? 0;
        const status = processedAmount === 0 ? "未処理" as const : processedAmount >= input.amount ? "完了" as const : "一部" as const;
        const cashflow = {
          id: linked?.id ?? crypto.randomUUID(),
          vehicleId: input.vehicleId,
          expenseId,
          direction: "支払い" as const,
          kind: "経費支払い" as const,
          description: `経費 ${input.category.trim()}：${input.description.trim()}`,
          amount: input.amount,
          processedAmount,
          status,
          method: input.paymentMethod,
          scheduledOn: input.incurredOn,
          processedOn: status === "完了" ? linked?.processedOn ?? now.slice(0, 10) : linked?.processedOn ?? null,
          createdAt: linked?.createdAt ?? now,
        };
        cashflows = [cashflow, ...cashflows.filter((item) => item.id !== cashflow.id)];
      }
      return {
        ...current,
        expenses: [expense, ...current.expenses.filter((item) => item.id !== expenseId)],
        cashflows,
      };
    });
  }, [configured, data.cashflows, data.expenses, refreshData]);

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
        ...publicationDefaults(input),
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
    saveVehiclePublication: async (input) => {
      const target = data.vehicles.find((vehicle) => vehicle.id === input.vehicleId);
      if (!target) throw new Error("対象車両が見つかりません。");
      if (input.publicPrice < 0) throw new Error("サイト表示価格は0円以上で入力してください。");
      if (input.salesSitePublished) {
        if (!["販売中", "売約済み", "納車済み"].includes(target.status)) {
          throw new Error("販売中・売約済み・納車済みの車両だけ公開できます。");
        }
        if (!input.publicMaker.trim()) throw new Error("公開する場合はメーカーを入力してください。");
      }
      if (configured && supabase) {
        const { error } = await supabase.rpc("save_vehicle_publication", vehiclePublicationToRpc(input));
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }
      setData((current) => ({
        ...current,
        vehicles: current.vehicles.map((vehicle) => vehicle.id === input.vehicleId
          ? { ...vehicle, ...input, updatedAt: new Date().toISOString() }
          : vehicle),
      }));
    },
    updateWebsiteInquiryStatus: async (inquiryId, status) => {
      if (configured && supabase) {
        const { error } = await supabase.rpc("update_website_inquiry_status", websiteInquiryStatusToRpc(inquiryId, status));
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }
      setData((current) => ({
        ...current,
        websiteInquiries: current.websiteInquiries.map((inquiry) => inquiry.id === inquiryId ? { ...inquiry, status } : inquiry),
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
    markVehicleDelivered: async (vehicleId, deliveredOn) => {
      if (!deliveredOn) throw new Error("実際の納車日を入力してください。");
      if (deliveredOn > new Date().toISOString().slice(0, 10)) {
        throw new Error("実際の納車日に未来の日付は指定できません。");
      }
      if (configured && supabase) {
        const { error } = await supabase.rpc("mark_vehicle_delivered", {
          p_vehicle_id: vehicleId,
          p_delivered_on: deliveredOn,
        });
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }

      const target = data.vehicles.find((vehicle) => vehicle.id === vehicleId);
      if (!target) throw new Error("対象車両が見つかりません。");
      if (target.status !== "売約済み") throw new Error("売約済みの車両だけ納車処理できます。");
      if (target.arrivedAt && deliveredOn < target.arrivedAt) throw new Error("納車日は入庫日以降で入力してください。");
      const saleReceipt = data.cashflows.find((cashflow) => cashflow.vehicleId === vehicleId && cashflow.kind === "販売代金");
      if (!saleReceipt || saleReceipt.status !== "完了") throw new Error("販売代金の入金完了後に納車してください。");
      setData((current) => ({
        ...current,
        vehicles: current.vehicles.map((vehicle) => vehicle.id === vehicleId
          ? { ...vehicle, status: "納車済み", deliveredAt: deliveredOn, updatedAt: new Date().toISOString() }
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
    addExpense: async (input) => persistExpense({ ...input, expenseId: null }),
    saveExpense: persistExpense,
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
        expenses: cashflow.expenseId
          ? current.expenses.map((expense) => expense.id === cashflow.expenseId ? { ...expense, paymentStatus: "支払済み" } : expense)
          : current.expenses,
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
          ...publicationDefaults({ askingPrice: input.askingPrice }),
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
    saveSaleContract: async (input) => {
      if (configured && supabase) {
        const { error } = await supabase.rpc("save_sale_contract", saleContractToRpc(input));
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }

      const existing = input.contractId
        ? data.contracts.find((contract) => contract.id === input.contractId && contract.type === "販売")
        : null;
      if (existing?.status === "契約済み") throw new Error("契約済みの内容は在庫画面から確認してください。");
      const vehicle = data.vehicles.find((item) => item.id === input.vehicleId);
      if (!vehicle) throw new Error("対象車両が見つかりません。");
      if (input.status === "契約済み" && !["入庫済み", "販売中"].includes(vehicle.status)) {
        throw new Error("入庫済みまたは販売中の車両だけ販売契約できます。");
      }
      if (input.status === "契約済み" && input.amount <= 0) throw new Error("契約済みにする場合は販売金額を1円以上で入力してください。");
      const duplicate = data.contracts.find((contract) => contract.type === "販売" && contract.vehicleId === input.vehicleId && contract.id !== input.contractId && contract.status !== "キャンセル済み");
      if (duplicate) throw new Error("この車両にはすでに販売契約があります。");

      const now = new Date().toISOString();
      const contractId = existing?.id ?? crypto.randomUUID();
      const contract = {
        id: contractId,
        type: "販売" as const,
        vehicleId: input.vehicleId,
        customerLabel: input.customerLabel.trim(),
        amount: input.amount,
        status: input.status,
        contractedOn: input.contractedOn,
        salePaymentMethod: input.paymentMethod,
        updatedAt: now,
      };
      setData((current) => {
        const next = {
          ...current,
          contracts: [contract, ...current.contracts.filter((item) => item.id !== contractId)],
        };
        if (input.status !== "契約済み") return next;
        return {
          ...next,
          vehicles: current.vehicles.map((item) => item.id === input.vehicleId
            ? { ...item, status: "売約済み", salePrice: input.amount, updatedAt: now }
            : item),
          cashflows: [{
            id: crypto.randomUUID(),
            vehicleId: input.vehicleId,
            direction: "入金" as const,
            kind: "販売代金" as const,
            description: `販売代金 ${input.customerLabel.trim()}`,
            amount: input.amount,
            processedAmount: 0,
            status: "未処理" as const,
            method: input.paymentMethod,
            scheduledOn: input.contractedOn,
            processedOn: null,
            createdAt: now,
          }, ...current.cashflows],
        };
      });
    },
    saveAntiqueLedgerDetail: async (input) => {
      if (input.sellerAge != null && (!Number.isInteger(input.sellerAge) || input.sellerAge < 0 || input.sellerAge > 120)) {
        throw new Error("年齢は0歳から120歳の整数で入力してください。");
      }
      const vehicle = data.vehicles.find((item) => item.id === input.vehicleId);
      if (!vehicle) throw new Error("対象車両が見つかりません。");
      const receivedOn = input.receivedOnOverride || vehicle.arrivedAt;
      const disposedOn = input.disposalOnOverride || vehicle.deliveredAt;
      if (receivedOn && disposedOn && disposedOn < receivedOn) {
        throw new Error("払出年月日は受入年月日以降で入力してください。");
      }

      if (configured && supabase) {
        const { error } = await supabase
          .from("antique_ledger_details")
          .upsert(antiqueLedgerDetailToDb(input), { onConflict: "vehicle_id" });
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }

      const existing = data.antiqueLedgerDetails.find((item) => item.vehicleId === input.vehicleId);
      const now = new Date().toISOString();
      const saved = {
        ...input,
        id: existing?.id ?? crypto.randomUUID(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      setData((current) => ({
        ...current,
        antiqueLedgerDetails: [
          saved,
          ...current.antiqueLedgerDetails.filter((item) => item.vehicleId !== input.vehicleId),
        ],
      }));
    },
    applyVehicleInspectionImport: async (input) => {
      const vehicle = data.vehicles.find((item) => item.id === input.vehicleId);
      if (!vehicle) throw new Error("対象車両が見つかりません。");
      if (![input.vehicleName, input.chassisNumber, input.registrationNumber, input.registeredOwnerName].some((value) => value.trim())) {
        throw new Error("反映する車検証情報を1項目以上入力してください。");
      }

      if (configured && supabase) {
        const { error } = await supabase.rpc(
          "apply_vehicle_inspection_import",
          vehicleInspectionImportToRpc(input),
        );
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }

      const now = new Date().toISOString();
      setData((current) => {
        const target = current.vehicles.find((item) => item.id === input.vehicleId);
        if (!target) return current;
        const existing = current.antiqueLedgerDetails.find((item) => item.vehicleId === input.vehicleId)
          ?? buildAntiqueLedgerEntries(current).find((entry) => entry.vehicleId === input.vehicleId)?.detail;
        if (!existing) return current;
        const detail = {
          ...existing,
          registrationNumber: input.registrationNumber.trim() || existing.registrationNumber,
          registeredOwnerName: input.registeredOwnerName.trim() || existing.registeredOwnerName,
          updatedAt: now,
        };
        return {
          ...current,
          vehicles: current.vehicles.map((item) => item.id === input.vehicleId ? {
            ...item,
            name: input.vehicleName.trim() || item.name,
            chassisNumber: input.chassisNumber.trim() || item.chassisNumber,
            updatedAt: now,
          } : item),
          antiqueLedgerDetails: [
            detail,
            ...current.antiqueLedgerDetails.filter((item) => item.vehicleId !== input.vehicleId),
          ],
        };
      });
    },
    resetDemoData: () => {
      if (!configured) setData(cloneSeedData());
    },
    refreshData,
  }), [configured, data, persistExpense, refreshData, session?.user.id]);

  if (loading) return <SystemLoading message="共有データを読み込んでいます" />;
  if (loadError) return <DataLoadError message={loadError} onRetry={() => void refreshData()} />;

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export const useAppData = () => {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData must be used within AppDataProvider");
  return value;
};
