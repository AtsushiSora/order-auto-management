export type PageId =
  | "dashboard"
  | "vehicles"
  | "purchase-contracts"
  | "sales-contracts"
  | "expenses"
  | "payments"
  | "profits"
  | "site-integration"
  | "antique-ledger"
  | "accounting"
  | "issued-documents"
  | "staff-settlements"
  | "contract-handoffs"
  | "spot-workspace"
  | "production-readiness"
  | "settings";

export type StaffRole = "owner" | "accounting" | "regular" | "spot";

export type StaffProfile = {
  id: string;
  displayName: string;
  role: StaffRole;
  isActive: boolean;
};

export type UpdateStaffProfileInput = {
  staffId: string;
  displayName: string;
  role: StaffRole;
  isActive: boolean;
};

export type InviteStaffProfileInput = {
  email: string;
  displayName: string;
  role: Exclude<StaffRole, "owner">;
};

export type StaffSettlementDirection = "スタッフへ支給" | "スタッフへ請求";
export type StaffEngagementType = "紹介のみ" | "契約から全て担当";
export type StaffBusinessType = "販売" | "買取・オークション" | "廃車";
export type StaffCalculationMethod = "固定額" | "粗利率" | "手入力";
export type StaffSettlementStatus = "予定" | "確定" | "精算済み" | "取消";

