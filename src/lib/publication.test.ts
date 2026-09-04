import { describe, expect, it } from "vitest";
import { getSalesSiteLabel } from "./publication";
import type { Vehicle } from "../types";

const vehicle = (patch: Partial<Vehicle> = {}): Vehicle => ({
  id: "vehicle-id",
  managementNumber: "26-0001",
  name: "テスト車",
  maker: "テストメーカー",
  model: "テスト車",
  grade: "G",
  chassisNumber: "PRIVATE-CHASSIS",
  modelType: "",
  registrationNumber: "",
  firstRegistration: "",
  inspectionExpiry: "",
  bodyColor: "白",
  mileage: "10000",
  status: "販売中",
  acquisitionSource: "一般のお客様",
  disposition: "販売",
  purchasePrice: 500000,
  askingPrice: 800000,
  salePrice: null,
  storageLocation: "自宅",
  plannedArrivalDate: "2026-09-01",
  arrivedAt: "2026-09-01",
  deliveredAt: null,
  documentsComplete: true,
  salesSitePublished: true,
  soldDisplayMode: "売約済み表示",
  publicMaker: "テストメーカー",
  publicGrade: "G",
  publicYear: "2024年",
  publicMileage: "10,000km",
  publicColor: "白",
  publicInspection: "2028年1月",
  publicPrice: 800000,
  publicDescription: "公開説明",
  publicImageUrl: "",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  ...patch,
});

describe("販売サイト表示", () => {
  it("販売中の公開車両は掲載中になる", () => {
    expect(getSalesSiteLabel(vehicle())).toBe("掲載中");
  });

  it("管理上の納車済みはサイトで売約済みのまま表示できる", () => {
    expect(getSalesSiteLabel(vehicle({ status: "納車済み" }))).toBe("売約済み");
  });

  it("非表示を選んだ売約済み車両は一覧から除外される", () => {
    expect(getSalesSiteLabel(vehicle({ status: "売約済み", soldDisplayMode: "非表示" }))).toBeNull();
  });

  it("社内状態が販売前または廃車なら公開されない", () => {
    expect(getSalesSiteLabel(vehicle({ status: "入庫済み" }))).toBeNull();
    expect(getSalesSiteLabel(vehicle({ status: "廃車処分" }))).toBeNull();
  });
});
