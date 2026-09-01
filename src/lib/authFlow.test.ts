import { describe, expect, it } from "vitest";
import {
  getAuthCallbackSession,
  getSafeAuthErrorDetail,
  isPasswordSetupUrl,
  validateNewPassword,
} from "./authFlow";

describe("isPasswordSetupUrl", () => {
  it("招待リンクのハッシュを検出する", () => {
    expect(isPasswordSetupUrl("https://example.test/#access_token=x&type=invite")).toBe(true);
  });

  it("パスワード再設定リンクのクエリを検出する", () => {
    expect(isPasswordSetupUrl("https://example.test/?type=recovery&code=x")).toBe(true);
  });

  it("種類が省略されてもセッション用トークンが揃ったリンクを検出する", () => {
    expect(isPasswordSetupUrl(
      "https://example.test/#access_token=access-value&refresh_token=refresh-value",
    )).toBe(true);
  });

  it("通常の管理画面は対象外にする", () => {
    expect(isPasswordSetupUrl("https://example.test/#/dashboard")).toBe(false);
  });
});

describe("getAuthCallbackSession", () => {
  it("再設定リンクからセッション用トークンを取得する", () => {
    expect(getAuthCallbackSession(
      "https://example.test/#access_token=access-value&refresh_token=refresh-value&type=recovery",
    )).toEqual({ accessToken: "access-value", refreshToken: "refresh-value" });
  });

  it("必要なトークンが揃っていない場合は取得しない", () => {
    expect(getAuthCallbackSession("https://example.test/#access_token=access-value&type=recovery")).toBeNull();
  });
});

describe("getSafeAuthErrorDetail", () => {
  it("エラーコードと状態だけを診断表示に含める", () => {
    expect(getSafeAuthErrorDetail({
      code: "refresh_token_not_found",
      status: 400,
      name: "AuthApiError",
      message: "Invalid Refresh Token",
    })).toBe("refresh_token_not_found / 400 / AuthApiError / Invalid Refresh Token");
  });

  it("トークンらしい文字列を診断表示から除く", () => {
    expect(getSafeAuthErrorDetail({ message: "bad eyJsecret.payload.value" })).toBe("bad [token]");
  });
});

describe("validateNewPassword", () => {
  it("8文字未満を拒否する", () => {
    expect(validateNewPassword("short", "short")).toBe("パスワードは8文字以上にしてください。");
  });

  it("確認値の不一致を拒否する", () => {
    expect(validateNewPassword("long-password", "other-password")).toBe("確認用パスワードが一致しません。");
  });

  it("一致する8文字以上を受け入れる", () => {
    expect(validateNewPassword("long-password", "long-password")).toBeNull();
  });
});
