import { describe, expect, it } from "vitest";
import {
  mapCashflowFromDb,
  mapContractFromDb,
  mapExpenseFromDb,
  mapVehicleFromDb,
  mapVehicleDocumentFromDb,
  mapWebsiteInquiryFromDb,
  expenseToRpc,
  newCashflowToDb,
  newVehicleToDb,
  purchaseContractToRpc,
  saleContractToRpc,
  vehicleDocumentToDb,
  vehiclePublicationToRpc,
  websiteInquiryStatusToRpc,
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
    expect(vehicle.salesSitePublished).toBe(false);
    expect(vehicle.soldDisplayMode).toBe("売約済み表示");
  });

  it("公開用の車両情報だけをRPC引数へ変換する", () => {
    const input = vehiclePublicationToRpc({
      vehicleId: "vehicle-id",
      salesSitePublished: true,
      soldDisplayMode: "非表示",
      publicMaker: " メーカー ",
      publicGrade: " G ",
      publicYear: "2024年",
      publicMileage: "10,000km",
      publicColor: "白",
      publicInspection: "2028年1月",
      publicPrice: 880000,
      publicDescription: " 公開説明 ",
      publicImageUrl: "https://example.com/car.jpg",
    });

    expect(input).toMatchObject({
      p_vehicle_id: "vehicle-id",
      p_sales_site_published: true,
      p_sold_display_mode: "hidden",
      p_public_maker: "メーカー",
      p_public_price: 880000,
    });
    expect(input).not.toHaveProperty("chassis_number");
    expect(input).not.toHaveProperty("purchase_price");
  });

  it("サイト問い合わせを社内表示へ変換し、対応状況をRPCへ渡せる", () => {
    expect(mapWebsiteInquiryFromDb({
      id: "inquiry-id",
      source: "scrap_site",
      customer_name: "確認 お客様",
      email: "test@example.com",
      phone: "090-0000-0000",
      message: "事故車の相談",
      interested_vehicle_id: null,
      status: "in_progress",
      received_at: "2026-09-02T00:00:00Z",
    })).toMatchObject({ source: "廃車サイト", status: "対応中" });
    expect(websiteInquiryStatusToRpc("inquiry-id", "完了")).toEqual({
      p_inquiry_id: "inquiry-id",
      p_status: "completed",
    });
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

  it("販売契約を売約・入金連動RPCの引数へ変換する", () => {
    const input = saleContractToRpc({
      contractId: null,
      vehicleId: "vehicle-id",
      customerLabel: "販売確認 顧客",
      amount: 880000,
      status: "契約済み",
      contractedOn: "2026-09-02",
      paymentMethod: "ローン会社",
    });

    expect(input).toMatchObject({
      p_vehicle_id: "vehicle-id",
      p_status: "contracted",
      p_amount: 880000,
      p_payment_method: "loan_company",
    });
  });

  it("確定経費を支払い連動RPCの引数へ変換する", () => {
    const input = expenseToRpc({
      expenseId: "expense-id",
      vehicleId: "vehicle-id",
      category: " 販売手数料 ",
      description: " オークション出品料 ",
      amount: 33000,
      expenseStatus: "確定",
      paymentStatus: "未払い",
      paymentMethod: "振込",
      incurredOn: "2026-09-02",
    });

    expect(input).toMatchObject({
      p_expense_id: "expense-id",
      p_category: "販売手数料",
      p_amount: 33000,
      p_expense_status: "confirmed",
      p_payment_status: "unpaid",
      p_payment_method: "bank_transfer",
    });
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
      kind: "sale_receipt",
      description: "返金しない預り金",
      amount: 10000,
      processed_amount: 10000,
      status: "completed",
      method: "cash",
      scheduled_on: "2026-09-01",
      processed_on: "2026-09-01",
      created_at: "2026-09-01T00:00:00Z",
    })).toMatchObject({ method: "現金", kind: "販売代金" });
  });
});