export type StaffSettlement = {
  id: string;
  staffId: string;
  vehicleId: string;
  contractId: string | null;
  direction: StaffSettlementDirection;
  engagementType: StaffEngagementType;
  businessType: StaffBusinessType;
  calculationMethod: StaffCalculationMethod;
  grossProfitBasis: number;
  ratePercent: number | null;
  plannedAmount: number;
  confirmedAmount: number | null;
  paymentMethod: PaymentMethod;
  status: StaffSettlementStatus;
  agreementConfirmed: boolean;
  agreementNote: string;
  note: string;
  confirmedAt: string | null;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveStaffSettlementInput = Omit<
  StaffSettlement,
  "id" | "plannedAmount" | "confirmedAmount" | "status" | "confirmedAt" | "settledAt" | "createdAt" | "updatedAt"
> & { settlementId: string | null; manualAmount: number };

export type SpotAssignmentStatus = "進行中" | "完了" | "取消";

export type SpotAssignment = {
  id: string;
  staffId: string;
  engagementType: StaffEngagementType;
  businessType: StaffBusinessType;
  vehicleId: string | null;
  contractId: string | null;
  leadLabel: string;
  referralNote: string;
  status: SpotAssignmentStatus;
  createdAt: string;
  updatedAt: string;
};

export type ContractHandoffStatus = "連携待ち" | "完了" | "無効";
export type ContractHandoffErrorCode =
  | "expired"
  | "assignment_unavailable"
  | "contract_unavailable"
  | "vehicle_not_available"
  | "unexpected_error";

export type ContractHandoff = {
  id: string;
  assignmentId: string | null;
  contractId: string;
  contractType: "買取" | "販売";
  status: ContractHandoffStatus;
  externalContractId: string | null;
  issuedBy: string;
  issuedAt: string;
  expiresAt: string;
  completedAt: string | null;
  failureCount: number;
  lastErrorCode: ContractHandoffErrorCode | null;
  lastErrorAt: string | null;
  lastAttemptedAt: string | null;
};

export type SaveSpotAssignmentInput = Omit<SpotAssignment, "id" | "contractId" | "status" | "createdAt" | "updatedAt"> & {
  assignmentId: string | null;
};

export type VehicleStatus =
  | "入庫予定"
  | "入庫済み"
  | "販売中"
  | "売約済み"
  | "納車済み"
  | "廃車処分";

export type AcquisitionSource =
  | "一般のお客様"
  | "オークション"
  | "業者"
  | "保険関係";

export type SoldDisplayMode = "売約済み表示" | "非表示";

export type Vehicle = {
  id: string;
  managementNumber: string;
  name: string;
  chassisNumber: string;
  status: VehicleStatus;
  acquisitionSource: AcquisitionSource;
  purchasePrice: number;
  askingPrice: number;
  salePrice: number | null;
  storageLocation: string;
  plannedArrivalDate: string;
  arrivedAt: string | null;
  deliveredAt: string | null;
  documentsComplete: boolean;
  salesSitePublished: boolean;
  soldDisplayMode: SoldDisplayMode;
  publicMaker: string;
  publicGrade: string;
  publicYear: string;
  publicMileage: string;
  publicColor: string;
  publicInspection: string;
  publicPrice: number;
  publicDescription: string;
  publicImageUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type VehicleDocumentType =
  | "車検証"
  | "譲渡証明書"
  | "印鑑証明"
  | "住民票"
  | "申請依頼書"
  | "自賠責保険"
  | "その他";

export type VehicleDocument = {
  id: string;
  vehicleId: string;
  documentType: VehicleDocumentType;
  isRequired: boolean;
  isReceived: boolean;
  receivedAt: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseStatus = "予定" | "確定";
export type PaymentStatus = "未払い" | "支払済み";

export type Expense = {
  id: string;
  vehicleId: string | null;
  category: string;
  description: string;
  amount: number;
  expenseStatus: ExpenseStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  incurredOn: string;
  createdAt: string;
};

export type AttachmentCategory =
  | "領収書"
  | "請求書"
  | "オークション計算書"
  | "振込明細"
  | "その他";

export type Attachment = {
  id: string;
  vehicleId: string | null;
  contractId: string | null;
  expenseId: string | null;
  category: AttachmentCategory;
  originalFileName: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
};

export type IssuedDocumentType = "S" | "R";
export type IssuedDocumentDelivery = "電子・PDF" | "紙";
export type IssuedDocumentStatus = "有効" | "無効";

export type IssuedDocument = {
  id: string;
  documentType: IssuedDocumentType;
  documentNumber: string;
  contractId: string;
  vehicleId: string;
  cashflowId: string | null;
  customerName: string;
  vehicleLabel: string;
  amount: number;
  showTaxBreakdown: boolean;
  taxAmount: number;
  deliveryMethod: IssuedDocumentDelivery;
  stampDutyAmount: number;
  issuedOn: string;
  note: string;
  status: IssuedDocumentStatus;
  createdAt: string;
};

export type IssueDocumentInput = {
  contractId: string;
  documentType: IssuedDocumentType;
  issuedOn: string;
  deliveryMethod: IssuedDocumentDelivery;
  showTaxBreakdown: boolean;
  stampDutyAmount: number;
  note: string;
};

export type CashflowDirection = "入金" | "支払い";
export type CashflowStatus = "未処理" | "一部" | "完了";
export type CashflowKind = "買取代金" | "販売代金" | "経費支払い" | "返金" | "その他";
export type PaymentMethod = "現金" | "振込" | "ローン会社" | "カード" | "その他";

export type Cashflow = {
  id: string;
  vehicleId: string | null;
  expenseId?: string | null;
  staffSettlementId?: string | null;
  direction: CashflowDirection;
  kind: CashflowKind;
  description: string;
  amount: number;
  processedAmount: number;
  status: CashflowStatus;
  method: PaymentMethod;
  scheduledOn: string;
  processedOn: string | null;
  createdAt: string;
};

export type CashflowOffset = {
  id: string;
  saleCashflowId: string;
  purchaseCashflowId: string;
  amount: number;
  offsetOn: string;
  note: string;
  voidedAt: string | null;
  createdAt: string;
};

export type CashflowEvent = {
  id: string;
  cashflowId: string;
  amount: number;
  method: PaymentMethod;
  processedOn: string;
  createdAt: string;
};

export type MonthlyBalanceStatus = "確認中" | "確定";

export type MonthlyBalanceCheck = {
  id: string;
  targetMonth: string;
  openingCashBalance: number;
  openingBankBalance: number;
  cashMovement: number;
  bankMovement: number;
  systemCashBalance: number;
  systemBankBalance: number;
  actualCashBalance: number;
  actualBankBalance: number;
  cashDifference: number;
  bankDifference: number;
  status: MonthlyBalanceStatus;
  note: string;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveMonthlyBalanceCheckInput = {
  targetMonth: string;
  openingCashBalance: number;
  openingBankBalance: number;
  actualCashBalance: number;
  actualBankBalance: number;
  note: string;
  confirm: boolean;
};

export type SystemBackupKind = "手動";
export type BackupRestoreMode = "追加" | "全上書き";
export type AttachmentBackupStatus = "metadata_only" | "none" | "complete" | "partial" | "failed";

export type SystemBackup = {
  id: string;
  kind: SystemBackupKind;
  rowCount: number;
  attachmentFileCount: number;
  attachmentTotalBytes: number;
  attachmentBackupStatus: AttachmentBackupStatus;
  driveFolderUrl: string | null;
  driveSavedAt: string | null;
  createdAt: string;
};

export type ReadinessCheckStatus = "未確認" | "確認済み" | "要修正";
export type ProductionReadinessCheckKey =
  | "purchase_standard"
  | "purchase_zero"
  | "sale_delivery"
  | "trade_in"
  | "auction_scrap"
  | "cashflow"
  | "expenses_profit"
  | "antique_ledger"
  | "documents_accounting"
  | "staff_settlement"
  | "permissions"
  | "contract_site_links"
  | "real_devices"
  | "backup_restore";

export type ProductionReadinessCheck = {
  status: ReadinessCheckStatus;
  note: string;
  checkedAt: string | null;
};

export type ProductionReadiness = {
  checks: Partial<Record<ProductionReadinessCheckKey, ProductionReadinessCheck>>;
  approvedAt: string | null;
  approvedBy: string | null;
  updatedAt: string | null;
};

export type ContractStatus = "下書き" | "署名待ち" | "契約済み" | "キャンセル済み";

export type Contract = {
  id: string;
  type: "買取" | "販売";
  vehicleId: string | null;
  customerLabel: string;
  amount: number;
  status: ContractStatus;
  contractedOn: string;
  vehicleName?: string;
  chassisNumber?: string;
  acquisitionSource?: AcquisitionSource;
  askingPrice?: number;
  storageLocation?: string;
  plannedArrivalDate?: string;
  paymentMethod?: PaymentMethod;
  salePaymentMethod?: PaymentMethod;
  updatedAt: string;
};

export type Approval = {
  id: string;
  vehicleId: string;
  title: string;
  requestedBy: string;
  status: "承認待ち" | "承認" | "却下";
};

export type WebsiteInquiryStatus = "新着" | "対応中" | "完了";

export type WebsiteInquiry = {
  id: string;
  source: "販売サイト" | "廃車サイト";
  customerName: string;
  email: string;
  phone: string;
  message: string;
  interestedVehicleId: string | null;
  status: WebsiteInquiryStatus;
  receivedAt: string;
};

export type LedgerIntakeType = "買受け" | "委託";
export type LedgerCounterpartyType = "個人" | "法人・業者" | "オークション";
export type IdentityVerificationMethod =
  | "運転免許証"
  | "マイナンバーカード"
  | "在留カード"
  | "印鑑証明書等"
  | "古物商許可証"
  | "オークション会場の取引記録"
  | "その他";
export type LedgerDispositionType = "売却" | "委託引渡し" | "返還" | "廃車";
export type AntiqueLedgerStatus = "入庫待ち" | "要確認" | "記録済み";

/**
 * 車両・契約からは取得できない古物台帳の補足情報だけを保存する。
 * 取引日、車名、車台番号、金額、取引先名は既存データから自動連携する。
 */
export type AntiqueLedgerDetail = {
  id: string;
  vehicleId: string;
  intakeType: LedgerIntakeType;
  receivedOnOverride: string | null;
  registrationNumber: string;
  registeredOwnerName: string;
  itemFeatures: string;
  counterpartyType: LedgerCounterpartyType;
  sellerNameOverride: string;
  sellerAddress: string;
  sellerOccupation: string;
  sellerAge: number | null;
  identityVerificationMethod: IdentityVerificationMethod | null;
  identityVerificationNote: string;
  disposalOnOverride: string | null;
  disposalTypeOverride: LedgerDispositionType | null;
  buyerNameOverride: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type SaveAntiqueLedgerDetailInput = Omit<
  AntiqueLedgerDetail,
  "id" | "createdAt" | "updatedAt"
>;

export type VehicleInspectionSourceType = "公式アプリJSON" | "公式アプリCSV" | "QRコード";

/** 車検証から読み取った確認前のデータ。rawSourceは保存せず、画面内の解析だけに使う。 */
export type VehicleInspectionData = {
  vehicleName: string;
  chassisNumber: string;
  registrationNumber: string;
  registeredOwnerName: string;
  firstRegistration: string;
  inspectionExpiry: string;
  modelType: string;
  rawSource: string;
  sourceType: VehicleInspectionSourceType;
};

export type VehicleInspectionImportInput = Pick<
  VehicleInspectionData,
  "vehicleName" | "chassisNumber" | "registrationNumber" | "registeredOwnerName"
> & {
  vehicleId: string;
};

export type AntiqueLedgerEntry = {
  vehicleId: string;
  managementNumber: string;
  itemName: string;
  chassisNumber: string;
  acquisitionSource: AcquisitionSource;
  purchaseAmount: number;
  receivedOn: string | null;
  sellerName: string;
  disposedOn: string | null;
  dispositionType: LedgerDispositionType | "保有中";
  saleAmount: number | null;
  buyerName: string;
  status: AntiqueLedgerStatus;
  missingItems: string[];
  detail: AntiqueLedgerDetail;
};

export type AppData = {
  staffProfiles: StaffProfile[];
  spotAssignments: SpotAssignment[];
  contractHandoffs: ContractHandoff[];
  vehicles: Vehicle[];
  vehicleDocuments: VehicleDocument[];
  expenses: Expense[];
  attachments: Attachment[];
  issuedDocuments: IssuedDocument[];
  staffSettlements: StaffSettlement[];
  cashflows: Cashflow[];
  cashflowOffsets: CashflowOffset[];
  cashflowEvents: CashflowEvent[];
  monthlyBalanceChecks: MonthlyBalanceCheck[];
  systemBackups: SystemBackup[];
  contracts: Contract[];
  approvals: Approval[];
  websiteInquiries: WebsiteInquiry[];
  antiqueLedgerDetails: AntiqueLedgerDetail[];
  journalCandidateReviews: JournalCandidateReview[];
  journalExports: JournalExport[];
};

export type TaxTreatment =
  | "未確認"
  | "課税10%"
  | "課税8%"
  | "非課税"
  | "免税"
  | "対象外";

export type JournalReviewStatus = "確認待ち" | "確認済み";
export type JournalCandidateStatus = JournalReviewStatus | "税区分未確認" | "再確認";

export type JournalCandidateReview = {
  id: string;
  sourceKey: string;
  candidateDate: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  taxTreatment: TaxTreatment;
  reviewStatus: JournalReviewStatus;
  sourceFingerprint: string;
  note: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JournalCandidateSourceType = "買取" | "販売" | "経費" | "入金" | "支払い";

export type JournalCandidate = {
  sourceKey: string;
  sourceType: JournalCandidateSourceType;
  candidateDate: string;
  description: string;
  vehicleLabel: string;
  amount: number;
  suggestedDebitAccount: string;
  suggestedCreditAccount: string;
  sourceFingerprint: string;
  debitAccount: string;
  creditAccount: string;
  taxTreatment: TaxTreatment;
  reviewStatus: JournalReviewStatus;
  status: JournalCandidateStatus;
  note: string;
  reviewedAt: string | null;
};

export type SaveJournalCandidateReviewInput = Pick<
  JournalCandidateReview,
  | "sourceKey"
  | "candidateDate"
  | "description"
  | "debitAccount"
  | "creditAccount"
  | "amount"
  | "taxTreatment"
  | "reviewStatus"
  | "sourceFingerprint"
  | "note"
>;

export type JournalExport = {
  id: string;
  targetMonth: string;
  rowCount: number;
  createdAt: string;
};

export type VehicleDocumentInput = Omit<VehicleDocument, "id" | "createdAt" | "updatedAt">;

export type NewVehicleInput = Pick<
  Vehicle,
  | "name"
  | "chassisNumber"
  | "status"
  | "acquisitionSource"
  | "purchasePrice"
  | "askingPrice"
  | "storageLocation"
  | "plannedArrivalDate"
>;

export type VehiclePublicationInput = Pick<
  Vehicle,
  | "salesSitePublished"
  | "soldDisplayMode"
  | "publicMaker"
  | "publicGrade"
  | "publicYear"
  | "publicMileage"
  | "publicColor"
  | "publicInspection"
  | "publicPrice"
  | "publicDescription"
  | "publicImageUrl"
> & { vehicleId: string };

export type NewExpenseInput = Omit<Expense, "id" | "createdAt">;
export type SaveExpenseInput = NewExpenseInput & { expenseId: string | null };
export type NewCashflowInput = Omit<Cashflow, "id" | "createdAt" | "kind"> & { kind?: CashflowKind };

export type PurchaseContractInput = {
  contractId: string | null;
  customerLabel: string;
  amount: number;
  status: Exclude<ContractStatus, "キャンセル済み">;
  contractedOn: string;
  vehicleName: string;
  chassisNumber: string;
  acquisitionSource: AcquisitionSource;
  askingPrice: number;
  storageLocation: string;
  plannedArrivalDate: string;
  paymentMethod: PaymentMethod;
};

export type SaleContractInput = {
  contractId: string | null;
  vehicleId: string;
  customerLabel: string;
  amount: number;
  status: Exclude<ContractStatus, "キャンセル済み">;
  contractedOn: string;
  paymentMethod: PaymentMethod;
};

export const staffRoleLabels: Record<StaffRole, string> = {
  owner: "事業主",
  accounting: "経理",
  regular: "通常スタッフ",
  spot: "スポットスタッフ",
};
