import type { AttachmentCategory } from "../types";

export const PRIVATE_BUCKET = "order-auto-private";
export const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;

export const attachmentCategories: AttachmentCategory[] = [
  "領収書",
  "請求書",
  "オークション計算書",
  "振込明細",
  "その他",
];

const extensionByMimeType: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

const fallbackMimeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

type FileLike = Pick<File, "name" | "size" | "type">;

export const resolveEvidenceMimeType = (file: FileLike): string => {
  const normalized = file.type.toLowerCase();
  if (extensionByMimeType[normalized]) return normalized;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return fallbackMimeByExtension[extension] ?? "";
};

export const validateEvidenceFile = (file: FileLike): { mimeType: string; extension: string } => {
  if (file.size <= 0) throw new Error("空のファイルは添付できません。");
  if (file.size > MAX_EVIDENCE_BYTES) throw new Error("ファイルは25MB以下にしてください。");
  const mimeType = resolveEvidenceMimeType(file);
  const extension = extensionByMimeType[mimeType];
  if (!extension) throw new Error("PDF、JPEG、PNG、WebP、HEIC、HEIFのファイルを選んでください。");
  return { mimeType, extension };
};

export const buildExpenseEvidencePath = (expenseId: string, attachmentId: string, extension: string) =>
  `expenses/${expenseId}/${attachmentId}.${extension}`;

export const buildExpenseRequestEvidencePath = (approvalId: string, attachmentId: string, extension: string) =>
  `expense-requests/${approvalId}/${attachmentId}.${extension}`;

export const formatFileSize = (byteSize: number) => {
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${Math.ceil(byteSize / 1024)} KB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
};
