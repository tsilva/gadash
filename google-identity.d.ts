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
    prompt?: "" | "none" | "consent" | "select_account";
    hint?: string;
  };

  type GoogleTokenClient = {
    requestAccessToken: (request?: GoogleTokenRequest) => void;
  };

  type GoogleIdCredentialResponse = {
    credential: string;
    select_by?: string;
  };

  type GoogleIdConfiguration = {
    client_id: string;
    callback: (response: GoogleIdCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: "signin" | "signup" | "use";
  };

  type GoogleIdButtonConfiguration = {
    theme?: "outline" | "filled_blue" | "filled_black";
    size?: "large" | "medium" | "small";
    shape?: "rectangular" | "pill" | "circle" | "square";
    text?: "signin_with" | "signup_with" | "continue_with" | "signin";
    logo_alignment?: "left" | "center";
    width?: number;
  };

  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdConfiguration) => void;
          renderButton: (parent: HTMLElement, options: GoogleIdButtonConfiguration) => void;
        };
        oauth2: {
          initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

export {};
