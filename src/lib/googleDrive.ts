type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type?: string }) => void;
          }) => GoogleTokenClient;
        };
      };
    };
  }
}

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export const requestGoogleDriveAccessToken = (clientId: string): Promise<string> => new Promise((resolve, reject) => {
  const oauth2 = window.google?.accounts?.oauth2;
  if (!clientId.trim()) {
    reject(new Error("Google Driveの設定がまだ完了していません。"));
    return;
  }
  if (!oauth2) {
    reject(new Error("Googleの接続画面を読み込めませんでした。通信状態を確認して、もう一度お試しください。"));
    return;
  }

  const client = oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_DRIVE_SCOPE,
    callback: (result) => {
      if (result.access_token) {
        resolve(result.access_token);
        return;
      }
      reject(new Error(result.error_description || "Google Driveへの接続が許可されませんでした。"));
    },
    error_callback: () => reject(new Error("Google Driveの接続画面が閉じられました。")),
  });
  client.requestAccessToken();
});
