import { describe, expect, it } from "vitest";
import { externalSites, filterWebsiteInquiries, getInquiryVehicleLabel } from "./siteIntegration";
import type { Vehicle, WebsiteInquiry } from "../types";

const inquiry = (overrides: Partial<WebsiteInquiry> = {}): WebsiteInquiry => ({
  id: "inquiry-1",
  source: "販売サイト",
  customerName: "山田 太郎",
  email: "test@example.com",
  phone: "",
  message: "在庫車両の相談",
  interestedVehicleId: "vehicle-1",
  status: "新着",
  receivedAt: "2026-09-03T00:00:00Z",
  ...overrides,
});

const vehicle = (): Vehicle => ({
  id: "vehicle-1",
  managementNumber: "26-0001",
  name: "N-BOX",
  maker: "ホンダ",
  model: "N-BOX",
  grade: "G",
  chassisNumber: "JF1-0000001",
  modelType: "",
  registrationNumber: "",
  firstRegistration: "",
  inspectionExpiry: "",
  bodyColor: "白",
  mileage: "50000",
  status: "販売中",
  acquisitionSource: "一般のお客様",
  disposition: "販売",
  purchasePrice: 300000,
  askingPrice: 500000,
  salePrice: null,
  storageLocation: "自宅",
  plannedArrivalDate: "2026-09-01",
  arrivedAt: "2026-09-01",
  deliveredAt: null,
  documentsComplete: true,
  salesSitePublished: true,
  soldDisplayMode: "売約済み表示",
  publicMaker: "ホンダ",
  publicGrade: "G",
  publicYear: "2020年",
  publicMileage: "50,000km",
  publicColor: "白",
  publicInspection: "2027年8月",
  publicPrice: 500000,
  publicDescription: "",
  publicImageUrl: "",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
});

describe("サイト連携", () => {
  it("本番サイトのURLを固定して管理画面から開ける", () => {
    expect(externalSites.sales.url).toBe("https://atsushisora.github.io/car_search/");
    expect(externalSites.scrap.url).toBe("https://haisha.order-auto.com/");
  });

  it("販売・廃車サイトの問い合わせを絞り込める", () => {
    const inquiries = [inquiry(), inquiry({ id: "inquiry-2", source: "廃車サイト" })];
    expect(filterWebsiteInquiries(inquiries, "すべて")).toHaveLength(2);
    expect(filterWebsiteInquiries(inquiries, "販売サイト")).toEqual([inquiries[0]]);
    expect(filterWebsiteInquiries(inquiries, "廃車サイト")).toEqual([inquiries[1]]);
  });

  it("販売サイトで選ばれた対象車両を管理番号付きで表示する", () => {
    expect(getInquiryVehicleLabel(inquiry(), [vehicle()])).toBe("26-0001 N-BOX");
    expect(getInquiryVehicleLabel(inquiry({ interestedVehicleId: "missing" }), [vehicle()]))
      .toBe("掲載終了または削除済みの車両");
    expect(getInquiryVehicleLabel(inquiry({ interestedVehicleId: null }), [vehicle()])).toBeNull();
  });
});
