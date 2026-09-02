import type {
  AcquisitionSource,
  AntiqueLedgerDetail,
  Approval,
  Cashflow,
  CashflowDirection,
  CashflowKind,
  CashflowStatus,
  Contract,
  ContractStatus,
  Expense,
  ExpenseStatus,
  NewCashflowInput,
  NewExpenseInput,
  NewVehicleInput,
  PaymentMethod,
  PaymentStatus,
  PurchaseContractInput,
  SaleContractInput,
  SaveAntiqueLedgerDetailInput,
  SaveExpenseInput,
  Vehicle,
  VehicleInspectionImportInput,
  VehiclePublicationInput,
  VehicleDocument,
  VehicleDocumentInput,
  VehicleDocumentType,
  VehicleStatus,
  WebsiteInquiry,
  WebsiteInquiryStatus,
} from "../types";

type DbRow = Record<string, unknown>;

const vehicleStatusToDb: Record<VehicleStatus, string> = {
  入庫予定: "planned_arrival",
  入庫済み: "arrived",
  販売中: "for_sale",
  売約済み: "reserved",
  納車済み: "delivered",
  廃車処分: "scrapped",
};
const vehicleStatusFromDb = Object.fromEntries(
  Object.entries(vehicleStatusToDb).map(([label, value]) => [value, label]),
) as Record<string, VehicleStatus>;

const acquisitionSourceToDb: Record<AcquisitionSource, string> = {
  "一般のお客様": "customer",
  オークション: "auction",
  業者: "dealer",
  保険関係: "insurance",
};
const acquisitionSourceFromDb = Object.fromEntries(
  Object.entries(acquisitionSourceToDb).map(([label, value]) => [value, label]),
) as Record<string, AcquisitionSource>;

const vehicleDocumentTypeToDb: Record<VehicleDocumentType, string> = {
  車検証: "vehicle_inspection_certificate",
  譲渡証明書: "transfer_certificate",
  印鑑証明: "seal_registration_certificate",
  住民票: "residence_certificate",
  申請依頼書: "application_request_form",
  自賠責保険: "compulsory_automobile_liability_insurance",
  その他: "other",
};
const vehicleDocumentTypeFromDb = Object.fromEntries(
  Object.entries(vehicleDocumentTypeToDb).map(([label, value]) => [value, label]),
) as Record<string, VehicleDocumentType>;

