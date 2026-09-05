import type { SaveStaffProfileDetailsInput, StaffProfile } from "../types";

export type StaffLicenseAlert = {
  staff: StaffProfile;
  status: "unregistered" | "expired" | "within30" | "within90";
  daysRemaining: number | null;
};

export const formatEmployeeNumber = (value: number | null | undefined) =>
  value && value > 0 ? String(value).padStart(4, "0") : "採番待ち";

export const staffEmploymentLabels = {
  active: "在籍",
  paused: "休止",
  retired: "退職",
} as const;

const isoDateToUtc = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

export const getStaffLicenseAlerts = (profiles: StaffProfile[], today: string): StaffLicenseAlert[] => profiles
  .filter((staff) => staff.isActive)
  .map((staff): StaffLicenseAlert | null => {
    if (!staff.licenseExpiry) return { staff, status: "unregistered", daysRemaining: null };
    const daysRemaining = Math.ceil((isoDateToUtc(staff.licenseExpiry) - isoDateToUtc(today)) / 86_400_000);
    if (daysRemaining < 0) return { staff, status: "expired", daysRemaining };
    if (daysRemaining <= 30) return { staff, status: "within30", daysRemaining };
    if (daysRemaining <= 90) return { staff, status: "within90", daysRemaining };
    return null;
  })
  .filter((alert): alert is StaffLicenseAlert => Boolean(alert))
  .sort((a, b) => {
    const order = { unregistered: 0, expired: 1, within30: 2, within90: 3 };
    return order[a.status] - order[b.status]
      || (a.daysRemaining ?? -99999) - (b.daysRemaining ?? -99999)
      || (a.staff.employeeNumber ?? Number.MAX_SAFE_INTEGER) - (b.staff.employeeNumber ?? Number.MAX_SAFE_INTEGER);
  });

export const validateStaffDetails = (
  input: SaveStaffProfileDetailsInput,
  current: StaffProfile | undefined,
  licenseFront: File | null,
  licenseBack: File | null,
) => {
  const checked = {
    ...input,
    lastName: input.lastName.trim(),
    firstName: input.firstName.trim(),
    lastNameKana: input.lastNameKana.trim(),
    firstNameKana: input.firstNameKana.trim(),
    postalCode: input.postalCode.trim(),
    address: input.address.trim(),
    phone: input.phone.trim(),
  };
  if (!checked.lastName || !checked.firstName) throw new Error("名字と名前を入力してください。");
  if (!checked.lastNameKana || !checked.firstNameKana) throw new Error("名字と名前のフリガナを入力してください。");
  if (!/^\d{3}-?\d{4}$/.test(checked.postalCode)) throw new Error("郵便番号を7桁で入力してください。");
  if (!checked.address) throw new Error("住所を入力してください。");
  if (!/^0\d{9,10}$/.test(checked.phone.replace(/[^0-9]/g, ""))) throw new Error("電話番号を確認してください。");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checked.birthDate)) throw new Error("生年月日を選択してください。");
  if (!checked.licenseExpiry) throw new Error("運転免許証の有効期限を入力してください。");
  if (!current?.licenseFrontPath && !licenseFront) throw new Error("運転免許証の表面を添付してください。");
  if (!current?.licenseBackPath && !licenseBack) throw new Error("運転免許証の裏面を添付してください。");
  return checked;
};
