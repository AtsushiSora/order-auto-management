export type PostalAddress = {
  postalCode: string;
  address: string;
};

type ZipCloudResponse = {
  status?: number;
  message?: string | null;
  results?: Array<{
    zipcode?: string;
    address1?: string;
    address2?: string;
    address3?: string;
  }> | null;
};

export const postalCodeDigits = (value: string) => value.replace(/[^0-9]/g, "").slice(0, 7);

export const formatPostalCode = (value: string) => {
  const digits = postalCodeDigits(value);
  return digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
};

export const lookupPostalAddress = async (value: string, signal?: AbortSignal): Promise<PostalAddress> => {
  const digits = postalCodeDigits(value);
  if (digits.length !== 7) throw new Error("郵便番号を7桁で入力してください。");

  const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`, { signal });
  if (!response.ok) throw new Error("住所を検索できませんでした。");
  const payload = await response.json() as ZipCloudResponse;
  const result = payload.results?.[0];
  if (!result) throw new Error(payload.message || "郵便番号に一致する住所が見つかりませんでした。");

  return {
    postalCode: formatPostalCode(result.zipcode || digits),
    address: `${result.address1 ?? ""}${result.address2 ?? ""}${result.address3 ?? ""}`,
  };
};