const expenseStatusToDb: Record<ExpenseStatus, string> = { 予定: "planned", 確定: "confirmed" };
const expenseStatusFromDb: Record<string, ExpenseStatus> = { planned: "予定", confirmed: "確定" };
const paymentStatusToDb: Record<PaymentStatus, string> = { 未払い: "unpaid", 支払済み: "paid" };
const paymentStatusFromDb: Record<string, PaymentStatus> = { unpaid: "未払い", paid: "支払済み" };
const directionToDb: Record<CashflowDirection, string> = { 入金: "incoming", 支払い: "outgoing" };
const directionFromDb: Record<string, CashflowDirection> = { incoming: "入金", outgoing: "支払い" };
const cashflowStatusToDb: Record<CashflowStatus, string> = {
  未処理: "unprocessed",
  一部: "partial",
  完了: "completed",
};
const cashflowStatusFromDb: Record<string, CashflowStatus> = {
  unprocessed: "未処理",
  partial: "一部",
  completed: "完了",
};
const cashflowKindToDb: Record<CashflowKind, string> = {
  買取代金: "purchase_payment",
  販売代金: "sale_receipt",
  経費支払い: "expense_payment",
  返金: "refund",
  その他: "other",
};
const cashflowKindFromDb = Object.fromEntries(
  Object.entries(cashflowKindToDb).map(([label, value]) => [value, label]),
) as Record<string, CashflowKind>;
const paymentMethodToDb: Record<PaymentMethod, string> = {
  現金: "cash",
  振込: "bank_transfer",
  ローン会社: "loan_company",
  カード: "card",
  その他: "other",
};
const paymentMethodFromDb = Object.fromEntries(
  Object.entries(paymentMethodToDb).map(([label, value]) => [value, label]),
) as Record<string, PaymentMethod>;
const contractStatusFromDb: Record<string, ContractStatus> = {
  draft: "下書き",
  awaiting_signature: "署名待ち",
  contracted: "契約済み",
  cancelled: "キャンセル済み",
};
const contractStatusToDb: Record<ContractStatus, string> = {
  下書き: "draft",
  署名待ち: "awaiting_signature",
  契約済み: "contracted",
  キャンセル済み: "cancelled",
};
const approvalStatusFromDb: Record<string, Approval["status"]> = {
  pending: "承認待ち",
  approved: "承認",
  rejected: "却下",
};
const soldDisplayModeFromDb: Record<string, Vehicle["soldDisplayMode"]> = {
  show_sold: "売約済み表示",
  hidden: "非表示",
};
const soldDisplayModeToDb: Record<Vehicle["soldDisplayMode"], string> = {
  売約済み表示: "show_sold",
  非表示: "hidden",
};
const inquirySourceFromDb: Record<string, WebsiteInquiry["source"]> = {
  sales_site: "販売サイト",
  scrap_site: "廃車サイト",
};
const inquiryStatusFromDb: Record<string, WebsiteInquiryStatus> = {
  new: "新着",
  in_progress: "対応中",
  completed: "完了",
};
const inquiryStatusToDb: Record<WebsiteInquiryStatus, string> = {
  新着: "new",
  対応中: "in_progress",
  完了: "completed",
};
const ledgerIntakeTypeFromDb: Record<string, AntiqueLedgerDetail["intakeType"]> = {
  purchase: "買受け",
  consignment: "委託",
};
const ledgerIntakeTypeToDb: Record<AntiqueLedgerDetail["intakeType"], string> = {
  買受け: "purchase",
  委託: "consignment",
};
const ledgerCounterpartyTypeFromDb: Record<string, AntiqueLedgerDetail["counterpartyType"]> = {
  individual: "個人",
  business: "法人・業者",
  auction: "オークション",
};
const ledgerCounterpartyTypeToDb: Record<AntiqueLedgerDetail["counterpartyType"], string> = {
  個人: "individual",
  "法人・業者": "business",
  オークション: "auction",
};
const identityMethodFromDb: Record<string, NonNullable<AntiqueLedgerDetail["identityVerificationMethod"]>> = {
  drivers_license: "運転免許証",
  my_number_card: "マイナンバーカード",
  residence_card: "在留カード",
  seal_certificate: "印鑑証明書等",
  antique_dealer_license: "古物商許可証",
  auction_record: "オークション会場の取引記録",
  other: "その他",
};
const identityMethodToDb: Record<NonNullable<AntiqueLedgerDetail["identityVerificationMethod"]>, string> = {
  運転免許証: "drivers_license",
  マイナンバーカード: "my_number_card",
  在留カード: "residence_card",
  印鑑証明書等: "seal_certificate",
  古物商許可証: "antique_dealer_license",
  オークション会場の取引記録: "auction_record",
  その他: "other",
};
const dispositionTypeFromDb: Record<string, NonNullable<AntiqueLedgerDetail["disposalTypeOverride"]>> = {
  sale: "売却",
  consigned_delivery: "委託引渡し",
  return: "返還",
  scrap: "廃車",
};
const dispositionTypeToDb: Record<NonNullable<AntiqueLedgerDetail["disposalTypeOverride"]>, string> = {
  売却: "sale",
  委託引渡し: "consigned_delivery",
  返還: "return",
  廃車: "scrap",
};

const stringValue = (row: DbRow, key: string) => String(row[key] ?? "");
const nullableString = (row: DbRow, key: string) => (row[key] == null ? null : String(row[key]));
const numberValue = (row: DbRow, key: string) => Number(row[key] ?? 0);

