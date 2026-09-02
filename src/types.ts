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
  | "settings";

export type StaffRole = "owner" | "accounting" | "regular" | "spot";

export type StaffProfile = {
  id: string;
  displayName: string;
  role: StaffRole;
  isActive: boolean;
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

export type CashflowDirection = "入金" | "支払い";
export type CashflowStatus = "未処理" | "一部" | "完了";
export type CashflowKind = "買取代金" | "販売代金" | "経費支払い" | "返金" | "その他";
export type PaymentMethod = "現金" | "振込" | "ローン会社" | "カード" | "その他";

export type Cashflow = {
  id: string;
  vehicleId: string | null;
  expenseId?: string | null;
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

export type AppData = {
  vehicles: Vehicle[];
  vehicleDocuments: VehicleDocument[];
  expenses: Expense[];
  cashflows: Cashflow[];
  contracts: Contract[];
  approvals: Approval[];
  websiteInquiries: WebsiteInquiry[];
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
