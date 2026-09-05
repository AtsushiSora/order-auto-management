import type { SaveStaffProfileDetailsInput, StaffProfile } from "../types";

export const formatEmployeeNumber = (value: number | null | undefined) =>
  value && value > 0 ? String(value).padStart(4, "0") : "採番待ち";

export const staffEmploymentLabels = {
  active: "在籍",
  paused: "休止",
  retired: "退職",
} as const;

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
