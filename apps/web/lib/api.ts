const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `HTTP ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}

export function apiGet<T>(path: string, token: string): Promise<T> {
  return apiRequest<T>(path, { headers: { Authorization: `Bearer ${token}` } });
}

export function apiPost<T>(path: string, token: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export function apiPatch<T>(path: string, token: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export function apiDelete(path: string, token: string): Promise<void> {
  return apiRequest<void>(path, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
