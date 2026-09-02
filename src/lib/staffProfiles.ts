import type { StaffProfile, StaffRole, UpdateStaffProfileInput } from "../types";

export const staffRoleLabels: Record<StaffRole, string> = {
  owner: "事業主",
  accounting: "経理担当",
  regular: "通常スタッフ",
  spot: "スポットスタッフ",
};

export function validateStaffProfileUpdate(
  actingProfile: StaffProfile | null,
  profiles: StaffProfile[],
  input: UpdateStaffProfileInput,
) {
  if (actingProfile?.role !== "owner" || !actingProfile.isActive) {
    throw new Error("利用者情報を変更できるのは事業主だけです。");
  }

  const target = profiles.find((profile) => profile.id === input.staffId);
  if (!target) throw new Error("対象の利用者が見つかりません。");

  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 80) {
    throw new Error("表示名は1文字から80文字で入力してください。");
  }

  if (target.id === actingProfile.id && (!input.isActive || input.role !== "owner")) {
    throw new Error("ログイン中の事業主自身は、利用停止や権限変更ができません。");
  }

  const removesActiveOwner = target.role === "owner"
    && target.isActive
    && (!input.isActive || input.role !== "owner");
  const otherActiveOwners = profiles.filter((profile) => (
    profile.id !== target.id && profile.role === "owner" && profile.isActive
  ));
  if (removesActiveOwner && otherActiveOwners.length === 0) {
    throw new Error("有効な事業主アカウントを最低1人残してください。");
  }

  return { ...input, displayName };
}
