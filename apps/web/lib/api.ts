const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  path: string;
  body: unknown;
  constructor(message: string, status: number, path: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...options?.headers,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    console.error("[api] network error", { path, error: msg });
    throw new ApiError(`Network error: ${msg}`, 0, path, null);
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const isEmpty = res.status === 204 || res.headers.get("content-length") === "0";

  if (!res.ok) {
    let body: unknown = null;
    if (!isEmpty) {
      body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);
    }
    const message =
      (body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : null) ?? (typeof body === "string" && body ? body : `HTTP ${res.status}`);
    console.error("[api] request failed", { path, status: res.status, body });
    throw new ApiError(message, res.status, path, body);
  }

  if (isEmpty) return undefined as T;
  if (isJson) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

function jsonBody(data: unknown): { body: string; headers: Record<string, string> } {
  return {
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  };
}

export function apiGet<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  return apiRequest<T>(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options?.headers },
  });
}

export function apiPost<T>(path: string, token: string, data?: unknown, options?: RequestInit): Promise<T> {
  const { body, headers } = data !== undefined ? jsonBody(data) : { body: undefined, headers: {} };
  return apiRequest<T>(path, {
    ...options,
    method: "POST",
    body,
    headers: { Authorization: `Bearer ${token}`, ...headers, ...options?.headers },
  });
}

export function apiPatch<T>(path: string, token: string, data?: unknown, options?: RequestInit): Promise<T> {
  const { body, headers } = data !== undefined ? jsonBody(data) : { body: undefined, headers: {} };
  return apiRequest<T>(path, {
    ...options,
    method: "PATCH",
    body,
    headers: { Authorization: `Bearer ${token}`, ...headers, ...options?.headers },
  });
}

export function apiDelete<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  return apiRequest<T>(path, {
    ...options,
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, ...options?.headers },
  });
}
