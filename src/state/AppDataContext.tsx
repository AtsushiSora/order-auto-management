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
import { DataLoadError, SystemLoading } from "../components/SystemState";
import { seedData } from "../data/seed";
import { buildAntiqueLedgerEntries } from "../lib/antiqueLedger";
import { buildExpenseEvidencePath, PRIVATE_BUCKET, validateEvidenceFile } from "../lib/evidence";
import { canIssueDocument, findCompletedSaleReceipt, includedTaxAmount, nextDemoDocumentNumber } from "../lib/issuedDocuments";
import { calculateStaffPlannedAmount } from "../lib/staffSettlements";
import { validateSpotAssignment } from "../lib/spotAssignments";
import { validateStaffInvitationInput, validateStaffProfileUpdate } from "../lib/staffProfiles";
import { calculateMonthlyBalance, calculateMonthlyMovement } from "../lib/monthlyBalance";
import { emptyProductionReadiness, normalizeProductionReadiness, statusToDb } from "../lib/productionReadiness";
import { isVehicleReceiptChecklistComplete } from "../lib/vehicleReceiptChecklist";
import { validateVehicleDispositionCompletion } from "../lib/vehicleDisposition";
import { supabase } from "../lib/supabase";
import {
  antiqueLedgerDetailToDb,
  mapApprovalFromDb,
  mapAttachmentFromDb,
  mapAntiqueLedgerDetailFromDb,
  mapCashflowFromDb,
  mapCashflowEventFromDb,
  mapCashflowOffsetFromDb,
  mapContractFromDb,
  mapContractHandoffFromDb,
  mapExpenseFromDb,
  mapJournalCandidateReviewFromDb,
  mapJournalExportFromDb,
  mapMonthlyBalanceCheckFromDb,
  mapSystemBackupFromDb,
  mapIssuedDocumentFromDb,
  mapStaffProfileFromDb,
  mapStaffSettlementFromDb,
  mapSpotAssignmentFromDb,
  mapVehicleFromDb,
  mapVehicleDocumentFromDb,
  mapWebsiteInquiryFromDb,
  expenseToRpc,
  newCashflowToDb,
  newVehicleToDb,
  purchaseContractToRpc,
  journalCandidateReviewToRpc,
  saleContractToRpc,
  vehiclePatchToDb,
  vehicleInspectionImportToRpc,
  vehiclePublicationToRpc,
  vehicleDocumentToDb,
  websiteInquiryStatusToRpc,
  issueDocumentToRpc,
  staffSettlementToRpc,
  spotAssignmentToRpc,
  spotPurchaseContractToRpc,
  spotSaleContractToRpc,
  vehicleDispositionCompletionToRpc,
} from "../lib/supabaseData";
import type {
  AppData,
  Attachment,
  AttachmentCategory,
  IssuedDocument,
  IssueDocumentInput,
  SaveStaffSettlementInput,
  SaveSpotAssignmentInput,
  SpotAssignment,
  StaffSettlement,
  NewCashflowInput,
  NewExpenseInput,
  NewVehicleInput,
  PurchaseContractInput,
  SaleContractInput,
  SaveAntiqueLedgerDetailInput,
  SaveExpenseInput,
  SaveJournalCandidateReviewInput,
  Vehicle,
  VehicleInspectionImportInput,
  VehicleDocument,
  VehicleDocumentInput,
  VehiclePublicationInput,
  WebsiteInquiryStatus,
  CashflowOffset,
  CashflowEvent,
  CompleteVehicleDispositionInput,
  InviteStaffProfileInput,
  MonthlyBalanceCheck,
  SaveMonthlyBalanceCheckInput,
  UpdateStaffProfileInput,
  BackupRestoreMode,
  SystemBackup,
  ProductionReadiness,
  ProductionReadinessCheckKey,
  ReadinessCheckStatus,
} from "../types";
import { isTestLoginEnabled, useAuth } from "./AuthContext";

const STORAGE_KEY = "order-auto-management-demo-v1";
const READINESS_STORAGE_KEY = "order-auto-management-readiness-v1";
const demoEvidenceUrls = new Map<string, string>();
const demoBackupPayloads = new Map<string, AppData>();

const functionErrorMessage = async (reason: unknown, fallback: string) => {
  if (!reason || typeof reason !== "object") return fallback;
  const context = "context" in reason ? reason.context : null;
  if (!(context instanceof Response)) return fallback;
  try {
    const detail = await context.clone().json() as { error?: unknown };
    return typeof detail.error === "string" && detail.error.trim() ? detail.error : fallback;
  } catch {
    return fallback;
  }
};
const emptyData: AppData = {
  staffProfiles: [],
  spotAssignments: [],
  contractHandoffs: [],
  vehicles: [],
  vehicleDocuments: [],
  expenses: [],
  attachments: [],
  issuedDocuments: [],
  staffSettlements: [],
  cashflows: [],
  cashflowOffsets: [],
  cashflowEvents: [],
  monthlyBalanceChecks: [],
  systemBackups: [],
  contracts: [],
  approvals: [],
  websiteInquiries: [],
  antiqueLedgerDetails: [],
  journalCandidateReviews: [],
  journalExports: [],
};

