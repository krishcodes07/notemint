const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:8000";

export interface HealthResponse {
  status: string;
  service: string;
}

export interface MeResponse {
  user_id: string;
  authenticated: boolean;
}

export interface UserProfileResponse {
  clerk_user_id: string;
  display_name: string | null;
  email: string | null;
  created_at: string;
}

/** Returns the current Clerk session token, or null when signed out. */
export type GetSessionToken = () => Promise<string | null>;

export class ApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** The backend could not be reached at all (network / server down). */
export class BackendUnavailableError extends ApiError {
  constructor(message = "Backend is unreachable. Make sure the API server is running.") {
    super(message);
    this.name = "BackendUnavailableError";
  }
}

/** The backend rejected the session token (missing, expired, or invalid). */
export class UnauthorizedError extends ApiError {
  constructor(
    message = "Your session is invalid or has expired. Please sign in again.",
  ) {
    super(message, 401);
    this.name = "UnauthorizedError";
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  options?: { token?: string },
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(options?.token
          ? { Authorization: `Bearer ${options.token}` }
          : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new BackendUnavailableError();
  }

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}.`, response.status);
  }

  return (await response.json()) as T;
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/v1/health");
}

/**
 * Perform an authenticated request. Attaches `Authorization: Bearer <token>`
 * using the provided session-token getter (Clerk's `getToken`). Tokens are
 * never stored — they live in Clerk's session and are fetched on demand.
 */
export async function authenticatedRequest<T>(
  path: string,
  getSessionToken: GetSessionToken,
  init?: RequestInit,
): Promise<T> {
  const token = await getSessionToken();
  if (!token) {
    throw new UnauthorizedError("You must be signed in to make this request.");
  }
  return request<T>(path, init, { token });
}

/** GET /api/v1/auth/me — returns the backend-verified identity. */
export function getMe(getSessionToken: GetSessionToken): Promise<MeResponse> {
  return authenticatedRequest<MeResponse>("/api/v1/auth/me", getSessionToken);
}

/**
 * GET /api/v1/users/me — returns (and creates if first visit) the signed-in
 * user's application profile from the database.
 */
export function getUserProfile(
  getSessionToken: GetSessionToken,
): Promise<UserProfileResponse> {
  return authenticatedRequest<UserProfileResponse>(
    "/api/v1/users/me",
    getSessionToken,
  );
}

export const apiConfig = {
  baseUrl: API_BASE_URL,
} as const;
