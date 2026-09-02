import type { Vehicle } from "../types";

export type SalesSiteLabel = "掲載中" | "売約済み";

export const getSalesSiteLabel = (vehicle: Vehicle): SalesSiteLabel | null => {
  if (!vehicle.salesSitePublished || vehicle.status === "廃車処分") return null;
  if (vehicle.status === "販売中") return "掲載中";
  if (["売約済み", "納車済み"].includes(vehicle.status)) {
    return vehicle.soldDisplayMode === "売約済み表示" ? "売約済み" : null;
  }
  return null;
};

export const canPublishToSalesSite = (vehicle: Vehicle) =>
  ["販売中", "売約済み", "納車済み"].includes(vehicle.status);
