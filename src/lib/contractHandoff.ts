import type { PaymentMethod } from "../types";

export const CONTRACT_HANDOFF_PREFIX = "orderAutoContractHandoff:";
export const CONTRACT_HANDOFF_TTL_MS = 10 * 60 * 1000;

export type ContractHandoffTarget = "sale" | "purchase";

export type SaleContractHandoff = {
  assignmentId: string;
  completionToken: string;
  customerName: string;
  contractDate: string;
  vehicleName: string;
  chassisNumber: string;
  managementNumber: string;
  amount: number;
  paymentMethod: PaymentMethod;
};

export type PurchaseContractHandoff = {
  assignmentId: string;
  completionToken: string;
  customerName: string;
  contractDate: string;
  vehicleName: string;
  chassisNumber: string;
  amount: number;
  plannedArrivalDate: string;
  storageLocation: string;
  paymentMethod: PaymentMethod;
};

type HandoffPayload = SaleContractHandoff | PurchaseContractHandoff;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

type HandoffEnvelope = {
  version: 1;
  target: ContractHandoffTarget;
  createdAt: string;
  expiresAt: string;
  payload: HandoffPayload;
};

const contractAppUrl: Record<ContractHandoffTarget, string> = {
  sale: "https://atsushisora.github.io/hanbai-keiyakusho/contract-create.html",
  purchase: "https://atsushisora.github.io/kaitori-contract/contract.html",
};

export function getContractAppUrl(target: ContractHandoffTarget) {
  return contractAppUrl[target];
}

function removeExpiredHandoffs(storage: StorageLike, now: number) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key?.startsWith(CONTRACT_HANDOFF_PREFIX)));

  keys.forEach((key) => {
    try {
      const value = JSON.parse(storage.getItem(key) ?? "null") as Partial<HandoffEnvelope> | null;
      if (!value?.expiresAt || Date.parse(value.expiresAt) <= now) storage.removeItem(key);
    } catch {
      storage.removeItem(key);
    }
  });
}

export function createContractHandoff(
  storage: StorageLike,
  target: ContractHandoffTarget,
  payload: HandoffPayload,
  options: { now?: number; token?: string } = {},
) {
  const now = options.now ?? Date.now();
  const token = options.token ?? crypto.randomUUID();
  removeExpiredHandoffs(storage, now);

  const envelope: HandoffEnvelope = {
    version: 1,
    target,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CONTRACT_HANDOFF_TTL_MS).toISOString(),
    payload,
  };
  const storageKey = `${CONTRACT_HANDOFF_PREFIX}${token}`;
  storage.setItem(storageKey, JSON.stringify(envelope));

  const url = new URL(contractAppUrl[target]);
  url.searchParams.set("handoff", token);
  if (target === "purchase") url.hash = "create";
  return { url: url.toString(), expiresAt: envelope.expiresAt, storageKey };
}

export function isSameOriginContractHandoff(currentOrigin: string, targetUrl: string) {
  return new URL(targetUrl).origin === currentOrigin;
}

export function mapSalePaymentMethod(method: PaymentMethod) {
  if (method === "振込") return "銀行振込";
  if (method === "ローン会社") return "ローン";
  if (method === "現金") return "現金";
  return "その他";
}
