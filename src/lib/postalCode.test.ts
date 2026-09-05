import { describe, expect, it } from "vitest";
import { formatPostalCode, postalCodeDigits } from "./postalCode";

describe("postalCode", () => {
  it("郵便番号を7桁に整形する", () => {
    expect(postalCodeDigits("〒123-45678")).toBe("1234567");
    expect(formatPostalCode("1234567")).toBe("123-4567");
    expect(formatPostalCode("123")).toBe("123");
  });
});