type AppDataContextValue = {
  data: AppData;
  isDemo: boolean;
  productionReadiness: ProductionReadiness;
  inviteStaffProfile: (input: InviteStaffProfileInput) => Promise<void>;
  updateStaffProfile: (input: UpdateStaffProfileInput) => Promise<void>;
  addVehicle: (input: NewVehicleInput) => Promise<Vehicle>;
  updateVehicle: (vehicleId: string, patch: Partial<Vehicle>) => Promise<void>;
  completeVehicleDisposition: (input: CompleteVehicleDispositionInput) => Promise<void>;
  saveVehiclePublication: (input: VehiclePublicationInput) => Promise<void>;
  updateWebsiteInquiryStatus: (inquiryId: string, status: WebsiteInquiryStatus) => Promise<void>;
  markVehicleArrived: (vehicleId: string, arrivedOn: string) => Promise<void>;
  markVehicleDelivered: (vehicleId: string, deliveredOn: string) => Promise<void>;
  updateVehicleDocument: (input: VehicleDocumentInput) => Promise<VehicleDocument>;
  archiveVehicle: (vehicleId: string) => Promise<void>;
  addExpense: (input: NewExpenseInput) => Promise<void>;
  saveExpense: (input: SaveExpenseInput) => Promise<void>;
  uploadExpenseAttachment: (expenseId: string, category: AttachmentCategory, file: File) => Promise<void>;
  getAttachmentUrl: (attachmentId: string) => Promise<string>;
  deleteAttachment: (attachmentId: string) => Promise<void>;
  issueDocument: (input: IssueDocumentInput) => Promise<IssuedDocument>;
  voidIssuedDocument: (documentId: string) => Promise<void>;
  saveStaffSettlement: (input: SaveStaffSettlementInput) => Promise<StaffSettlement>;
  confirmStaffSettlement: (settlementId: string, confirmedAmount: number, confirmedOn: string) => Promise<void>;
  settleStaffSettlement: (settlementId: string, settledOn: string) => Promise<void>;
  cancelStaffSettlement: (settlementId: string) => Promise<void>;
  saveSpotAssignment: (input: SaveSpotAssignmentInput) => Promise<SpotAssignment>;
  finishSpotAssignment: (assignmentId: string, cancel: boolean) => Promise<void>;
  saveSpotPurchaseContract: (assignmentId: string, input: PurchaseContractInput) => Promise<void>;
  saveSpotSaleContract: (assignmentId: string, input: SaleContractInput) => Promise<void>;
  issueContractHandoff: (assignmentId: string) => Promise<{ completionToken: string; expiresAt: string }>;
  issueDirectContractHandoff: (contractId: string) => Promise<{ completionToken: string; expiresAt: string }>;
  retryContractHandoff: (handoffId: string) => Promise<void>;
  addCashflow: (input: NewCashflowInput) => Promise<void>;
  completeCashflow: (cashflowId: string, processedOn: string) => Promise<void>;
  applyCashflowOffset: (saleCashflowId: string, purchaseCashflowId: string, amount: number, offsetOn: string, note: string) => Promise<CashflowOffset>;
  voidCashflowOffset: (offsetId: string) => Promise<void>;
  saveMonthlyBalanceCheck: (input: SaveMonthlyBalanceCheckInput) => Promise<MonthlyBalanceCheck>;
  createSystemBackup: () => Promise<SystemBackup>;
  downloadSystemBackup: (backupId: string) => Promise<Blob>;
  saveSystemBackupToDrive: (backupId: string, googleAccessToken: string) => Promise<{ folderUrl: string }>;
  restoreSystemBackup: (backupId: string, mode: BackupRestoreMode) => Promise<void>;
  deleteSystemBackup: (backupId: string) => Promise<void>;
  saveProductionReadinessCheck: (checkKey: ProductionReadinessCheckKey, status: ReadinessCheckStatus, note: string) => Promise<void>;
  setProductionApproved: (approved: boolean) => Promise<void>;
  savePurchaseContract: (input: PurchaseContractInput) => Promise<string>;
  saveSaleContract: (input: SaleContractInput) => Promise<string>;
  saveAntiqueLedgerDetail: (input: SaveAntiqueLedgerDetailInput) => Promise<void>;
  applyVehicleInspectionImport: (input: VehicleInspectionImportInput) => Promise<void>;
  saveJournalCandidateReview: (input: SaveJournalCandidateReviewInput) => Promise<void>;
  recordJournalExport: (targetMonth: string, rowCount: number) => Promise<void>;
  resetDemoData: () => void;
  refreshData: () => Promise<void>;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

const cloneSeedData = (): AppData => structuredClone(seedData);

const mergeDemoBackup = (current: AppData, backup: AppData): AppData => {
  const merged = { ...current } as AppData;
  for (const key of Object.keys(current) as (keyof AppData)[]) {
    if (key === "systemBackups") continue;
    const currentRows = current[key];
    const backupRows = backup[key];
    const existingIds = new Set(currentRows.map((row) => row.id));
    (merged[key] as typeof currentRows) = [
      ...currentRows,
      ...backupRows.filter((row) => !existingIds.has(row.id)),
    ] as typeof currentRows;
  }
  return merged;
};

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
      staffProfiles: parsed.staffProfiles ?? seed.staffProfiles,
      spotAssignments: parsed.spotAssignments ?? [],
      contractHandoffs: parsed.contractHandoffs ?? [],
      vehicles: (parsed.vehicles ?? seed.vehicles).map((vehicle) => ({
        ...publicationDefaults(vehicle),
        ...vehicle,
        disposition: vehicle.disposition ?? "未定",
      })),
      vehicleDocuments: parsed.vehicleDocuments ?? [],
      expenses: (parsed.expenses ?? seed.expenses).map((expense) => ({
        ...expense,
        paymentMethod: expense.paymentMethod ?? "振込",
      })),
      attachments: parsed.attachments ?? [],
      issuedDocuments: parsed.issuedDocuments ?? [],
      staffSettlements: parsed.staffSettlements ?? [],
      cashflows: (parsed.cashflows ?? seed.cashflows).map((cashflow) => ({
        ...cashflow,
        kind: cashflow.kind ?? demoCashflowKind(cashflow),
      })),
      cashflowOffsets: parsed.cashflowOffsets ?? [],
      cashflowEvents: parsed.cashflowEvents ?? seed.cashflowEvents,
      monthlyBalanceChecks: parsed.monthlyBalanceChecks ?? [],
      systemBackups: [],
      websiteInquiries: parsed.websiteInquiries ?? seed.websiteInquiries,
      antiqueLedgerDetails: parsed.antiqueLedgerDetails ?? seed.antiqueLedgerDetails,
      journalCandidateReviews: parsed.journalCandidateReviews ?? seed.journalCandidateReviews,
      journalExports: parsed.journalExports ?? seed.journalExports,
    };
  } catch {
    return cloneSeedData();
  }
};

