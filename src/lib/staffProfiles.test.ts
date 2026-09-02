import { describe, expect, it } from "vitest";
import type { StaffProfile } from "../types";
import { validateStaffProfileUpdate } from "./staffProfiles";

const owner: StaffProfile = { id: "owner-1", displayName: "事業主", role: "owner", isActive: true };
const regular: StaffProfile = { id: "regular-1", displayName: "通常スタッフ", role: "regular", isActive: true };

describe("validateStaffProfileUpdate", () => {
  it("事業主は別の利用者を停止できる", () => {
    expect(validateStaffProfileUpdate(owner, [owner, regular], {
      staffId: regular.id,
      displayName: regular.displayName,
      role: regular.role,
      isActive: false,
    }).isActive).toBe(false);
  });

  it("事業主以外からの変更を拒否する", () => {
    expect(() => validateStaffProfileUpdate(regular, [owner, regular], {
      staffId: owner.id,
      displayName: owner.displayName,
      role: owner.role,
      isActive: true,
    })).toThrow("事業主だけ");
  });

  it("ログイン中の事業主自身の停止を拒否する", () => {
    expect(() => validateStaffProfileUpdate(owner, [owner, regular], {
      staffId: owner.id,
      displayName: owner.displayName,
      role: owner.role,
      isActive: false,
    })).toThrow("ログイン中の事業主自身");
  });

  it("最後の事業主を通常スタッフへ変更できない", () => {
    expect(() => validateStaffProfileUpdate(owner, [owner, regular], {
      staffId: owner.id,
      displayName: owner.displayName,
      role: "regular",
      isActive: true,
    })).toThrow();
  });
});