export const mapVehicleFromDb = (source: unknown): Vehicle => {
  const row = source as DbRow;
  return {
    id: stringValue(row, "id"),
    managementNumber: stringValue(row, "management_number"),
    name: stringValue(row, "name"),
    chassisNumber: stringValue(row, "chassis_number"),
    status: vehicleStatusFromDb[stringValue(row, "status")] ?? "入庫予定",
    acquisitionSource: acquisitionSourceFromDb[stringValue(row, "acquisition_source")] ?? "一般のお客様",
    purchasePrice: numberValue(row, "purchase_price"),
    askingPrice: numberValue(row, "asking_price"),
    salePrice: row.sale_price == null ? null : numberValue(row, "sale_price"),
    storageLocation: stringValue(row, "storage_location"),
    plannedArrivalDate: stringValue(row, "planned_arrival_date"),
    arrivedAt: nullableString(row, "arrived_at"),
    deliveredAt: nullableString(row, "delivered_at"),
    documentsComplete: Boolean(row.documents_complete),
    salesSitePublished: Boolean(row.sales_site_published),
    soldDisplayMode: soldDisplayModeFromDb[stringValue(row, "sold_display_mode")] ?? "売約済み表示",
    publicMaker: stringValue(row, "public_maker"),
    publicGrade: stringValue(row, "public_grade"),
    publicYear: stringValue(row, "public_year"),
    publicMileage: stringValue(row, "public_mileage"),
    publicColor: stringValue(row, "public_color"),
    publicInspection: stringValue(row, "public_inspection"),
    publicPrice: numberValue(row, "public_price"),
    publicDescription: stringValue(row, "public_description"),
    publicImageUrl: stringValue(row, "public_image_url"),
    createdAt: stringValue(row, "created_at"),
    updatedAt: stringValue(row, "updated_at"),
  };
};

export const vehiclePublicationToRpc = (input: VehiclePublicationInput) => ({
  p_vehicle_id: input.vehicleId,
  p_sales_site_published: input.salesSitePublished,
  p_sold_display_mode: soldDisplayModeToDb[input.soldDisplayMode],
  p_public_maker: input.publicMaker.trim(),
  p_public_grade: input.publicGrade.trim(),
  p_public_year: input.publicYear.trim(),
  p_public_mileage: input.publicMileage.trim(),
  p_public_color: input.publicColor.trim(),
  p_public_inspection: input.publicInspection.trim(),
  p_public_price: input.publicPrice,
  p_public_description: input.publicDescription.trim(),
  p_public_image_url: input.publicImageUrl.trim(),
});

export const vehicleInspectionImportToRpc = (input: VehicleInspectionImportInput) => ({
  p_vehicle_id: input.vehicleId,
  p_vehicle_name: input.vehicleName.trim() || null,
  p_chassis_number: input.chassisNumber.trim() || null,
  p_registration_number: input.registrationNumber.trim() || null,
  p_registered_owner_name: input.registeredOwnerName.trim() || null,
});

export const mapWebsiteInquiryFromDb = (source: unknown): WebsiteInquiry => {
  const row = source as DbRow;
  return {
    id: stringValue(row, "id"),
    source: inquirySourceFromDb[stringValue(row, "source")] ?? "廃車サイト",
    customerName: stringValue(row, "customer_name"),
    email: stringValue(row, "email"),
    phone: stringValue(row, "phone"),
    message: stringValue(row, "message"),
    interestedVehicleId: nullableString(row, "interested_vehicle_id"),
    status: inquiryStatusFromDb[stringValue(row, "status")] ?? "新着",
    receivedAt: stringValue(row, "received_at"),
  };
};

export const websiteInquiryStatusToRpc = (inquiryId: string, status: WebsiteInquiryStatus) => ({
  p_inquiry_id: inquiryId,
  p_status: inquiryStatusToDb[status],
});

