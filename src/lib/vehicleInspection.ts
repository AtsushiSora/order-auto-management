import type { Vehicle, VehicleInspectionData, VehicleInspectionSourceType } from "../types";

type FlatRecord = Map<string, string>;

const emptyInspection = (
  sourceType: VehicleInspectionSourceType,
  rawSource: string,
): VehicleInspectionData => ({
  vehicleName: "",
  chassisNumber: "",
  registrationNumber: "",
  registeredOwnerName: "",
  firstRegistration: "",
  inspectionExpiry: "",
  modelType: "",
  rawSource,
  sourceType,
});

const normalizeKey = (value: string) => value
  .normalize("NFKC")
  .replace(/[\s_＿()（）［］\[\]・:：／/.-]/g, "")
  .toLowerCase();

const flattenJson = (value: unknown, result = new Map<string, string>(), path = ""): FlatRecord => {
  if (value == null) return result;
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenJson(item, result, `${path}${index}`));
    return result;
  }
  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (typeof item === "string" || typeof item === "number") {
        const text = String(item).trim();
        if (text) {
          result.set(normalizeKey(key), text);
          result.set(normalizeKey(nextPath), text);
        }
      } else {
        flattenJson(item, result, nextPath);
      }
    });
  }
  return result;
};

const pick = (record: FlatRecord, aliases: string[]) => {
  for (const alias of aliases) {
    const normalized = normalizeKey(alias);
    const exact = record.get(normalized);
    if (exact) return exact;
  }
  for (const alias of aliases) {
    const normalized = normalizeKey(alias);
    const found = [...record.entries()].find(([key]) => key.endsWith(normalized));
    if (found?.[1]) return found[1];
  }
  return "";
};

const fromRecord = (
  record: FlatRecord,
  sourceType: VehicleInspectionSourceType,
  rawSource: string,
): VehicleInspectionData => ({
  ...emptyInspection(sourceType, rawSource),
  registrationNumber: pick(record, [
    "自動車登録番号又は車両番号",
    "自動車登録番号",
    "車両番号",
    "登録番号",
  ]),
  chassisNumber: pick(record, ["車台番号", "車体番号"]),
  vehicleName: pick(record, ["車名", "メーカー名"]),
  registeredOwnerName: pick(record, [
    "所有者の氏名又は名称_所有者氏名（高水準文字含む）",
    "所有者の氏名又は名称_所有者氏名（低水準文字）",
    "所有者の氏名又は名称",
    "所有者氏名",
    "所有者名称",
  ]),
  firstRegistration: pick(record, ["初度登録年月", "初度検査年月"]),
  inspectionExpiry: pick(record, ["有効期間の満了する日", "有効期間満了日", "車検満了日"]),
  modelType: pick(record, ["型式"]),
});

export const parseCsvRows = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
};

const csvToRecord = (text: string): FlatRecord => {
  const rows = parseCsvRows(text);
  const record = new Map<string, string>();
  if (rows.length < 2) return record;
  const headers = rows[0];
  const data = rows.find((row, index) => index > 0 && row.some((value) => value.trim()));
  if (!data) return record;
  headers.forEach((header, index) => {
    const value = (data[index] ?? "").trim();
    if (header.trim() && value) record.set(normalizeKey(header), value);
  });
  return record;
};

export const parseOfficialVehicleInspectionText = (
  fileName: string,
  text: string,
): VehicleInspectionData => {
  const isJson = fileName.toLowerCase().endsWith(".json") || text.trimStart().startsWith("{");
  if (isJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch {
      throw new Error("JSONファイルを読み取れませんでした。公式アプリから保存したファイルを選んでください。");
    }
    return fromRecord(flattenJson(parsed), "公式アプリJSON", text);
  }
  const record = csvToRecord(text);
  if (record.size === 0) {
    throw new Error("CSVファイルを読み取れませんでした。見出しを含む公式アプリのCSVを選んでください。");
  }
  return fromRecord(record, "公式アプリCSV", text);
};

const labeledQrRecord = (payloads: string[]): FlatRecord => {
  const record = new Map<string, string>();
  const labelPattern = /(自動車登録番号又は車両番号|自動車登録番号|車両番号|登録番号|車台番号|車体番号|車名|メーカー名|所有者の氏名又は名称|所有者氏名|所有者名称|初度登録年月|初度検査年月|有効期間の満了する日|有効期間満了日|車検満了日|型式)\s*[=:：]\s*([^\n\r,;|]+)/g;
  payloads.forEach((payload) => {
    for (const match of payload.matchAll(labelPattern)) {
      record.set(normalizeKey(match[1]), match[2].trim());
    }
  });
  return record;
};

const inferChassisNumber = (payloads: string[]) => {
  const tokens = payloads.flatMap((payload) => payload.split(/[\s,;|]+/));
  return tokens.find((token) => /^(?=.{6,30}$)(?=.*[A-Z0-9])(?=.*-)[A-Z0-9-]+$/i.test(token)) ?? "";
};

const cleanQrValue = (value: string | undefined) => (value ?? "")
  .replace(/[　 ]+/g, " ")
  .trim();

const qrDate = (value: string, withDay: boolean) => {
  if (!/^\d+$/.test(value) || /^9+$/.test(value)) return "";
  if (withDay && value.length === 6) return `20${value.slice(0, 2)}-${value.slice(2, 4)}-${value.slice(4, 6)}`;
  if (!withDay && value.length === 4) return `20${value.slice(0, 2)}-${value.slice(2, 4)}`;
  return "";
};

