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
    description: "QR2を左から2個、続けてQR3を左から3個読み取ります。",
    steps: ["QR2の左側（①）", "QR2の右側（②）", "QR3の左側（③）", "QR3の中央（④）", "QR3の右側（⑤）"],
    groups: [
      { label: "QR2", positions: [1, 2] },
      { label: "QR3", positions: [3, 4, 5] },
    ],
  },
  light: {
    label: "軽自動車",
    description: "券面下部のコード2、コード3を左から順に読み取ります。",
    steps: ["左側のコード2（①）", "右側のコード3（②）"],
    groups: [
      { label: "コード2", positions: [1] },
      { label: "コード3", positions: [2] },
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