export const mapAntiqueLedgerDetailFromDb = (source: unknown): AntiqueLedgerDetail => {
  const row = source as DbRow;
  const identityMethod = nullableString(row, "identity_verification_method");
  const disposalType = nullableString(row, "disposal_type_override");
  return {
    id: stringValue(row, "id"),
    vehicleId: stringValue(row, "vehicle_id"),
    intakeType: ledgerIntakeTypeFromDb[stringValue(row, "intake_type")] ?? "買受け",
    receivedOnOverride: nullableString(row, "received_on_override"),
    registrationNumber: stringValue(row, "registration_number"),
    registeredOwnerName: stringValue(row, "registered_owner_name"),
    itemFeatures: stringValue(row, "item_features"),
    counterpartyType: ledgerCounterpartyTypeFromDb[stringValue(row, "counterparty_type")] ?? "個人",
    sellerNameOverride: stringValue(row, "seller_name_override"),
    sellerAddress: stringValue(row, "seller_address"),
    sellerOccupation: stringValue(row, "seller_occupation"),
    sellerAge: row.seller_age == null ? null : numberValue(row, "seller_age"),
    identityVerificationMethod: identityMethod ? identityMethodFromDb[identityMethod] ?? null : null,
    identityVerificationNote: stringValue(row, "identity_verification_note"),
    disposalOnOverride: nullableString(row, "disposal_on_override"),
    disposalTypeOverride: disposalType ? dispositionTypeFromDb[disposalType] ?? null : null,
    buyerNameOverride: stringValue(row, "buyer_name_override"),
    note: stringValue(row, "note"),
    createdAt: stringValue(row, "created_at"),
    updatedAt: stringValue(row, "updated_at"),
  };
};

export const antiqueLedgerDetailToDb = (input: SaveAntiqueLedgerDetailInput) => ({
  vehicle_id: input.vehicleId,
  intake_type: ledgerIntakeTypeToDb[input.intakeType],
  received_on_override: input.receivedOnOverride || null,
  registration_number: input.registrationNumber.trim(),
  registered_owner_name: input.registeredOwnerName.trim(),
  item_features: input.itemFeatures.trim(),
  counterparty_type: ledgerCounterpartyTypeToDb[input.counterpartyType],
  seller_name_override: input.sellerNameOverride.trim(),
  seller_address: input.sellerAddress.trim(),
  seller_occupation: input.sellerOccupation.trim(),
  seller_age: input.counterpartyType === "個人" ? input.sellerAge : null,
  identity_verification_method: input.identityVerificationMethod
    ? identityMethodToDb[input.identityVerificationMethod]
    : null,
  identity_verification_note: input.identityVerificationNote.trim(),
  disposal_on_override: input.disposalOnOverride || null,
  disposal_type_override: input.disposalTypeOverride
    ? dispositionTypeToDb[input.disposalTypeOverride]
    : null,
  buyer_name_override: input.buyerNameOverride.trim(),
  note: input.note.trim(),
});

export const newVehicleToDb = (input: NewVehicleInput) => ({
  name: input.name,
  chassis_number: input.chassisNumber || null,
  status: vehicleStatusToDb[input.status],
  acquisition_source: acquisitionSourceToDb[input.acquisitionSource],
  purchase_price: input.purchasePrice,
  asking_price: input.askingPrice,
  storage_location: input.storageLocation,
  planned_arrival_date: input.plannedArrivalDate,
  arrived_at: input.status === "入庫予定" ? null : new Date().toISOString().slice(0, 10),
});

