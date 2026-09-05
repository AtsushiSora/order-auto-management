import { describe, expect, it } from "vitest";
import type { SaveStaffProfileDetailsInput, StaffProfile } from "../types";
import { formatEmployeeNumber, getStaffLicenseAlerts, validateStaffDetails } from "./staffDetails";

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

  it("有効期限を期限切れ・30日以内・90日以内に分類する", () => {
    const profiles: StaffProfile[] = [
      { ...staff, id: "missing", employeeNumber: 1, licenseExpiry: null },
      { ...staff, id: "expired", employeeNumber: 2, licenseExpiry: "2026-09-04" },
      { ...staff, id: "urgent", employeeNumber: 3, licenseExpiry: "2026-10-05" },
      { ...staff, id: "soon", employeeNumber: 4, licenseExpiry: "2026-12-04" },
      { ...staff, id: "safe", employeeNumber: 5, licenseExpiry: "2026-12-05" },
      { ...staff, id: "retired", employeeNumber: 6, isActive: false, licenseExpiry: null },
    ];
    expect(getStaffLicenseAlerts(profiles, "2026-09-05").map((item) => [item.staff.id, item.status, item.daysRemaining])).toEqual([
      ["missing", "unregistered", null],
      ["expired", "expired", -1],
      ["urgent", "within30", 30],
      ["soon", "within90", 90],
    ]);
  });
});
