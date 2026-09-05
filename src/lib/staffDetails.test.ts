import { describe, expect, it } from "vitest";
import type { SaveStaffProfileDetailsInput, StaffProfile } from "../types";
import { formatEmployeeNumber, validateStaffDetails } from "./staffDetails";

const staff: StaffProfile = {
  id: "staff-1",
  displayName: "山田 太郎",
  role: "regular",
  isActive: true,
  licenseFrontPath: "staff-licenses/staff-1/front.jpg",
  licenseBackPath: "staff-licenses/staff-1/back.jpg",
};

const input: SaveStaffProfileDetailsInput = {
  staffId: "staff-1",
  lastName: " 山田 ",
  firstName: " 太郎 ",
  lastNameKana: " ヤマダ ",
  firstNameKana: " タロウ ",
  postalCode: "123-4567",
  address: "東京都テスト1-2-3",
  phone: "090-1234-5678",
  birthDate: "1990-01-02",
  licenseExpiry: "2030-03-31",
};

describe("staffDetails", () => {
  it("社員番号を4桁表示する", () => {
    expect(formatEmployeeNumber(1)).toBe("0001");
    expect(formatEmployeeNumber(25)).toBe("0025");
  });

  it("登録済み免許証を引き継いで本人情報を検証する", () => {
    expect(validateStaffDetails(input, staff, null, null)).toMatchObject({
      lastName: "山田",
      firstName: "太郎",
      phone: "090-1234-5678",
    });
  });

  it("初回登録では免許証の表裏を必須にする", () => {
    expect(() => validateStaffDetails(input, { ...staff, licenseFrontPath: "", licenseBackPath: "" }, null, null))
      .toThrow("運転免許証の表面を添付してください。");
  });
});
