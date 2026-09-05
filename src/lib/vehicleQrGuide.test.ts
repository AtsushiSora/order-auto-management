import { describe, expect, it } from "vitest";
import { qrGuideProgress } from "./vehicleQrGuide";

describe("vehicle QR guide", () => {
  it("guides a registered vehicle through five QR positions", () => {
    expect(qrGuideProgress("registered", 0)).toMatchObject({
      expectedCount: 5,
      nextStep: "QR3の左側（①）",
      isComplete: false,
    });
    expect(qrGuideProgress("registered", 5)).toMatchObject({
      completedCount: 5,
      nextStep: "読み取り完了",
      isComplete: true,
    });
    expect(qrGuideProgress("registered", 0).groups).toEqual([
      { label: "QR3", positions: [1, 2, 3] },
      { label: "QR2", positions: [4, 5] },
    ]);
  });

  it("guides a light vehicle through its two QR codes", () => {
    expect(qrGuideProgress("light", 1)).toMatchObject({
      expectedCount: 2,
      nextStep: "右側のコード2（②）",
      isComplete: false,
    });
    expect(qrGuideProgress("light", 2).isComplete).toBe(true);
    expect(qrGuideProgress("light", 0).groups).toEqual([
      { label: "コード3", positions: [1] },
      { label: "コード2", positions: [2] },
    ]);
  });
});
