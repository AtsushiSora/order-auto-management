import type { Vehicle, WebsiteInquiry } from "../types";

export const externalSites = {
  sales: {
    label: "販売サイト",
    url: "https://atsushisora.github.io/car_search/",
  },
  scrap: {
    label: "廃車サイト",
    url: "https://haisha.order-auto.com/",
  },
} as const;

export type WebsiteInquiryFilter = "すべて" | WebsiteInquiry["source"];

export const filterWebsiteInquiries = (
  inquiries: WebsiteInquiry[],
  filter: WebsiteInquiryFilter,
) => filter === "すべて" ? inquiries : inquiries.filter((inquiry) => inquiry.source === filter);

export const getInquiryVehicleLabel = (
  inquiry: Pick<WebsiteInquiry, "interestedVehicleId">,
  vehicles: Vehicle[],
) => {
  if (!inquiry.interestedVehicleId) return null;
  const vehicle = vehicles.find((item) => item.id === inquiry.interestedVehicleId);
  return vehicle ? `${vehicle.managementNumber} ${vehicle.name}` : "掲載終了または削除済みの車両";
};
