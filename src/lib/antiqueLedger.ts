import type {
  AntiqueLedgerDetail,
  AntiqueLedgerEntry,
  AppData,
  Contract,
  LedgerCounterpartyType,
  LedgerDispositionType,
  Vehicle,
} from "../types";

const emptyDetail = (vehicle: Vehicle): AntiqueLedgerDetail => ({
  id: `ledger-${vehicle.id}`,
  vehicleId: vehicle.id,
  intakeType: "買受け",
  receivedOnOverride: null,
  registrationNumber: "",
  registeredOwnerName: "",
  itemFeatures: "",
  counterpartyType: defaultCounterpartyType(vehicle),
  sellerNameOverride: "",
  sellerAddress: "",
  sellerOccupation: "",
  sellerAge: null,
  identityVerificationMethod: null,
  identityVerificationNote: "",
  disposalOnOverride: null,
  disposalTypeOverride: null,
  buyerNameOverride: "",
  note: "",
  createdAt: vehicle.createdAt,
  updatedAt: vehicle.updatedAt,
});

const defaultCounterpartyType = (vehicle: Vehicle): LedgerCounterpartyType => {
  if (vehicle.acquisitionSource === "オークション") return "オークション";
  if (vehicle.acquisitionSource === "業者" || vehicle.acquisitionSource === "保険関係") {
    return "法人・業者";
  }
  return "個人";
};

const latestContract = (contracts: Contract[], vehicleId: string, type: Contract["type"]) =>
  contracts
    .filter((contract) =>
      contract.vehicleId === vehicleId &&
      contract.type === type &&
      contract.status !== "キャンセル済み",
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

const inferredDisposition = (
  vehicle: Vehicle,
  detail: AntiqueLedgerDetail,
): LedgerDispositionType | "保有中" => {
  if (detail.disposalTypeOverride) return detail.disposalTypeOverride;
  if (vehicle.status === "廃車処分") return "廃車";
  if (vehicle.status === "納車済み") return "売却";
  return "保有中";
};

const missingItemsFor = (entry: Omit<AntiqueLedgerEntry, "status" | "missingItems">): string[] => {
  const missing: string[] = [];
  const detail = entry.detail;

  if (!entry.receivedOn) missing.push("受入年月日");
  if (!detail.registrationNumber.trim()) missing.push("登録番号・車両番号");
  if (!entry.chassisNumber.trim()) missing.push("車台番号");
  if (!detail.registeredOwnerName.trim()) missing.push("車検証上の所有者");
  if (!entry.sellerName.trim()) missing.push("受入相手方の氏名・名称");
  if (!detail.sellerAddress.trim()) missing.push("受入相手方の住所");
  if (!detail.sellerOccupation.trim()) missing.push("受入相手方の職業");
  if (detail.counterpartyType === "個人" && detail.sellerAge == null) missing.push("受入相手方の年齢");
  if (!detail.identityVerificationMethod) missing.push("本人確認方法");
  if (detail.identityVerificationMethod === "その他" && !detail.identityVerificationNote.trim()) {
    missing.push("本人確認方法の詳細");
  }
  if (entry.dispositionType !== "保有中" && !entry.disposedOn) missing.push("払出年月日");

  return missing;
};

export const buildAntiqueLedgerEntries = (
  data: Pick<AppData, "vehicles" | "contracts" | "antiqueLedgerDetails">,
): AntiqueLedgerEntry[] =>
  data.vehicles
    .map((vehicle) => {
      const detail = data.antiqueLedgerDetails.find((item) => item.vehicleId === vehicle.id) ?? emptyDetail(vehicle);
      const purchaseContract = latestContract(data.contracts, vehicle.id, "買取");
      const saleContract = latestContract(data.contracts, vehicle.id, "販売");
      const dispositionType = inferredDisposition(vehicle, detail);
      const disposedOn = detail.disposalOnOverride || vehicle.deliveredAt;
      const base = {
        vehicleId: vehicle.id,
        managementNumber: vehicle.managementNumber,
        itemName: vehicle.name,
        chassisNumber: vehicle.chassisNumber,
        acquisitionSource: vehicle.acquisitionSource,
        purchaseAmount: vehicle.purchasePrice,
        receivedOn: detail.receivedOnOverride || vehicle.arrivedAt,
        sellerName: detail.sellerNameOverride.trim() || purchaseContract?.customerLabel || "",
        disposedOn,
        dispositionType,
        saleAmount: vehicle.salePrice,
        buyerName: detail.buyerNameOverride.trim() || saleContract?.customerLabel || "",
        detail,
      } satisfies Omit<AntiqueLedgerEntry, "status" | "missingItems">;
      const missingItems = missingItemsFor(base);
      const status = !base.receivedOn ? "入庫待ち" : missingItems.length > 0 ? "要確認" : "記録済み";

      return { ...base, status, missingItems } satisfies AntiqueLedgerEntry;
    })
    .sort((left, right) => {
      const leftDate = left.receivedOn ?? "9999-12-31";
      const rightDate = right.receivedOn ?? "9999-12-31";
      return rightDate.localeCompare(leftDate) || right.managementNumber.localeCompare(left.managementNumber);
    });

export const describeVehicleFeatures = (entry: AntiqueLedgerEntry): string => {
  const parts = [
    `登録番号・車両番号：${entry.detail.registrationNumber || "未登録"}`,
    `車名：${entry.itemName}`,
    `車台番号：${entry.chassisNumber || "未登録"}`,
    `所有者：${entry.detail.registeredOwnerName || "未登録"}`,
  ];
  if (entry.detail.itemFeatures.trim()) parts.push(entry.detail.itemFeatures.trim());
  return parts.join(" / ");
};

