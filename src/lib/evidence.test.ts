import { describe, expect, it } from "vitest";
import {
  buildExpenseEvidencePath,
  formatFileSize,
  MAX_EVIDENCE_BYTES,
  resolveEvidenceMimeType,
  validateEvidenceFile,
} from "./evidence";

describe("evidence files", () => {
  it("MIME typeがないiPhone画像は拡張子からHEICと判定する", () => {
    expect(resolveEvidenceMimeType({ name: "IMG_0001.HEIC", type: "", size: 123 })).toBe("image/heic");
  });

  it("PDFと画像だけを25MBまで許可する", () => {
    expect(validateEvidenceFile({ name: "receipt.pdf", type: "application/pdf", size: 1024 })).toEqual({
      mimeType: "application/pdf",
      extension: "pdf",
    });
    expect(() => validateEvidenceFile({ name: "large.pdf", type: "application/pdf", size: MAX_EVIDENCE_BYTES + 1 })).toThrow("25MB");
    expect(() => validateEvidenceFile({ name: "memo.txt", type: "text/plain", size: 10 })).toThrow("PDF");
  });

  it("利用者のファイル名をStorageパスに含めない", () => {
    expect(buildExpenseEvidencePath("expense-id", "attachment-id", "jpg")).toBe(
      "expenses/expense-id/attachment-id.jpg",
    );
  });

  it("ファイルサイズを読みやすく表示する", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1572864)).toBe("1.5 MB");
  });
});
