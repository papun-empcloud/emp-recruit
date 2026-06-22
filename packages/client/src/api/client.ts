import axios from "axios";
import type { ApiResponse } from "@emp-recruit/shared";

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — redirect to login (session expired). Skip for auth endpoints:
// a 401 from login/register/refresh/SSO is a credential/flow error the calling
// page must surface (e.g. "wrong password") — hard-redirecting there would wipe
// the page before its own error toast can render.
const AUTH_PATHS = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/sso"];
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const requestUrl = error.config?.url || "";
    const isAuthRequest = AUTH_PATHS.some((p) => requestUrl.includes(p));
    if (error.response?.status === 401 && !isAuthRequest) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Typed API helpers
// ---------------------------------------------------------------------------

export async function apiGet<T>(url: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
  const { data } = await api.get<ApiResponse<T>>(url, { params });
  return data;
}

export async function apiPost<T>(url: string, body?: any): Promise<ApiResponse<T>> {
  const { data } = await api.post<ApiResponse<T>>(url, body);
  return data;
}

export async function apiPut<T>(url: string, body?: any): Promise<ApiResponse<T>> {
  const { data } = await api.put<ApiResponse<T>>(url, body);
  return data;
}

export async function apiPatch<T>(url: string, body?: any): Promise<ApiResponse<T>> {
  const { data } = await api.patch<ApiResponse<T>>(url, body);
  return data;
}

export async function apiDelete<T>(url: string): Promise<ApiResponse<T>> {
  const { data } = await api.delete<ApiResponse<T>>(url);
  return data;
}