export const vehiclePatchToDb = (patch: Partial<Vehicle>) => {
  const result: DbRow = {};
  if (patch.name !== undefined) result.name = patch.name;
  if (patch.chassisNumber !== undefined) result.chassis_number = patch.chassisNumber || null;
  if (patch.status !== undefined) result.status = vehicleStatusToDb[patch.status];
  if (patch.acquisitionSource !== undefined) result.acquisition_source = acquisitionSourceToDb[patch.acquisitionSource];
  if (patch.purchasePrice !== undefined) result.purchase_price = patch.purchasePrice;
  if (patch.askingPrice !== undefined) result.asking_price = patch.askingPrice;
  if (patch.salePrice !== undefined) result.sale_price = patch.salePrice;
  if (patch.storageLocation !== undefined) result.storage_location = patch.storageLocation;
  if (patch.plannedArrivalDate !== undefined) result.planned_arrival_date = patch.plannedArrivalDate;
  if (patch.arrivedAt !== undefined) result.arrived_at = patch.arrivedAt;
  if (patch.deliveredAt !== undefined) result.delivered_at = patch.deliveredAt;
  if (patch.documentsComplete !== undefined) result.documents_complete = patch.documentsComplete;
  return result;
};

export const mapVehicleDocumentFromDb = (source: unknown): VehicleDocument => {
  const row = source as DbRow;
  return {
    id: stringValue(row, "id"),
    vehicleId: stringValue(row, "vehicle_id"),
    documentType: vehicleDocumentTypeFromDb[stringValue(row, "document_type")] ?? "その他",
    isRequired: Boolean(row.is_required),
    isReceived: Boolean(row.is_received),
    receivedAt: nullableString(row, "received_at"),
    note: stringValue(row, "note"),
    createdAt: stringValue(row, "created_at"),
    updatedAt: stringValue(row, "updated_at"),
  };
};

export const vehicleDocumentToDb = (input: VehicleDocumentInput) => ({
  vehicle_id: input.vehicleId,
  document_type: vehicleDocumentTypeToDb[input.documentType],
  is_required: input.isRequired,
  is_received: input.isReceived,
  received_at: input.isReceived ? (input.receivedAt ?? new Date().toISOString().slice(0, 10)) : null,
  note: input.note.trim() || null,
});

export const mapExpenseFromDb = (source: unknown): Expense => {
  const row = source as DbRow;
  return {
    id: stringValue(row, "id"),
    vehicleId: nullableString(row, "vehicle_id"),
    category: stringValue(row, "category"),
    description: stringValue(row, "description"),
    amount: numberValue(row, "amount"),
    expenseStatus: expenseStatusFromDb[stringValue(row, "expense_status")] ?? "確定",
    paymentStatus: paymentStatusFromDb[stringValue(row, "payment_status")] ?? "未払い",
    paymentMethod: paymentMethodFromDb[stringValue(row, "payment_method")] ?? "振込",
    incurredOn: stringValue(row, "incurred_on"),
    createdAt: stringValue(row, "created_at"),
  };
};

export const newExpenseToDb = (input: NewExpenseInput) => ({
  vehicle_id: input.vehicleId,
  category: input.category,
  description: input.description,
  amount: input.amount,
  expense_status: expenseStatusToDb[input.expenseStatus],
  payment_status: paymentStatusToDb[input.paymentStatus],
  payment_method: paymentMethodToDb[input.paymentMethod],
  incurred_on: input.incurredOn,
});

export const expenseToRpc = (input: SaveExpenseInput) => ({
  p_expense_id: input.expenseId,
  p_vehicle_id: input.vehicleId,
  p_category: input.category.trim(),
  p_description: input.description.trim(),
  p_amount: input.amount,
  p_expense_status: expenseStatusToDb[input.expenseStatus],
  p_payment_status: paymentStatusToDb[input.paymentStatus],
  p_payment_method: paymentMethodToDb[input.paymentMethod],
  p_incurred_on: input.incurredOn,
});

const inferCashflowKind = (input: NewCashflowInput): CashflowKind => {
  if (input.kind) return input.kind;
  if (input.direction === "支払い" && input.description.includes("買取")) return "買取代金";
  if (input.direction === "入金" && input.description.includes("販売")) return "販売代金";
  if (input.direction === "支払い" && input.description.includes("経費")) return "経費支払い";
  if (input.description.includes("返金")) return "返金";
  return "その他";
};

