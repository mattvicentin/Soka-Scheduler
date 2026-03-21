/**
 * Client-side API helpers. Uses cookies for auth (same-origin).
 */
const API_BASE = "";

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<{ data?: T; error?: string; details?: unknown; status: number }> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const text = await res.text();
  let data: T | undefined;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      return { error: text || "Request failed", status: res.status };
    }
  }
  if (!res.ok) {
    const errBody = data as { error?: string; details?: unknown } | undefined;
    return {
      error: errBody?.error ?? res.statusText,
      details: errBody?.details,
      status: res.status,
    };
  }
  return { data: data as T, status: res.status };
}
