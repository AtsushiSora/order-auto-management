import { describe, expect, it } from "vitest";
import {
  findVehicleInspectionDuplicate,
  parseCsvRows,
  parseOfficialVehicleInspectionText,
  parseQrPayloads,
} from "./vehicleInspection";
import type { Vehicle } from "../types";

const activeVehicle = {
  id: "vehicle-1",
  managementNumber: "26-0001",
  name: "トヨタ プリウス",
  maker: "トヨタ",
  model: "プリウス",
  grade: "",
  chassisNumber: "ZVW30-1234567",
  registrationNumber: "広島 300 あ 12-34",
  status: "販売中",
} as Vehicle;

describe("vehicle inspection import", () => {
  it("reads official app JSON fields", () => {
    const result = parseOfficialVehicleInspectionText("certificate.json", JSON.stringify({
      車検証情報: {
        自動車登録番号又は車両番号: "品川 300 あ 12-34",
        車台番号: "ABC-123456",
        車名: "トヨタ",
        "所有者の氏名又は名称_所有者氏名（高水準文字含む）": "山田 太郎",
        初度登録年月: "令和5年4月",
        有効期間の満了する日: "令和7年4月1日",
        型式: "6AA-ABC10",
      },
    }));
    expect(result).toMatchObject({
      registrationNumber: "品川 300 あ 12-34",
      chassisNumber: "ABC-123456",
      vehicleName: "トヨタ",
      registeredOwnerName: "山田 太郎",
      modelType: "6AA-ABC10",
      sourceType: "公式アプリJSON",
    });
  });

  it("reads quoted official app CSV including BOM and commas", () => {
    const text = '\uFEFF"車名","車台番号","自動車登録番号又は車両番号","所有者の氏名又は名称"\r\n"日産,自動車","XYZ-98765","横浜 500 さ 56-78","株式会社テスト"\r\n';
    expect(parseCsvRows(text)[1][0]).toBe("日産,自動車");
    expect(parseOfficialVehicleInspectionText("certificate.csv", text)).toMatchObject({
      vehicleName: "日産,自動車",
      chassisNumber: "XYZ-98765",
      registrationNumber: "横浜 500 さ 56-78",
      registeredOwnerName: "株式会社テスト",
      sourceType: "公式アプリCSV",
    });
  });

  it("reads labeled QR values", () => {
    const result = parseQrPayloads([
      "登録番号:名古屋 330 た 11-22\n車台番号:ZVW30-1234567\n車名:トヨタ\n型式:DAA-ZVW30",
    ]);
    expect(result.registrationNumber).toBe("名古屋 330 た 11-22");
    expect(result.chassisNumber).toBe("ZVW30-1234567");
    expect(result.vehicleName).toBe("トヨタ");
  });

  it("joins and reads official K22/K32 split QR payloads", () => {
    const result = parseQrPayloads([
      "K22/品川　　５００や１０００/1/HGC14-",
      "12345/ABC/1",
      "K32/120/123450234/230104/2301/ABCDEF12345",
    ]);
    expect(result.registrationNumber).toBe("品川 ５００や１０００");
    expect(result.chassisNumber).toBe("HGC14-12345");
    expect(result.inspectionExpiry).toBe("2023-01-04");
    expect(result.firstRegistration).toBe("2023-01");
    expect(result.modelType).toBe("ABCDEF12345");
  });

  it("reads light-vehicle code 3 and code 2 in the guided order", () => {
    const result = parseQrPayloads([
      "K32/123/123451234/270707/2307/5BA-LA350S/0450/-/-/0430/28/076/-/-/-/----/-----/01/999",
      "K22/広島　　５８０あ１２３４/1/LA350S-1234567/KF/1",
    ]);
    expect(result.registrationNumber).toBe("広島 ５８０あ１２３４");
    expect(result.chassisNumber).toBe("LA350S-1234567");
    expect(result.inspectionExpiry).toBe("2027-07-07");
    expect(result.firstRegistration).toBe("2023-07");
    expect(result.modelType).toBe("5BA-LA350S");
  });

  it("joins the current five-part registered-vehicle QR3 and QR2 payloads", () => {
    const result = parseQrPayloads([
      "2/-  /175740019/251231/2004/6AA",
      "-ZYX10/0074/-   /-   /0043/10/0",
      "96/2/0/I/0001/-    /200127/14",
      "2/品川　　５００や１０００/1/ZYX10-",
      "1234567/A25A/1",
    ]);
    expect(result.registrationNumber).toBe("品川 ５００や１０００");
    expect(result.chassisNumber).toBe("ZYX10-1234567");
    expect(result.inspectionExpiry).toBe("2025-12-31");
    expect(result.firstRegistration).toBe("2020-04");
    expect(result.modelType).toBe("6AA-ZYX10");
  });

  it("ignores an unknown expiry marker", () => {
    const result = parseQrPayloads([
      "2/-  /175740019/999999/",
      "2004/6AA-ZYX10/0074/-   /-   /0043/10/0",
      "96/2/0/I/0001/-    /200127/14",
    ]);
    expect(result.inspectionExpiry).toBe("");
    expect(result.firstRegistration).toBe("2020-04");
  });

  it("does not guess uncertain unlabeled values", () => {
    const result = parseQrPayloads(["1234567890,unknown,data"]);
    expect(result.registrationNumber).toBe("");
    expect(result.vehicleName).toBe("");
  });

  it("detects an active vehicle even when chassis formatting differs", () => {
    expect(findVehicleInspectionDuplicate([activeVehicle], {
      chassisNumber: "zvw30 1234567",
      registrationNumber: "",
    })?.id).toBe("vehicle-1");
  });

  it("allows a previously delivered vehicle to be registered again", () => {
    expect(findVehicleInspectionDuplicate([{ ...activeVehicle, status: "納車済み" }], {
      chassisNumber: "ZVW30-1234567",
      registrationNumber: "",
    })).toBeNull();
  });
});