export const mapCashflowFromDb = (source: unknown): Cashflow => {
  const row = source as DbRow;
  return {
    id: stringValue(row, "id"),
    vehicleId: nullableString(row, "vehicle_id"),
    expenseId: nullableString(row, "source_expense_id"),
    direction: directionFromDb[stringValue(row, "direction")] ?? "入金",
    kind: cashflowKindFromDb[stringValue(row, "kind")] ?? "その他",
    description: stringValue(row, "description"),
    amount: numberValue(row, "amount"),
    processedAmount: numberValue(row, "processed_amount"),
    status: cashflowStatusFromDb[stringValue(row, "status")] ?? "未処理",
    method: paymentMethodFromDb[stringValue(row, "method")] ?? "その他",
    scheduledOn: stringValue(row, "scheduled_on"),
    processedOn: nullableString(row, "processed_on"),
    createdAt: stringValue(row, "created_at"),
  };
};

export const newCashflowToDb = (input: NewCashflowInput) => ({
  vehicle_id: input.vehicleId,
  direction: directionToDb[input.direction],
  kind: cashflowKindToDb[inferCashflowKind(input)],
  description: input.description,
  amount: input.amount,
  processed_amount: input.processedAmount,
  status: cashflowStatusToDb[input.status],
  method: paymentMethodToDb[input.method],
  scheduled_on: input.scheduledOn,
  processed_on: input.processedOn,
});

export const mapContractFromDb = (source: unknown): Contract => {
  const row = source as DbRow;
  return {
    id: stringValue(row, "id"),
    type: stringValue(row, "type") === "sale" ? "販売" : "買取",
    vehicleId: nullableString(row, "vehicle_id"),
    customerLabel: stringValue(row, "customer_label"),
    amount: numberValue(row, "amount"),
    status: contractStatusFromDb[stringValue(row, "status")] ?? "下書き",
    contractedOn: stringValue(row, "contracted_on"),
    vehicleName: stringValue(row, "vehicle_name"),
    chassisNumber: stringValue(row, "chassis_number"),
    acquisitionSource: acquisitionSourceFromDb[stringValue(row, "acquisition_source")],
    askingPrice: numberValue(row, "asking_price"),
    storageLocation: stringValue(row, "storage_location"),
    plannedArrivalDate: stringValue(row, "planned_arrival_date"),
    paymentMethod: paymentMethodFromDb[stringValue(row, "purchase_payment_method")],
    salePaymentMethod: paymentMethodFromDb[stringValue(row, "sale_payment_method")],
    updatedAt: stringValue(row, "updated_at"),
  };
};

export const purchaseContractToRpc = (input: PurchaseContractInput) => ({
  p_contract_id: input.contractId,
  p_customer_label: input.customerLabel.trim(),
  p_amount: input.amount,
  p_status: contractStatusToDb[input.status],
  p_contracted_on: input.contractedOn,
  p_vehicle_name: input.vehicleName.trim(),
  p_chassis_number: input.chassisNumber.trim() || null,
  p_acquisition_source: acquisitionSourceToDb[input.acquisitionSource],
  p_asking_price: input.askingPrice,
  p_storage_location: input.storageLocation.trim(),
  p_planned_arrival_date: input.plannedArrivalDate,
  p_payment_method: paymentMethodToDb[input.paymentMethod],
});

export const saleContractToRpc = (input: SaleContractInput) => ({
  p_contract_id: input.contractId,
  p_vehicle_id: input.vehicleId,
  p_customer_label: input.customerLabel.trim(),
  p_amount: input.amount,
  p_status: contractStatusToDb[input.status],
  p_contracted_on: input.contractedOn,
  p_payment_method: paymentMethodToDb[input.paymentMethod],
});

export const mapApprovalFromDb = (source: unknown): Approval => {
  const row = source as DbRow;
  return {
    id: stringValue(row, "id"),
    vehicleId: stringValue(row, "vehicle_id"),
    title: stringValue(row, "title"),
    requestedBy: "スタッフ",
    status: approvalStatusFromDb[stringValue(row, "status")] ?? "承認待ち",
  };
};
