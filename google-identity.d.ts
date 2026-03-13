declare global {
  type GoogleTokenResponse = {
    access_token: string;
    expires_in: number;
    prompt: string;
    scope: string;
    token_type: "Bearer";
    error?: string;
    error_description?: string;
    error_uri?: string;
  };

  type GoogleTokenClientConfig = {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type: string }) => void;
  };

  type GoogleTokenRequest = {
    prompt?: "" | "consent" | "select_account";
    hint?: string;
  };

  type GoogleTokenClient = {
    requestAccessToken: (request?: GoogleTokenRequest) => void;
  };

  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

export {};
