import { describe, expect, it } from "vitest";
import {
  mapCashflowFromDb,
  mapContractFromDb,
  mapExpenseFromDb,
  mapVehicleFromDb,
  mapVehicleDocumentFromDb,
  newCashflowToDb,
  newVehicleToDb,
  purchaseContractToRpc,
  vehicleDocumentToDb,
} from "./supabaseData";

describe("Supabaseデータ変換", () => {
  it("車両の日本語表示値をDB値へ変換する", () => {
    const row = newVehicleToDb({
      name: "テスト車両",
      chassisNumber: "ABC-123",
      status: "入庫予定",
      acquisitionSource: "オークション",
      purchasePrice: 500000,
      askingPrice: 700000,
      storageLocation: "自宅",
      plannedArrivalDate: "2026-09-10",
    });

    expect(row.status).toBe("planned_arrival");
    expect(row.acquisition_source).toBe("auction");
    expect(row.chassis_number).toBe("ABC-123");
  });

  it("DBの車両行を画面用データへ戻す", () => {
    const vehicle = mapVehicleFromDb({
      id: "vehicle-id",
      management_number: "26-0001",
      name: "テスト車両",
      chassis_number: null,
      status: "reserved",
      acquisition_source: "customer",
      purchase_price: 0,
      asking_price: 600000,
      sale_price: 580000,
      storage_location: "自宅",
      planned_arrival_date: "2026-09-01",
      arrived_at: "2026-09-01",
      delivered_at: null,
      documents_complete: true,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T01:00:00Z",
    });

    expect(vehicle.status).toBe("売約済み");
    expect(vehicle.acquisitionSource).toBe("一般のお客様");
    expect(vehicle.salePrice).toBe(580000);
    expect(vehicle.chassisNumber).toBe("");
  });

  it("0円買取は車両に保存でき、支払い行は0円で作らない", () => {
    const row = newVehicleToDb({
      name: "0円買取車",
      chassisNumber: "",
      status: "入庫済み",
      acquisitionSource: "一般のお客様",
      purchasePrice: 0,
      askingPrice: 100000,
      storageLocation: "自宅",
      plannedArrivalDate: "2026-09-01",
    });

    expect(row.purchase_price).toBe(0);
  });

  it("在庫登録前の買取契約を画面用データへ戻す", () => {
    const contract = mapContractFromDb({
      id: "contract-id",
      vehicle_id: null,
      type: "purchase",
      status: "draft",
      customer_label: "動作確認 顧客",
      contracted_on: "2026-09-02",
      amount: 123000,
      vehicle_name: "動作確認車",
      chassis_number: null,
      acquisition_source: "customer",
      asking_price: 300000,
      storage_location: "自宅",
      planned_arrival_date: "2026-09-03",
      purchase_payment_method: "bank_transfer",
      created_at: "2026-09-02T00:00:00Z",
      updated_at: "2026-09-02T00:00:00Z",
    });

    expect(contract.vehicleId).toBeNull();
    expect(contract.vehicleName).toBe("動作確認車");
    expect(contract.status).toBe("下書き");
  });

  it("買取契約を在庫連動RPCの引数へ変換する", () => {
    const input = purchaseContractToRpc({
      contractId: null,
      customerLabel: "0円動作確認 顧客",
      contractedOn: "2026-09-02",
      status: "契約済み",
      amount: 0,
      vehicleName: "0円買取テスト車",
      chassisNumber: "",
      acquisitionSource: "オークション",
      askingPrice: 100000,
      storageLocation: "自宅",
      plannedArrivalDate: "2026-09-03",
      paymentMethod: "振込",
    });

    expect(input.p_status).toBe("contracted");
    expect(input.p_acquisition_source).toBe("auction");
    expect(input.p_payment_method).toBe("bank_transfer");
    expect(input.p_amount).toBe(0);
  });

  it("譲渡証明書の受領状態をDB形式へ変換できる", () => {
    const row = vehicleDocumentToDb({
      vehicleId: "vehicle-id",
      documentType: "譲渡証明書",
      isRequired: true,
      isReceived: true,
      receivedAt: "2026-09-02",
      note: "原本",
    });

    expect(row.document_type).toBe("transfer_certificate");
    expect(row.received_at).toBe("2026-09-02");
    expect(mapVehicleDocumentFromDb({
      id: "document-id",
      vehicle_id: "vehicle-id",
      document_type: "transfer_certificate",
      is_required: true,
      is_received: true,
      received_at: "2026-09-02",
      note: "原本",
      created_at: "2026-09-02T00:00:00Z",
      updated_at: "2026-09-02T00:00:00Z",
    }).documentType).toBe("譲渡証明書");
  });

  it("買取代金をDBの業務区分へ変換する", () => {
    const row = newCashflowToDb({
      vehicleId: "vehicle-id",
      direction: "支払い",
      description: "買取代金",
      amount: 100000,
      processedAmount: 0,
      status: "未処理",
      method: "振込",
      scheduledOn: "2026-09-01",
      processedOn: null,
    });

    expect(row.kind).toBe("purchase_payment");
    expect(row.direction).toBe("outgoing");
  });

  it("DBの経費・入出金を日本語表示へ戻す", () => {
    expect(mapExpenseFromDb({
      id: "expense-id",
      vehicle_id: null,
      category: "備品費",
      description: "プリンター代",
      amount: 20000,
      expense_status: "confirmed",
      payment_status: "paid",
      incurred_on: "2026-09-01",
      created_at: "2026-09-01T00:00:00Z",
    }).paymentStatus).toBe("支払済み");

    expect(mapCashflowFromDb({
      id: "cashflow-id",
      vehicle_id: null,
      direction: "incoming",
      description: "返金しない預り金",
      amount: 10000,
      processed_amount: 10000,
      status: "completed",
      method: "cash",
      scheduled_on: "2026-09-01",
      processed_on: "2026-09-01",
      created_at: "2026-09-01T00:00:00Z",
    }).method).toBe("現金");
  });
});
