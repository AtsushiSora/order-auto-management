import type {
  SaveSpotAssignmentInput,
  StaffBusinessType,
  StaffEngagementType,
} from "../types";

type SpotAssignmentFlow = {
  engagementType: StaffEngagementType;
  businessType: StaffBusinessType;
};

export const isSpotContractFlow = (flow: SpotAssignmentFlow) =>
  flow.engagementType === "契約から全て担当";

export const requiresSpotSaleVehicle = (flow: SpotAssignmentFlow) =>
  isSpotContractFlow(flow) && flow.businessType === "販売";

export const requiresOwnerPurchaseAmount = (flow: SpotAssignmentFlow) =>
  isSpotContractFlow(flow) && flow.businessType !== "販売";

export const validateSpotAssignment = (
  input: Pick<
    SaveSpotAssignmentInput,
    "engagementType" | "businessType" | "vehicleId" | "contractAmount"
  >,
) => {
  if (requiresSpotSaleVehicle(input) && !input.vehicleId) {
    return "販売を全て担当する案件では対象車両が必要です。";
  }
  if (requiresOwnerPurchaseAmount(input)) {
    if (input.contractAmount === null) {
      return "買取・廃車の契約を任せる場合は、事業主が買取金額を入力してください。";
    }
    if (!Number.isFinite(input.contractAmount) || input.contractAmount < 0) {
      return "買取金額は0円以上で入力してください。";
    }
  }
  return null;
};

export const spotAssignmentNextStep = (
  flow: SpotAssignmentFlow,
  audience: "owner" | "spot",
) => {
  if (!isSpotContractFlow(flow)) {
    return audience === "owner"
      ? "次：事業主が契約し、紹介料を登録・振込"
      : "契約は事業主が行います。紹介料は確定後に「紹介料確認」で確認できます。";
  }
  if (flow.businessType === "販売") {
    return audience === "owner"
      ? "次：スポットスタッフが割り当て車両の販売契約"
      : "割り当てられた在庫車両の販売契約を進めてください。";
  }
  return audience === "owner"
    ? "次：スポットスタッフが事業主設定額で買取契約"
    : "事業主が設定した金額で買取契約を進めてください。金額は変更できません。";
};
