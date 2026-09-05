export type VehicleQrKind = "registered" | "light";

type VehicleQrGuide = {
  label: string;
  description: string;
  steps: string[];
  groups: { label: string; positions: number[] }[];
};

export const vehicleQrGuides: Record<VehicleQrKind, VehicleQrGuide> = {
  registered: {
    label: "普通車",
    description: "左側のQR3を3個、続けて右側のQR2を2個読み取ります。",
    steps: ["QR3の左側（①）", "QR3の中央（②）", "QR3の右側（③）", "QR2の左側（④）", "QR2の右側（⑤）"],
    groups: [
      { label: "QR3", positions: [1, 2, 3] },
      { label: "QR2", positions: [4, 5] },
    ],
  },
  light: {
    label: "軽自動車",
    description: "左側のコード3、続けて右側のコード2を読み取ります。A4では6個のうちコード3とコード2だけを使います。",
    steps: ["左側のコード3（①）", "右側のコード2（②）"],
    groups: [
      { label: "コード3", positions: [1] },
      { label: "コード2", positions: [2] },
    ],
  },
};

export const qrGuideProgress = (kind: VehicleQrKind, readCount: number) => {
  const guide = vehicleQrGuides[kind];
  const completedCount = Math.min(Math.max(readCount, 0), guide.steps.length);
  return {
    ...guide,
    completedCount,
    expectedCount: guide.steps.length,
    isComplete: completedCount >= guide.steps.length,
    nextStep: guide.steps[completedCount] ?? "読み取り完了",
  };
};
