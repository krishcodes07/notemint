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

export interface DocumentResponse {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  status: "uploaded" | "extracting" | "generating" | "completed" | "failed";
  page_count: number | null;
  created_at: string;
}

export interface DocumentListResponse {
  items: DocumentResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface DocumentDeleteResponse {
  id: string;
  deleted: boolean;
  message: string;
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

  const isFormData = init?.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
  };

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...headers,
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
    let errorMessage = `Request failed with status ${response.status}.`;
    try {
      const errorJson = await response.json();
      if (errorJson && typeof errorJson.detail === "string") {
        errorMessage = errorJson.detail;
      }
    } catch {
      // Keep default error message
    }
    throw new ApiError(errorMessage, response.status);
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

/**
 * POST /api/v1/documents — uploads a PDF file with real upload progress tracking.
 */
export function uploadDocument(
  file: File,
  getSessionToken: GetSessionToken,
  onProgress?: (percent: number) => void,
): Promise<DocumentResponse> {
  return new Promise((resolve, reject) => {
    (async () => {
      try {
        const token = await getSessionToken();
        if (!token) {
          throw new UnauthorizedError("You must be signed in to upload documents.");
        }

        const formData = new FormData();
        formData.append("file", file);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE_URL}/api/v1/documents`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        if (onProgress) {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) {
              const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
              onProgress(percent);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status === 201 || xhr.status === 200) {
            try {
              const data = JSON.parse(xhr.responseText) as DocumentResponse;
              resolve(data);
            } catch {
              reject(new ApiError("Failed to parse server response", xhr.status));
            }
          } else if (xhr.status === 401) {
            reject(new UnauthorizedError());
          } else {
            let detail = `Upload failed with status ${xhr.status}`;
            try {
              const err = JSON.parse(xhr.responseText);
              if (err?.detail) detail = err.detail;
            } catch {
              // fallback
            }
            reject(new ApiError(detail, xhr.status));
          }
        };

        xhr.onerror = () => {
          reject(new BackendUnavailableError());
        };

        xhr.send(formData);
      } catch (err) {
        reject(err);
      }
    })();
  });
}

/**
 * GET /api/v1/documents — lists documents owned by the user.
 */
export function getDocuments(
  getSessionToken: GetSessionToken,
  params?: { limit?: number; offset?: number },
): Promise<DocumentListResponse> {
  const query = new URLSearchParams();
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  if (params?.offset !== undefined) query.set("offset", String(params.offset));
  const qs = query.toString() ? `?${query.toString()}` : "";

  return authenticatedRequest<DocumentListResponse>(
    `/api/v1/documents${qs}`,
    getSessionToken,
  );
}

/**
 * GET /api/v1/documents/{documentId} — gets document metadata.
 */
export function getDocument(
  documentId: string,
  getSessionToken: GetSessionToken,
): Promise<DocumentResponse> {
  return authenticatedRequest<DocumentResponse>(
    `/api/v1/documents/${documentId}`,
    getSessionToken,
  );
}

/**
 * DELETE /api/v1/documents/{documentId} — deletes document and stored file.
 */
export function deleteDocument(
  documentId: string,
  getSessionToken: GetSessionToken,
): Promise<DocumentDeleteResponse> {
  return authenticatedRequest<DocumentDeleteResponse>(
    `/api/v1/documents/${documentId}`,
    getSessionToken,
    { method: "DELETE" },
  );
}

/**
 * GET /api/v1/documents/{documentId}/file — streams the original PDF file as a Blob.
 */
export async function getDocumentFileBlob(
  documentId: string,
  getSessionToken: GetSessionToken,
): Promise<Blob> {
  const token = await getSessionToken();
  if (!token) {
    throw new UnauthorizedError("You must be signed in to access this document file.");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1/documents/${documentId}/file`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new BackendUnavailableError();
  }

  if (response.status === 401) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    let detail = `Failed to retrieve document file (${response.status})`;
    try {
      const err = await response.json();
      if (err?.detail) detail = err.detail;
    } catch {
      // fallback
    }
    throw new ApiError(detail, response.status);
  }

  return response.blob();
}

export const apiConfig = {
  baseUrl: API_BASE_URL,
} as const;