const joinQrParts = (payloads: string[]) => payloads
  .join("")
  .replace(/[\u0000\r\n]/g, "")
  .trim();

/**
 * 現行の登録車QRを読み取る。
 * 券面の左3個がQR3、右2個がQR2で、それぞれは構造的連結QRとして分割されている。
 * 国土交通省の2023.1版では、どちらの結合結果も「2/」から始まる。
 */
const parseVersion2RegisteredVehicleQr = (payloads: string[]): Partial<VehicleInspectionData> => {
  const result: Partial<VehicleInspectionData> = {};

  if (payloads.length >= 3) {
    const qr3Fields = joinQrParts(payloads.slice(0, 3)).split("/");
    if (cleanQrValue(qr3Fields[0]) === "2" && qr3Fields.length >= 6) {
      result.inspectionExpiry = qrDate(cleanQrValue(qr3Fields[3]), true);
      result.firstRegistration = qrDate(cleanQrValue(qr3Fields[4]), false);
      result.modelType = cleanQrValue(qr3Fields[5]);
    }
  }

  if (payloads.length >= 5) {
    const qr2Fields = joinQrParts(payloads.slice(3, 5)).split("/");
    if (cleanQrValue(qr2Fields[0]) === "2" && qr2Fields.length >= 6) {
      result.registrationNumber = cleanQrValue(qr2Fields[1]);
      result.chassisNumber = cleanQrValue(qr2Fields[3]);
    }
  }

  return result;
};

/** 軽自動車のコード2（K22）・コード3（K32）を、読み取り順に依存せず取り出す。 */
const markedQrFields = (joined: string, marker: "K22/" | "K32/") => {
  const start = joined.indexOf(marker);
  if (start < 0) return [];
  const nextStarts = (["K22/", "K32/"] as const)
    .map((candidate) => joined.indexOf(candidate, start + marker.length))
    .filter((position) => position >= 0);
  const end = nextStarts.length ? Math.min(...nextStarts) : joined.length;
  return joined.slice(start, end).split("/");
};

const parseRegisteredVehicleQr = (payloads: string[]): Partial<VehicleInspectionData> => {
  const version2 = parseVersion2RegisteredVehicleQr(payloads);
  const joined = joinQrParts(payloads);
  const qr2Fields = markedQrFields(joined, "K22/");
  const qr3Fields = markedQrFields(joined, "K32/");
  const result: Partial<VehicleInspectionData> = { ...version2 };

  if (qr2Fields[0] === "K22") {
    result.registrationNumber ||= cleanQrValue(qr2Fields[1]);
    result.chassisNumber ||= cleanQrValue(qr2Fields[3]);
  }

  if (qr3Fields[0] === "K32") {
    result.inspectionExpiry ||= qrDate(cleanQrValue(qr3Fields[3]), true);
    result.firstRegistration ||= qrDate(cleanQrValue(qr3Fields[4]), false);
    result.modelType ||= cleanQrValue(qr3Fields[5]);
  }
  return result;
};

/**
 * QRは券面・発行時期で構成が異なるため、ラベル付きデータと車台番号だけを安全側で推測する。
 * 結果は必ず確認画面を通し、固定位置を根拠にした自動保存は行わない。
 */
export const parseQrPayloads = (payloads: string[]): VehicleInspectionData => {
  const cleaned = payloads.map((payload) => payload.trim()).filter(Boolean);
  if (cleaned.length === 0) throw new Error("QRコードの内容がありません。");
  const rawSource = cleaned.join("\n---\n");
  const result = fromRecord(labeledQrRecord(cleaned), "QRコード", rawSource);
  const official = parseRegisteredVehicleQr(cleaned);
  result.registrationNumber ||= official.registrationNumber ?? "";
  result.chassisNumber ||= official.chassisNumber ?? "";
  result.firstRegistration ||= official.firstRegistration ?? "";
  result.inspectionExpiry ||= official.inspectionExpiry ?? "";
  result.modelType ||= official.modelType ?? "";
  if (!result.chassisNumber) result.chassisNumber = inferChassisNumber(cleaned);
  return result;
};

const normalizeVehicleIdentity = (value: string) => value
  .normalize("NFKC")
  .toUpperCase()
  .replace(/[\s\-－ー−‐‑‒–—―]/g, "");

/** 納車・廃車前の在庫に同じ車台番号または登録番号がある場合だけ、二重登録として扱う。 */
export const findVehicleInspectionDuplicate = (
  vehicles: Vehicle[],
  inspection: Pick<VehicleInspectionData, "chassisNumber" | "registrationNumber">,
) => {
  const chassisNumber = normalizeVehicleIdentity(inspection.chassisNumber);
  const registrationNumber = normalizeVehicleIdentity(inspection.registrationNumber);
  return vehicles.find((vehicle) => {
    if (["納車済み", "廃車処分"].includes(vehicle.status)) return false;
    const sameChassis = Boolean(chassisNumber) && normalizeVehicleIdentity(vehicle.chassisNumber) === chassisNumber;
    const sameRegistration = Boolean(registrationNumber) && normalizeVehicleIdentity(vehicle.registrationNumber) === registrationNumber;
    return sameChassis || sameRegistration;
  }) ?? null;
};