const loadInitialDemoReadiness = (): ProductionReadiness => {
  if (typeof window === "undefined") return emptyProductionReadiness();
  try {
    const stored = window.localStorage.getItem(READINESS_STORAGE_KEY);
    return stored ? normalizeProductionReadiness(JSON.parse(stored)) : emptyProductionReadiness();
  } catch {
    return emptyProductionReadiness();
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
  if (error && typeof error === "object") {
    const detail = error as { code?: unknown; message?: unknown };
    const message = typeof detail.message === "string" ? detail.message.trim() : "";
    const code = typeof detail.code === "string" ? detail.code.trim() : "";
    if (/failed to fetch|network|timeout|load failed/i.test(message)) {
      return "通信が不安定です。電波状況を確認して、もう一度試してください。";
    }
    if (message) return code ? `${message}（${code}）` : message;
  }
  return "予期しないエラーが発生しました。";
};

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { configured, session, profile, refreshProfile, signOut, testSignIn } = useAuth();
  const [data, setData] = useState<AppData>(() => configured ? emptyData : loadInitialDemoData());
  const [productionReadiness, setProductionReadiness] = useState<ProductionReadiness>(() => configured ? emptyProductionReadiness() : loadInitialDemoReadiness());
  const [loading, setLoading] = useState(configured);
  const [loadError, setLoadError] = useState<string | null>(null);
  const configuredRef = useRef(configured);
  const refreshRequestId = useRef(0);
  configuredRef.current = configured;

  useEffect(() => {
    if (!configured) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [configured, data]);

  useEffect(() => {
    if (!configured) window.localStorage.setItem(READINESS_STORAGE_KEY, JSON.stringify(productionReadiness));
  }, [configured, productionReadiness]);

  useEffect(() => {
    if (configured) return;
    refreshRequestId.current += 1;
    setData(loadInitialDemoData());
    setProductionReadiness(loadInitialDemoReadiness());
    setLoading(false);
    setLoadError(null);
  }, [configured]);

  const refreshData = useCallback(async () => {
    if (!configured || !supabase || !session) return;
    const client = supabase;
    const requestId = ++refreshRequestId.current;
    const requestIsCurrent = () => configuredRef.current && refreshRequestId.current === requestId;
    setLoading(true);
    setLoadError(null);
    try {
      const fetchResults = () => Promise.all([
        client.from("staff_profiles").select("*").order("display_name", { ascending: true }),
        client.from("spot_assignments").select("*").order("created_at", { ascending: false }),
        client.from("contract_handoffs").select("*").order("issued_at", { ascending: false }),
        client.from("vehicles").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
        client.from("vehicle_documents").select("*").order("created_at", { ascending: true }),
        client.from("expenses").select("*").is("deleted_at", null).order("incurred_on", { ascending: false }),
        client.from("attachments").select("*").order("created_at", { ascending: false }),
        client.from("issued_documents").select("*").order("issued_on", { ascending: false }).order("created_at", { ascending: false }),
        client.from("staff_settlements").select("*").order("created_at", { ascending: false }),
        client.from("cashflows").select("*").is("deleted_at", null).order("scheduled_on", { ascending: false }),
        client.from("cashflow_offsets").select("*").order("created_at", { ascending: false }),
        client.from("cashflow_events").select("*").order("processed_on", { ascending: false }),
        client.from("monthly_balance_checks").select("*").order("target_month", { ascending: false }),
        client.from("system_backups").select("id, backup_kind, row_count, attachment_file_count, attachment_total_bytes, attachment_backup_status, drive_folder_url, drive_saved_at, created_at").order("created_at", { ascending: false }),
        client.from("contracts").select("*").is("deleted_at", null).order("updated_at", { ascending: false }),
        client.from("approvals").select("*").order("created_at", { ascending: false }),
        client.from("website_inquiries").select("*").order("received_at", { ascending: false }),
        client.from("antique_ledger_details").select("*").order("updated_at", { ascending: false }),
        client.from("journal_candidate_reviews").select("*").order("candidate_date", { ascending: false }),
        client.from("journal_exports").select("*").order("created_at", { ascending: false }),
        client.from("app_settings").select("value, updated_at").eq("key", "production_readiness").maybeSingle(),
      ] as const);

      let results = await fetchResults();
      let firstError = results.find((result) => result.error)?.error;

      if (firstError) {
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        results = await fetchResults();
        firstError = results.find((result) => result.error)?.error;
      }

      if (firstError) throw firstError;

      if (!requestIsCurrent()) return;

      const [staffResult, spotAssignmentsResult, contractHandoffsResult, vehiclesResult, documentsResult, expensesResult, attachmentsResult, issuedDocumentsResult, staffSettlementsResult, cashflowsResult, cashflowOffsetsResult, cashflowEventsResult, monthlyBalanceChecksResult, systemBackupsResult, contractsResult, approvalsResult, inquiriesResult, ledgerResult, journalReviewsResult, journalExportsResult, readinessResult] = results;

      setData({
        staffProfiles: (staffResult.data ?? []).map(mapStaffProfileFromDb),
        spotAssignments: (spotAssignmentsResult.data ?? []).map(mapSpotAssignmentFromDb),
        contractHandoffs: (contractHandoffsResult.data ?? []).map(mapContractHandoffFromDb),
        vehicles: (vehiclesResult.data ?? []).map(mapVehicleFromDb),
        vehicleDocuments: (documentsResult.data ?? []).map(mapVehicleDocumentFromDb),
        expenses: (expensesResult.data ?? []).map(mapExpenseFromDb),
        attachments: (attachmentsResult.data ?? []).map(mapAttachmentFromDb),
        issuedDocuments: (issuedDocumentsResult.data ?? []).map(mapIssuedDocumentFromDb),
        staffSettlements: (staffSettlementsResult.data ?? []).map(mapStaffSettlementFromDb),
        cashflows: (cashflowsResult.data ?? []).map(mapCashflowFromDb),
        cashflowOffsets: (cashflowOffsetsResult.data ?? []).map(mapCashflowOffsetFromDb),
        cashflowEvents: (cashflowEventsResult.data ?? []).map(mapCashflowEventFromDb),
        monthlyBalanceChecks: (monthlyBalanceChecksResult.data ?? []).map(mapMonthlyBalanceCheckFromDb),
        systemBackups: (systemBackupsResult.data ?? []).map(mapSystemBackupFromDb),
        contracts: (contractsResult.data ?? []).map(mapContractFromDb),
        approvals: (approvalsResult.data ?? []).map(mapApprovalFromDb),
        websiteInquiries: (inquiriesResult.data ?? []).map(mapWebsiteInquiryFromDb),
        antiqueLedgerDetails: (ledgerResult.data ?? []).map(mapAntiqueLedgerDetailFromDb),
        journalCandidateReviews: (journalReviewsResult.data ?? []).map(mapJournalCandidateReviewFromDb),
        journalExports: (journalExportsResult.data ?? []).map(mapJournalExportFromDb),
      });
      setProductionReadiness(normalizeProductionReadiness(readinessResult.data?.value, readinessResult.data?.updated_at));
    } catch (reason) {
      if (requestIsCurrent()) setLoadError(errorMessage(reason));
    } finally {
      if (requestIsCurrent()) setLoading(false);
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
      let cashflowEvents = current.cashflowEvents;
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
        const newlyProcessed = processedAmount - (linked?.processedAmount ?? 0);
        if (newlyProcessed > 0) {
          cashflowEvents = [{
            id: crypto.randomUUID(),
            cashflowId: cashflow.id,
            amount: newlyProcessed,
            method: input.paymentMethod,
            processedOn: cashflow.processedOn ?? now.slice(0, 10),
            createdAt: now,
          }, ...cashflowEvents];
        }
      }
      return {
        ...current,
        expenses: [expense, ...current.expenses.filter((item) => item.id !== expenseId)],
        cashflows,
        cashflowEvents,
      };
    });
  }, [configured, data.cashflows, data.expenses, refreshData]);

  const value = useMemo<AppDataContextValue>(() => ({
    data,
    isDemo: !configured,
    productionReadiness,
    inviteStaffProfile: async (input) => {
      if (profile?.role !== "owner" || !profile.isActive) {
        throw new Error("利用者を招待できるのは事業主だけです。");
      }
      const checked = validateStaffInvitationInput(input);
      if (configured && supabase) {
        const { error } = await supabase.functions.invoke("invite-staff-user", {
          body: checked,
        });
        if (error) {
          let message = "招待メールを送信できませんでした。";
          const context = "context" in error ? error.context : null;
          if (context instanceof Response) {
            try {
              const detail = await context.clone().json() as { error?: unknown };
              if (typeof detail.error === "string" && detail.error.trim()) message = detail.error;
            } catch {
              // 安全な固定文言を使用する。
            }
          }
          throw new Error(message);
        }
        await refreshData();
        return;
      }

      setData((current) => ({
        ...current,
        staffProfiles: [...current.staffProfiles, {
          id: crypto.randomUUID(),
          displayName: checked.displayName,
          role: checked.role,
          isActive: true,
        }],
      }));
    },
    updateStaffProfile: async (input) => {
      const checked = validateStaffProfileUpdate(profile, data.staffProfiles, input);
      if (configured && supabase) {
        const { error } = await supabase
          .from("staff_profiles")
          .update({
            display_name: checked.displayName,
            role: checked.role,
            is_active: checked.isActive,
            deactivated_at: checked.isActive ? null : new Date().toISOString(),
          })
          .eq("id", checked.staffId);
        if (error) throw new Error(error.message);
        if (checked.staffId === profile?.id) await refreshProfile();
        await refreshData();
        return;
      }

      setData((current) => ({
        ...current,
        staffProfiles: current.staffProfiles.map((staff) => staff.id === checked.staffId
          ? { ...staff, displayName: checked.displayName, role: checked.role, isActive: checked.isActive }
          : staff),
      }));
    },
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
    completeVehicleDisposition: async (input) => {
      const target = data.vehicles.find((vehicle) => vehicle.id === input.vehicleId);
      const validationError = validateVehicleDispositionCompletion(target, input);
      if (validationError) throw new Error(validationError);
      if (configured && supabase) {
        const { error } = await supabase.rpc("complete_vehicle_disposition", vehicleDispositionCompletionToRpc(input));
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }

      const now = new Date().toISOString();
      const expenseId = input.feeAmount > 0 ? crypto.randomUUID() : null;
      const incoming = input.proceedsAmount > 0 ? {
        id: crypto.randomUUID(), vehicleId: input.vehicleId, expenseId: null,
        direction: "入金" as const, kind: input.disposition === "オークション" ? "販売代金" as const : "その他" as const,
        description: `${input.disposition} ${input.counterparty.trim()}`,
        amount: input.proceedsAmount, processedAmount: 0, status: "未処理" as const,
        method: input.incomeMethod, scheduledOn: input.completedOn, processedOn: null, createdAt: now,
      } : null;
      const outgoing = expenseId ? {
        id: crypto.randomUUID(), vehicleId: input.vehicleId, expenseId,
        direction: "支払い" as const, kind: "経費支払い" as const,
        description: `${input.disposition === "オークション" ? "オークション手数料" : "廃車処分費"} ${input.counterparty.trim()}`,
        amount: input.feeAmount, processedAmount: 0, status: "未処理" as const,
        method: input.feePaymentMethod, scheduledOn: input.completedOn, processedOn: null, createdAt: now,
      } : null;

      setData((current) => {
        const currentDetail = current.antiqueLedgerDetails.find((item) => item.vehicleId === input.vehicleId);
        const ledgerDetail = {
          id: currentDetail?.id ?? crypto.randomUUID(),
          vehicleId: input.vehicleId,
          intakeType: currentDetail?.intakeType ?? "買受け" as const,
          receivedOnOverride: currentDetail?.receivedOnOverride ?? null,
          registrationNumber: currentDetail?.registrationNumber ?? "",
          registeredOwnerName: currentDetail?.registeredOwnerName ?? "",
          itemFeatures: currentDetail?.itemFeatures ?? "",
          counterpartyType: currentDetail?.counterpartyType ?? (target?.acquisitionSource === "一般のお客様" ? "個人" as const : target?.acquisitionSource === "オークション" ? "オークション" as const : "法人・業者" as const),
          sellerNameOverride: currentDetail?.sellerNameOverride ?? "",
          sellerAddress: currentDetail?.sellerAddress ?? "",
          sellerOccupation: currentDetail?.sellerOccupation ?? "",
          sellerAge: currentDetail?.sellerAge ?? null,
          identityVerificationMethod: currentDetail?.identityVerificationMethod ?? null,
          identityVerificationNote: currentDetail?.identityVerificationNote ?? "",
          disposalOnOverride: input.completedOn,
          disposalTypeOverride: input.disposition === "廃車" ? "廃車" as const : "売却" as const,
          buyerNameOverride: input.counterparty.trim(),
          note: currentDetail?.note ?? "",
          createdAt: currentDetail?.createdAt ?? now,
          updatedAt: now,
        };
        return {
          ...current,
          vehicles: current.vehicles.map((vehicle) => vehicle.id === input.vehicleId ? {
            ...vehicle,
            salePrice: input.proceedsAmount,
            status: input.disposition === "廃車" ? "廃車処分" as const : "納車済み" as const,
            deliveredAt: input.completedOn,
            updatedAt: now,
          } : vehicle),
          expenses: expenseId ? [{
            id: expenseId, vehicleId: input.vehicleId,
            category: input.disposition === "オークション" ? "販売手数料" : "外注費",
            description: `${input.counterparty.trim()} ${input.disposition === "オークション" ? "オークション手数料" : "廃車処分費"}`,
            amount: input.feeAmount, expenseStatus: "確定" as const, paymentStatus: "未払い" as const,
            paymentMethod: input.feePaymentMethod, incurredOn: input.completedOn, createdAt: now,
          }, ...current.expenses] : current.expenses,
          cashflows: [incoming, outgoing, ...current.cashflows].filter((item): item is NonNullable<typeof item> => Boolean(item)),
          antiqueLedgerDetails: [ledgerDetail, ...current.antiqueLedgerDetails.filter((item) => item.id !== ledgerDetail.id)],
        };
      });
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
      if (!isVehicleReceiptChecklistComplete(data.vehicleDocuments.filter((document) => document.vehicleId === vehicleId))) {
        throw new Error("受取確認をすべて「受取済み」または「不要」にしてください。");
      }
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
        setData((current) => {
          const nextVehicleDocuments = [
            ...current.vehicleDocuments.filter((item) => !(item.vehicleId === document.vehicleId && item.documentType === document.documentType)),
            document,
          ];
          return {
            ...current,
            vehicleDocuments: nextVehicleDocuments,
            vehicles: current.vehicles.map((vehicle) => vehicle.id === document.vehicleId
              ? { ...vehicle, documentsComplete: isVehicleReceiptChecklistComplete(nextVehicleDocuments.filter((item) => item.vehicleId === document.vehicleId)) }
              : vehicle),
          };
        });
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
        vehicles: current.vehicles.map((vehicle) => {
          if (vehicle.id !== document.vehicleId) return vehicle;
          const nextDocuments = [
            ...current.vehicleDocuments.filter((item) => !(item.vehicleId === document.vehicleId && item.documentType === document.documentType)),
            document,
          ].filter((item) => item.vehicleId === document.vehicleId);
          return { ...vehicle, documentsComplete: isVehicleReceiptChecklistComplete(nextDocuments) };
        }),
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
    uploadExpenseAttachment: async (expenseId, category, file) => {
      const expense = data.expenses.find((item) => item.id === expenseId);
      if (!expense) throw new Error("対象の経費が見つかりません。");
      const { mimeType, extension } = validateEvidenceFile(file);
      const attachmentId = crypto.randomUUID();
      const storagePath = buildExpenseEvidencePath(expenseId, attachmentId, extension);

      if (configured && supabase) {
        const { error: uploadError } = await supabase.storage
          .from(PRIVATE_BUCKET)
          .upload(storagePath, file, { contentType: mimeType, upsert: false });
        if (uploadError) throw new Error(`ファイルを保存できませんでした：${uploadError.message}`);

        const { data: inserted, error: metadataError } = await supabase
          .from("attachments")
          .insert({
            id: attachmentId,
            expense_id: expenseId,
            category,
            original_file_name: file.name.trim().slice(0, 255) || `証憑.${extension}`,
            storage_path: storagePath,
            mime_type: mimeType,
            byte_size: file.size,
          })
          .select("*")
          .single();
        if (metadataError) throw new Error(`添付情報を登録できませんでした：${metadataError.message}`);
        const attachment = mapAttachmentFromDb(inserted);
        setData((current) => ({ ...current, attachments: [attachment, ...current.attachments] }));
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      demoEvidenceUrls.set(attachmentId, objectUrl);
      const attachment: Attachment = {
        id: attachmentId,
        vehicleId: null,
        contractId: null,
        expenseId,
        category,
        originalFileName: file.name,
        storagePath: `demo:${attachmentId}`,
        mimeType,
        byteSize: file.size,
        createdAt: new Date().toISOString(),
      };
      setData((current) => ({ ...current, attachments: [attachment, ...current.attachments] }));
    },
    getAttachmentUrl: async (attachmentId) => {
      const attachment = data.attachments.find((item) => item.id === attachmentId);
      if (!attachment) throw new Error("対象の証憑が見つかりません。");
      if (configured && supabase) {
        const { data: signed, error } = await supabase.storage
          .from(PRIVATE_BUCKET)
          .createSignedUrl(attachment.storagePath, 60);
        if (error || !signed?.signedUrl) throw new Error(`証憑を開けませんでした：${error?.message ?? "URLを作成できませんでした。"}`);
        return signed.signedUrl;
      }
      const objectUrl = demoEvidenceUrls.get(attachmentId);
      if (!objectUrl) throw new Error("デモモードのファイル本体は画面を再読み込みすると消去されます。もう一度添付してください。");
      return objectUrl;
    },
    deleteAttachment: async (attachmentId) => {
      const attachment = data.attachments.find((item) => item.id === attachmentId);
      if (!attachment) throw new Error("対象の証憑が見つかりません。");
      if (configured && supabase) {
        const { error: metadataError } = await supabase.from("attachments").delete().eq("id", attachmentId);
        if (metadataError) throw new Error(`添付情報を削除できませんでした：${metadataError.message}`);
        const { error: storageError } = await supabase.storage.from(PRIVATE_BUCKET).remove([attachment.storagePath]);
        if (storageError) throw new Error(`添付情報は削除しましたが、ファイルの削除に失敗しました：${storageError.message}`);
      } else {
        const objectUrl = demoEvidenceUrls.get(attachmentId);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        demoEvidenceUrls.delete(attachmentId);
      }
      setData((current) => ({
        ...current,
        attachments: current.attachments.filter((item) => item.id !== attachmentId),
      }));
    },
    issueDocument: async (input) => {
      if (!input.contractId) throw new Error("販売契約を選択してください。");
      if (!input.issuedOn) throw new Error("発行日を入力してください。");
      if (input.issuedOn > new Date().toISOString().slice(0, 10)) throw new Error("発行日に未来の日付は指定できません。");
      if (input.stampDutyAmount < 0) throw new Error("印紙額は0円以上で入力してください。");
      if (input.note.length > 500) throw new Error("備考は500文字以内で入力してください。");
      const contract = data.contracts.find((item) => item.id === input.contractId);
      if (!contract || !canIssueDocument(data, contract, input.documentType)) {
        throw new Error(input.documentType === "R" ? "Rは販売代金の入金完了後に発行できます。" : "契約済みの販売契約を選択してください。");
      }

      if (configured && supabase) {
        const { data: saved, error } = await supabase.rpc("issue_sales_document", issueDocumentToRpc(input));
        if (error) throw new Error(error.message);
        const document = mapIssuedDocumentFromDb(Array.isArray(saved) ? saved[0] : saved);
        setData((current) => ({ ...current, issuedDocuments: [document, ...current.issuedDocuments] }));
        return document;
      }

      const vehicle = data.vehicles.find((item) => item.id === contract.vehicleId);
      if (!vehicle) throw new Error("対象車両が見つかりません。");
      const receipt = input.documentType === "R" ? findCompletedSaleReceipt(data, contract) : null;
      const document: IssuedDocument = {
        id: crypto.randomUUID(),
        documentType: input.documentType,
        documentNumber: nextDemoDocumentNumber(data.issuedDocuments, input.documentType, input.issuedOn),
        contractId: contract.id,
        vehicleId: vehicle.id,
        cashflowId: receipt?.id ?? null,
        customerName: contract.customerLabel,
        vehicleLabel: `${vehicle.managementNumber} ${vehicle.name}`,
        amount: contract.amount,
        showTaxBreakdown: input.showTaxBreakdown,
        taxAmount: input.showTaxBreakdown ? includedTaxAmount(contract.amount) : 0,
        deliveryMethod: input.deliveryMethod,
        stampDutyAmount: input.documentType === "R" && input.deliveryMethod === "紙" ? input.stampDutyAmount : 0,
        issuedOn: input.issuedOn,
        note: input.note.trim(),
        status: "有効",
        createdAt: new Date().toISOString(),
      };
      setData((current) => ({ ...current, issuedDocuments: [document, ...current.issuedDocuments] }));
      return document;
    },
    voidIssuedDocument: async (documentId) => {
      const target = data.issuedDocuments.find((document) => document.id === documentId);
      if (!target || target.status === "無効") throw new Error("対象の発行履歴が見つからないか、すでに無効です。");
      if (configured && supabase) {
        const { error } = await supabase.rpc("void_issued_document", { p_document_id: documentId });
        if (error) throw new Error(error.message);
      }
      setData((current) => ({
        ...current,
        issuedDocuments: current.issuedDocuments.map((document) => document.id === documentId ? { ...document, status: "無効" } : document),
      }));
    },
    saveStaffSettlement: async (input) => {
      const staff = data.staffProfiles.find((profile) => profile.id === input.staffId && profile.isActive && ["regular", "spot"].includes(profile.role));
      if (!staff) throw new Error("有効な通常スタッフまたはスポットスタッフを選択してください。");
      const vehicle = data.vehicles.find((item) => item.id === input.vehicleId);
      if (!vehicle) throw new Error("対象車両が見つかりません。");
      if (input.contractId && !data.contracts.some((contract) => contract.id === input.contractId && contract.vehicleId === input.vehicleId)) {
        throw new Error("対象車両に紐づく契約を選択してください。");
      }
      if (input.direction === "スタッフへ請求" && (!input.agreementConfirmed || !input.agreementNote.trim())) {
        throw new Error("スタッフへの請求は双方合意の確認と合意内容が必要です。");
      }
      const plannedAmount = calculateStaffPlannedAmount(input.calculationMethod, input.grossProfitBasis, input.ratePercent ?? 0, input.manualAmount);
      if (plannedAmount <= 0) throw new Error("予定額は1円以上になるよう入力してください。");

      if (configured && supabase) {
        const { data: saved, error } = await supabase.rpc("save_staff_settlement", staffSettlementToRpc(input));
        if (error) throw new Error(error.message);
        const settlement = mapStaffSettlementFromDb(Array.isArray(saved) ? saved[0] : saved);
        setData((current) => ({
          ...current,
          staffSettlements: [settlement, ...current.staffSettlements.filter((item) => item.id !== settlement.id)],
        }));
        return settlement;
      }

      const existing = input.settlementId ? data.staffSettlements.find((item) => item.id === input.settlementId) : null;
      if (existing && existing.status !== "予定") throw new Error("予定状態の精算だけ修正できます。");
      const now = new Date().toISOString();
      const settlement: StaffSettlement = {
        id: existing?.id ?? crypto.randomUUID(),
        staffId: input.staffId,
        vehicleId: input.vehicleId,
        contractId: input.contractId,
        direction: input.direction,
        engagementType: input.engagementType,
        businessType: input.businessType,
        calculationMethod: input.calculationMethod,
        grossProfitBasis: input.grossProfitBasis,
        ratePercent: input.calculationMethod === "粗利率" ? input.ratePercent : null,
        plannedAmount,
        confirmedAmount: null,
        paymentMethod: input.paymentMethod,
        status: "予定",
        agreementConfirmed: input.agreementConfirmed,
        agreementNote: input.agreementNote.trim(),
        note: input.note.trim(),
        confirmedAt: null,
        settledAt: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      setData((current) => ({ ...current, staffSettlements: [settlement, ...current.staffSettlements.filter((item) => item.id !== settlement.id)] }));
      return settlement;
    },
    confirmStaffSettlement: async (settlementId, confirmedAmount, confirmedOn) => {
      if (confirmedAmount <= 0) throw new Error("確定額は1円以上で入力してください。");
      if (!confirmedOn || confirmedOn > new Date().toISOString().slice(0, 10)) throw new Error("確定日は今日以前で入力してください。");
      const target = data.staffSettlements.find((item) => item.id === settlementId && item.status === "予定");
      if (!target) throw new Error("予定状態の精算が見つかりません。");
      if (configured && supabase) {
        const { error } = await supabase.rpc("confirm_staff_settlement", { p_settlement_id: settlementId, p_confirmed_amount: confirmedAmount, p_confirmed_on: confirmedOn });
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }
      const staffName = data.staffProfiles.find((profile) => profile.id === target.staffId)?.displayName ?? "スタッフ";
      const cashflowId = crypto.randomUUID();
      setData((current) => ({
        ...current,
        staffSettlements: current.staffSettlements.map((item) => item.id === settlementId ? { ...item, status: "確定", confirmedAmount, confirmedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item),
        cashflows: [{
          id: cashflowId, vehicleId: target.vehicleId, staffSettlementId: settlementId,
          direction: target.direction === "スタッフへ支給" ? "支払い" : "入金", kind: "その他",
          description: `${target.direction === "スタッフへ支給" ? "スタッフ紹介料・成果報酬" : "スタッフへの合意済み請求"} ${staffName}`,
          amount: confirmedAmount, processedAmount: 0, status: "未処理", method: target.paymentMethod,
          scheduledOn: confirmedOn, processedOn: null, createdAt: new Date().toISOString(),
        }, ...current.cashflows],
      }));
    },
    settleStaffSettlement: async (settlementId, settledOn) => {
      if (!settledOn || settledOn > new Date().toISOString().slice(0, 10)) throw new Error("精算日は今日以前で入力してください。");
      const target = data.staffSettlements.find((item) => item.id === settlementId && item.status === "確定");
      if (!target) throw new Error("確定済みの精算が見つかりません。");
      if (configured && supabase) {
        const { error } = await supabase.rpc("settle_staff_settlement", { p_settlement_id: settlementId, p_settled_on: settledOn });
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }
      setData((current) => ({
        ...current,
        staffSettlements: current.staffSettlements.map((item) => item.id === settlementId ? { ...item, status: "精算済み", settledAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item),
        cashflows: current.cashflows.map((cashflow) => cashflow.staffSettlementId === settlementId ? { ...cashflow, processedAmount: cashflow.amount, status: "完了", processedOn: settledOn } : cashflow),
      }));
    },
    cancelStaffSettlement: async (settlementId) => {
      const target = data.staffSettlements.find((item) => item.id === settlementId && ["予定", "確定"].includes(item.status));
      if (!target) throw new Error("予定または確定状態の精算が見つかりません。");
      if (configured && supabase) {
        const { error } = await supabase.rpc("cancel_staff_settlement", { p_settlement_id: settlementId });
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }
      setData((current) => ({
        ...current,
        staffSettlements: current.staffSettlements.map((item) => item.id === settlementId ? { ...item, status: "取消", updatedAt: new Date().toISOString() } : item),
        cashflows: current.cashflows.filter((cashflow) => cashflow.staffSettlementId !== settlementId),
      }));
    },
    saveSpotAssignment: async (input) => {
      const staff = data.staffProfiles.find((item) => item.id === input.staffId && item.role === "spot" && item.isActive);
      if (!staff) throw new Error("有効なスポットスタッフを選択してください。");
      const validationError = validateSpotAssignment(input);
      if (validationError) throw new Error(validationError);
      if (configured && supabase) {
        const { data: saved, error } = await supabase.rpc("save_spot_assignment", spotAssignmentToRpc(input));
        if (error) throw new Error(error.message);
        const assignment = mapSpotAssignmentFromDb(Array.isArray(saved) ? saved[0] : saved);
        setData((current) => ({ ...current, spotAssignments: [assignment, ...current.spotAssignments.filter((item) => item.id !== assignment.id)] }));
        return assignment;
      }
      const existing = input.assignmentId ? data.spotAssignments.find((item) => item.id === input.assignmentId) : null;
      if (existing && (existing.status !== "進行中" || existing.contractId)) throw new Error("契約作成前の進行中案件だけ修正できます。");
      const now = new Date().toISOString();
      const assignment: SpotAssignment = {
        id: existing?.id ?? crypto.randomUUID(), staffId: input.staffId, engagementType: input.engagementType,
        businessType: input.businessType, vehicleId: input.vehicleId, contractId: null,
        contractAmount: input.contractAmount,
        leadLabel: input.leadLabel.trim(), referralNote: input.referralNote.trim(), status: "進行中",
        createdAt: existing?.createdAt ?? now, updatedAt: now,
      };
      setData((current) => ({ ...current, spotAssignments: [assignment, ...current.spotAssignments.filter((item) => item.id !== assignment.id)] }));
      return assignment;
    },
    finishSpotAssignment: async (assignmentId, cancel) => {
      if (configured && supabase) {
        const { error } = await supabase.rpc("finish_spot_assignment", { p_assignment_id: assignmentId, p_cancel: cancel });
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }
      setData((current) => ({
        ...current,
        spotAssignments: current.spotAssignments.map((item) => item.id === assignmentId
          ? { ...item, status: cancel ? "取消" : "完了", updatedAt: new Date().toISOString() }
          : item),
      }));
    },
    saveSpotPurchaseContract: async (assignmentId, input) => {
      if (!configured || !supabase) throw new Error("共有データ接続時だけ専用契約を保存できます。");
      const { error } = await supabase.rpc("save_spot_purchase_contract", spotPurchaseContractToRpc(assignmentId, input));
      if (error) throw new Error(error.message);
      await refreshData();
    },
    saveSpotSaleContract: async (assignmentId, input) => {
      if (!configured || !supabase) throw new Error("共有データ接続時だけ専用契約を保存できます。");
      const { error } = await supabase.rpc("save_spot_sale_contract", spotSaleContractToRpc(assignmentId, input));
      if (error) throw new Error(error.message);
      await refreshData();
    },
    issueContractHandoff: async (assignmentId) => {
      if (!configured || !supabase) throw new Error("共有データ接続時だけ契約完了連携を発行できます。");
      const { data: issued, error } = await supabase.rpc("issue_contract_handoff", { p_assignment_id: assignmentId });
      if (error) throw new Error(error.message);
      const row = Array.isArray(issued) ? issued[0] : issued;
      const completionToken = String(row?.completion_token ?? "");
      const expiresAt = String(row?.expires_at ?? "");
      if (!/^[0-9a-f]{64}$/.test(completionToken) || !expiresAt) throw new Error("契約完了連携を発行できませんでした。");
      return { completionToken, expiresAt };
    },
    issueDirectContractHandoff: async (contractId) => {
      if (!configured || !supabase) throw new Error("共有データ接続時だけ契約完了連携を発行できます。");
      const { data: issued, error } = await supabase.rpc("issue_direct_contract_handoff", { p_contract_id: contractId });
      if (error) throw new Error(error.message);
      const row = Array.isArray(issued) ? issued[0] : issued;
      const completionToken = String(row?.completion_token ?? "");
      const expiresAt = String(row?.expires_at ?? "");
      if (!/^[0-9a-f]{64}$/.test(completionToken) || !expiresAt) throw new Error("契約完了連携を発行できませんでした。");
      return { completionToken, expiresAt };
    },
    retryContractHandoff: async (handoffId) => {
      if (!configured || !supabase || profile?.role !== "owner") throw new Error("事業主だけが契約連携を再試行できます。");
      const { data: result, error } = await supabase.rpc("retry_contract_handoff", { p_handoff_id: handoffId });
      if (error) throw new Error(error.message);
      await refreshData();
      const response = result as { success?: boolean; error_code?: string } | null;
      if (!response?.success) throw new Error("再試行しても反映できませんでした。表示された確認内容を直してから、もう一度お試しください。");
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

      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const cashflow = { ...input, kind: demoCashflowKind(input), id, createdAt };
      const event: CashflowEvent | null = input.processedAmount > 0 && input.processedOn ? {
        id: crypto.randomUUID(), cashflowId: id, amount: input.processedAmount,
        method: input.method, processedOn: input.processedOn, createdAt,
      } : null;
      setData((current) => ({
        ...current,
        cashflows: [cashflow, ...current.cashflows],
        cashflowEvents: event ? [event, ...current.cashflowEvents] : current.cashflowEvents,
      }));
    },
    completeCashflow: async (cashflowId, processedOn) => {
      if (!processedOn) throw new Error("処理日を入力してください。");
      if (processedOn > new Date().toISOString().slice(0, 10)) {
        throw new Error("処理日に未来の日付は指定できません。");
      }
      const cashflow = data.cashflows.find((item) => item.id === cashflowId);
      if (!cashflow) throw new Error("対象の入出金が見つかりません。");
      if (configured && supabase) {
        if (cashflow.staffSettlementId) {
          const { error } = await supabase.rpc("settle_staff_settlement", {
            p_settlement_id: cashflow.staffSettlementId,
            p_settled_on: processedOn,
          });
          if (error) throw new Error(error.message);
          await refreshData();
          return;
        }
        const { error } = await supabase.rpc("complete_cashflow", {
          p_cashflow_id: cashflowId,
          p_processed_on: processedOn,
        });
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }

      if (cashflow.kind === "買取代金") {
        const vehicle = data.vehicles.find((item) => item.id === cashflow.vehicleId);
        if (!vehicle) throw new Error("対象車両が見つかりません。");
        if (vehicle.status === "入庫予定") throw new Error("買取代金は車両の入庫後に支払ってください。");
      }
      const remaining = cashflow.amount - cashflow.processedAmount;
      const now = new Date().toISOString();
      setData((current) => ({
        ...current,
        cashflows: current.cashflows.map((item) => item.id === cashflowId
          ? { ...item, processedAmount: item.amount, status: "完了", processedOn }
          : item),
        cashflowEvents: remaining > 0 ? [{
          id: crypto.randomUUID(), cashflowId, amount: remaining,
          method: cashflow.method, processedOn, createdAt: now,
        }, ...current.cashflowEvents] : current.cashflowEvents,
        expenses: cashflow.expenseId
          ? current.expenses.map((expense) => expense.id === cashflow.expenseId ? { ...expense, paymentStatus: "支払済み" } : expense)
          : current.expenses,
        staffSettlements: cashflow.staffSettlementId
          ? current.staffSettlements.map((settlement) => settlement.id === cashflow.staffSettlementId
            ? { ...settlement, status: "精算済み", settledAt: now, updatedAt: now }
            : settlement)
          : current.staffSettlements,
      }));
    },
    applyCashflowOffset: async (saleCashflowId, purchaseCashflowId, amount, offsetOn, note) => {
      if (!offsetOn || offsetOn > new Date().toISOString().slice(0, 10)) throw new Error("相殺日は今日以前で入力してください。");
      if (!Number.isInteger(amount) || amount <= 0) throw new Error("相殺額は1円以上の整数で入力してください。");
      const sale = data.cashflows.find((item) => item.id === saleCashflowId && item.kind === "販売代金" && item.direction === "入金");
      const purchase = data.cashflows.find((item) => item.id === purchaseCashflowId && item.kind === "買取代金" && item.direction === "支払い");
      if (!sale || !purchase) throw new Error("対象の販売代金または買取代金が見つかりません。");
      const purchaseVehicle = data.vehicles.find((item) => item.id === purchase.vehicleId);
      if (!purchaseVehicle?.arrivedAt || purchaseVehicle.status === "入庫予定") throw new Error("買取車両の入庫を確定してから相殺してください。");
      const maximum = Math.min(sale.amount - sale.processedAmount, purchase.amount - purchase.processedAmount);
      if (amount > maximum) throw new Error("相殺額が販売代金または買取代金の残額を超えています。");
      if (configured && supabase) {
        const { data: saved, error } = await supabase.rpc("apply_cashflow_offset", {
          p_sale_cashflow_id: saleCashflowId,
          p_purchase_cashflow_id: purchaseCashflowId,
          p_amount: amount,
          p_offset_on: offsetOn,
          p_note: note.trim(),
        });
        if (error) throw new Error(error.message);
        await refreshData();
        return mapCashflowOffsetFromDb(Array.isArray(saved) ? saved[0] : saved);
      }
      const now = new Date().toISOString();
      const offset: CashflowOffset = {
        id: crypto.randomUUID(), saleCashflowId, purchaseCashflowId, amount, offsetOn,
        note: note.trim(), voidedAt: null, createdAt: now,
      };
      setData((current) => ({
        ...current,
        cashflowOffsets: [offset, ...current.cashflowOffsets],
        cashflows: current.cashflows.map((item) => {
          if (item.id !== saleCashflowId && item.id !== purchaseCashflowId) return item;
          const processedAmount = item.processedAmount + amount;
          return { ...item, processedAmount, status: processedAmount === item.amount ? "完了" : "一部", processedOn: offsetOn };
        }),
      }));
      return offset;
    },
    voidCashflowOffset: async (offsetId) => {
      if (profile?.role !== "owner") throw new Error("相殺の取消は事業主だけができます。");
      const target = data.cashflowOffsets.find((item) => item.id === offsetId && !item.voidedAt);
      if (!target) throw new Error("有効な相殺記録が見つかりません。");
      if (configured && supabase) {
        const { error } = await supabase.rpc("void_cashflow_offset", { p_offset_id: offsetId });
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }
      const now = new Date().toISOString();
      setData((current) => ({
        ...current,
        cashflowOffsets: current.cashflowOffsets.map((item) => item.id === offsetId ? { ...item, voidedAt: now } : item),
        cashflows: current.cashflows.map((item) => {
          if (item.id !== target.saleCashflowId && item.id !== target.purchaseCashflowId) return item;
          const processedAmount = Math.max(0, item.processedAmount - target.amount);
          return { ...item, processedAmount, status: processedAmount === 0 ? "未処理" : processedAmount === item.amount ? "完了" : "一部", processedOn: processedAmount === 0 ? null : item.processedOn };
        }),
      }));
    },
    saveMonthlyBalanceCheck: async (input) => {
      const canSave = profile?.role === "owner" || profile?.role === "accounting" || profile?.role === "regular";
      const canConfirm = profile?.role === "owner" || profile?.role === "accounting";
      if (!canSave) throw new Error("月次残高を保存する権限がありません。");
      if (input.confirm && !canConfirm) throw new Error("月次確定は事業主または経理担当だけができます。");
      const existing = data.monthlyBalanceChecks.find((item) => item.targetMonth === input.targetMonth);
      if (existing?.status === "確定") throw new Error("確定済みの月は変更できません。");
      const movement = calculateMonthlyMovement(data.cashflows, data.cashflowEvents, input.targetMonth);
      const calculated = calculateMonthlyBalance(input, movement);

      if (configured && supabase) {
        const { data: saved, error } = await supabase.rpc("save_monthly_balance_check", {
          p_target_month: `${input.targetMonth}-01`,
          p_opening_cash_balance: input.openingCashBalance,
          p_opening_bank_balance: input.openingBankBalance,
          p_actual_cash_balance: input.actualCashBalance,
          p_actual_bank_balance: input.actualBankBalance,
          p_note: input.note.trim(),
          p_confirm: input.confirm,
        });
        if (error) throw new Error(error.message);
        const result = mapMonthlyBalanceCheckFromDb(Array.isArray(saved) ? saved[0] : saved);
        await refreshData();
        return result;
      }

      const now = new Date().toISOString();
      const saved: MonthlyBalanceCheck = {
        id: existing?.id ?? crypto.randomUUID(),
        targetMonth: input.targetMonth,
        openingCashBalance: input.openingCashBalance,
        openingBankBalance: input.openingBankBalance,
        cashMovement: movement.cash,
        bankMovement: movement.bank,
        systemCashBalance: calculated.systemCashBalance,
        systemBankBalance: calculated.systemBankBalance,
        actualCashBalance: input.actualCashBalance,
        actualBankBalance: input.actualBankBalance,
        cashDifference: calculated.cashDifference,
        bankDifference: calculated.bankDifference,
        status: input.confirm ? "確定" : "確認中",
        note: input.note.trim(),
        confirmedAt: input.confirm ? now : null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      setData((current) => ({
        ...current,
        monthlyBalanceChecks: [saved, ...current.monthlyBalanceChecks.filter((item) => item.targetMonth !== input.targetMonth)],
      }));
      return saved;
    },
    createSystemBackup: async () => {
      if (profile?.role !== "owner" || !profile.isActive) throw new Error("バックアップを作成できるのは事業主だけです。");
      if (configured && supabase) {
        const { data: result, error } = await supabase.functions.invoke("manage-system-backup", {
          body: { action: "create" },
        });
        if (error) throw new Error(await functionErrorMessage(error, "バックアップを作成できませんでした。"));
        const backup = mapSystemBackupFromDb(result?.backup);
        await refreshData();
        return backup;
      }
      const now = new Date().toISOString();
      const backup: SystemBackup = {
        id: crypto.randomUUID(),
        kind: "手動",
        rowCount: Object.entries(data).filter(([key]) => key !== "systemBackups").reduce((sum, [, rows]) => sum + rows.length, 0),
        attachmentFileCount: 0,
        attachmentTotalBytes: 0,
        attachmentBackupStatus: data.attachments.length ? "metadata_only" : "none",
        driveFolderUrl: null,
        driveSavedAt: null,
        createdAt: now,
      };
      demoBackupPayloads.set(backup.id, structuredClone({ ...data, systemBackups: [] }));
      setData((current) => ({ ...current, systemBackups: [backup, ...current.systemBackups] }));
      return backup;
    },
    downloadSystemBackup: async (backupId) => {
      if (profile?.role !== "owner" || !profile.isActive) throw new Error("バックアップを取得できるのは事業主だけです。");
      if (configured && supabase) {
        const { data: row, error } = await supabase
          .from("system_backups")
          .select("id, backup_kind, row_count, attachment_file_count, attachment_total_bytes, attachment_backup_status, created_at, payload")
          .eq("id", backupId)
          .single();
        if (error) throw new Error(error.message);
        return new Blob([JSON.stringify({
          format: "order-auto-system-backup",
          version: 1,
          id: row.id,
          createdAt: row.created_at,
          rowCount: row.row_count,
          attachmentFileCount: row.attachment_file_count,
          attachmentTotalBytes: row.attachment_total_bytes,
          attachmentBackupStatus: row.attachment_backup_status,
          attachmentFiles: "Supabaseの非公開バックアップ領域に保管",
          payload: row.payload,
        }, null, 2)], { type: "application/json" });
      }
      const payload = demoBackupPayloads.get(backupId);
      const backup = data.systemBackups.find((item) => item.id === backupId);
      if (!payload || !backup) throw new Error("バックアップが見つかりません。");
      return new Blob([JSON.stringify({ format: "order-auto-system-backup", version: 1, ...backup, payload }, null, 2)], { type: "application/json" });
    },
    saveSystemBackupToDrive: async (backupId, googleAccessToken) => {
      if (profile?.role !== "owner" || !profile.isActive) throw new Error("Google Driveへ保存できるのは事業主だけです。");
      if (!configured || !supabase) throw new Error("テストモードではGoogle Driveへ保存できません。");
      const { data: result, error } = await supabase.functions.invoke("manage-system-backup", {
        body: { action: "save_to_drive", backupId, googleAccessToken },
      });
      if (error) throw new Error(await functionErrorMessage(error, "Google Driveへ保存できませんでした。"));
      const folderUrl = typeof result?.folderUrl === "string" ? result.folderUrl : "";
      if (!folderUrl) throw new Error("Google Driveの保存先を確認できませんでした。");
      await refreshData();
      return { folderUrl };
    },
    restoreSystemBackup: async (backupId, mode) => {
      if (profile?.role !== "owner" || !profile.isActive) throw new Error("復元できるのは事業主だけです。");
      if (configured && supabase) {
        const { error } = await supabase.functions.invoke("manage-system-backup", {
          body: {
            action: "restore",
            backupId,
            mode: mode === "全上書き" ? "replace" : "merge",
          },
        });
        if (error) throw new Error(await functionErrorMessage(error, "バックアップを復元できませんでした。"));
        await refreshData();
        return;
      }
      const payload = demoBackupPayloads.get(backupId);
      if (!payload) throw new Error("バックアップが見つかりません。");
      setData((current) => mode === "全上書き"
        ? { ...structuredClone(payload), systemBackups: current.systemBackups }
        : mergeDemoBackup(current, payload));
    },
    deleteSystemBackup: async (backupId) => {
      if (profile?.role !== "owner" || !profile.isActive) throw new Error("バックアップを削除できるのは事業主だけです。");
      if (configured && supabase) {
        const { error } = await supabase.functions.invoke("manage-system-backup", {
          body: { action: "delete", backupId },
        });
        if (error) throw new Error(await functionErrorMessage(error, "バックアップを削除できませんでした。"));
        await refreshData();
        return;
      }
      demoBackupPayloads.delete(backupId);
      setData((current) => ({ ...current, systemBackups: current.systemBackups.filter((item) => item.id !== backupId) }));
    },
    saveProductionReadinessCheck: async (checkKey, status, note) => {
      if (profile?.role !== "owner" || !profile.isActive) throw new Error("本番前チェックを変更できるのは事業主だけです。");
      if (note.length > 1000) throw new Error("確認メモは1000文字以内で入力してください。");
      if (configured && supabase) {
        const { error } = await supabase.rpc("save_production_readiness_check", {
          p_check_key: checkKey,
          p_status: statusToDb(status),
          p_note: note.trim(),
        });
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }
      const now = new Date().toISOString();
      setProductionReadiness((current) => ({
        ...current,
        checks: { ...current.checks, [checkKey]: { status, note: note.trim(), checkedAt: status === "未確認" ? null : now } },
        approvedAt: null,
        approvedBy: null,
        updatedAt: now,
      }));
    },
    setProductionApproved: async (approved) => {
      if (profile?.role !== "owner" || !profile.isActive) throw new Error("本番利用を承認できるのは事業主だけです。");
      if (configured && supabase) {
        const { error } = await supabase.rpc("set_production_readiness_approval", { p_approved: approved });
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }
      const now = new Date().toISOString();
      const allConfirmed = Object.values(productionReadiness.checks).filter((check) => check.status === "確認済み").length === 14;
      if (approved && !allConfirmed) throw new Error("すべての確認項目を確認済みにしてから承認してください。");
      setProductionReadiness((current) => ({ ...current, approvedAt: approved ? now : null, approvedBy: approved ? profile.id : null, updatedAt: now }));
    },
    savePurchaseContract: async (input) => {
      if (configured && supabase) {
        const { data: savedId, error } = await supabase.rpc("save_purchase_contract", purchaseContractToRpc(input));
        if (error) throw new Error(error.message);
        await refreshData();
        return String(savedId);
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
          disposition: "未定",
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
      return contractId;
    },
    saveSaleContract: async (input) => {
      if (configured && supabase) {
        const { data: savedId, error } = await supabase.rpc("save_sale_contract", saleContractToRpc(input));
        if (error) throw new Error(error.message);
        await refreshData();
        return String(savedId);
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
      return contractId;
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
    saveJournalCandidateReview: async (input) => {
      if (!input.debitAccount.trim() || !input.creditAccount.trim()) {
        throw new Error("借方科目と貸方科目を入力してください。");
      }
      if (input.amount <= 0) throw new Error("金額は1円以上で入力してください。");
      if (input.reviewStatus === "確認済み" && input.taxTreatment === "未確認") {
        throw new Error("確認済みにする前に税区分を選択してください。");
      }
      if (configured && supabase) {
        const { error } = await supabase.rpc("save_journal_candidate_review", journalCandidateReviewToRpc(input));
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }
      const existing = data.journalCandidateReviews.find((item) => item.sourceKey === input.sourceKey);
      const now = new Date().toISOString();
      const saved = {
        ...input,
        id: existing?.id ?? crypto.randomUUID(),
        reviewedAt: input.reviewStatus === "確認済み" ? now : null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      setData((current) => ({
        ...current,
        journalCandidateReviews: [
          saved,
          ...current.journalCandidateReviews.filter((item) => item.sourceKey !== input.sourceKey),
        ],
      }));
    },
    recordJournalExport: async (targetMonth, rowCount) => {
      if (!/^\d{4}-\d{2}$/.test(targetMonth)) throw new Error("対象月が不正です。");
      if (rowCount <= 0) throw new Error("出力対象がありません。");
      if (configured && supabase) {
        const { error } = await supabase.rpc("record_journal_export", {
          p_target_month: `${targetMonth}-01`,
          p_row_count: rowCount,
        });
        if (error) throw new Error(error.message);
        await refreshData();
        return;
      }
      setData((current) => ({
        ...current,
        journalExports: [{
          id: crypto.randomUUID(),
          targetMonth,
          rowCount,
          createdAt: new Date().toISOString(),
        }, ...current.journalExports],
      }));
    },
    resetDemoData: () => {
      if (!configured) {
        setData(cloneSeedData());
        setProductionReadiness(emptyProductionReadiness());
      }
    },
    refreshData,
  }), [configured, data, persistExpense, productionReadiness, profile, refreshData, refreshProfile, session?.user.id]);

  if (loading) return <SystemLoading message="共有データを読み込んでいます" />;
  if (loadError) return (
    <DataLoadError
      message={loadError}
      onRetry={() => void refreshData()}
      onLogout={() => void signOut()}
      onUseTestMode={isTestLoginEnabled ? testSignIn : undefined}
    />
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export const useAppData = () => {
  const value = useContext(AppDataContext);
  if (!value) throw new Error("useAppData must be used within AppDataProvider");
  return value;
};
