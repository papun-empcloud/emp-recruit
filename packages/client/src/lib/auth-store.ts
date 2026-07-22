import { create } from "zustand";

export interface AuthUser {
  id: number;
  empcloudUserId: number;
  empcloudOrgId: number;
  orgId: number;
  recruitProfileId: string | null;
  role: string;
  email: string;
  firstName: string;
  lastName: string;
  orgName: string;
  // Fine-grained permissions federated from EmpCloud (e.g. "recruit:view").
  // Present when the user was granted recruit access via a custom role rather
  // than an admin role. Optional for older sessions.
  permissions?: string[];
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, tokens: { accessToken: string; refreshToken: string }) => void;
  logout: () => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,

  login: (user, tokens) => {
    // Tokens are also delivered as httpOnly cookies by the server (audit H3).
    // We never persist them to localStorage where XSS could read them: the
    // access token is kept in memory only (for the Authorization header and
    // in-session media links) and the refresh token lives solely in its cookie.
    // Only the non-secret `user` is stored so the UI can restore after a reload.
    localStorage.setItem("user", JSON.stringify(user));
    set({
      user,
      accessToken: tokens.accessToken,
      refreshToken: null,
      isAuthenticated: true,
    });
  },

  logout: () => {
    // The auth cookies are httpOnly, so only the server can clear them.
    try {
      void fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // best-effort — proceed with local cleanup regardless
    }
    localStorage.removeItem("user");
    // Legacy cleanup for sessions created by an older build.
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
    window.location.href = "/login";
  },

  loadFromStorage: () => {
    // Session persistence rides on the httpOnly cookie, so a stored `user` is
    // enough to restore the UI — API/media calls re-authenticate via the cookie.
    // The in-memory access token stays null until the next login/refresh.
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        set({ user, accessToken: null, refreshToken: null, isAuthenticated: true });
      } catch {
        localStorage.removeItem("user");
      }
    }
  },
}));

/**
 * Extract the SSO token from the URL query string (if present).
 * Returns the raw token string, or null if not found.
 * The token will be exchanged server-side by SSOGate — we no longer
 * store the EMP Cloud RS256 JWT directly.
 */
export function extractSSOToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const ssoToken = params.get("sso_token");
  if (!ssoToken) return null;

  // Mark that this session came from EMP Cloud SSO. The dashboard return URL is
  // environment-configurable rather than hardcoded to the test host (audit L10).
  localStorage.setItem('sso_source', 'empcloud');
  localStorage.setItem(
    'empcloud_return_url',
    import.meta.env.VITE_EMPCLOUD_DASHBOARD_URL || 'https://test-empcloud.empcloud.com/dashboard',
  );

  // Clean the URL immediately so the token doesn't linger
  const url = new URL(window.location.href);
  url.searchParams.delete("sso_token");
  window.history.replaceState({}, "", url.pathname + url.hash);

  return ssoToken;
}

// Convenience helpers (non-hook)
export function getUser(): AuthUser | null {
  const raw = localStorage.getItem("user");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function getToken(): string | null {
  // In-memory access token (audit H3). Null after a reload — API/media calls
  // then authenticate via the httpOnly cookie instead.
  return useAuthStore.getState().accessToken;
}

export function isLoggedIn(): boolean {
  // The session is carried by the httpOnly cookie, so presence of the stored
  // (non-secret) user is the reload-safe signal, not an in-memory token.
  return !!localStorage.getItem("user");
}
