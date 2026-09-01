const passwordSetupTypes = new Set(["invite", "recovery"]);

export type AuthCallbackSession = {
  accessToken: string;
  refreshToken: string;
};

const getAuthParams = (href: string) => {
  const url = new URL(href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  return { url, hashParams };
};

export const isPasswordSetupUrl = (href: string) => {
  const { url, hashParams } = getAuthParams(href);
  return passwordSetupTypes.has(url.searchParams.get("type") ?? "")
    || passwordSetupTypes.has(hashParams.get("type") ?? "")
    || Boolean(hashParams.get("access_token") && hashParams.get("refresh_token"));
};

export const getAuthCallbackSession = (href: string): AuthCallbackSession | null => {
  const { hashParams } = getAuthParams(href);
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");

  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
};

export const validateNewPassword = (password: string, confirmation: string) => {
  if (password.length < 8) return "パスワードは8文字以上にしてください。";
  if (password !== confirmation) return "確認用パスワードが一致しません。";
  return null;
};
