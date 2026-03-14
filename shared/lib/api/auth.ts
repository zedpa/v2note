import { api } from "../api";

interface AuthResponse {
  user: { id: string; phone: string; displayName: string | null };
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(
  phone: string,
  password: string,
  deviceId: string,
  displayName?: string,
): Promise<AuthResponse> {
  return api.post("/api/v1/auth/register", {
    phone,
    password,
    deviceId,
    displayName,
  });
}

export async function loginUser(
  phone: string,
  password: string,
  deviceId: string,
): Promise<AuthResponse> {
  return api.post("/api/v1/auth/login", {
    phone,
    password,
    deviceId,
  });
}

export async function refreshToken(token: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  return api.post("/api/v1/auth/refresh", { refreshToken: token });
}

export async function getMe(): Promise<{
  user: { id: string; phone: string; displayName: string | null; createdAt: string };
  devices: Array<{ id: string; device_identifier: string; platform: string }>;
}> {
  return api.get("/api/v1/auth/me");
}
