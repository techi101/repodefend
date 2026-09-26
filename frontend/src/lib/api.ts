// One fetch wrapper for the whole app: JSON in/out, cookies included, and
// FastAPI's {"detail": ...} errors turned into readable messages.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Options = Omit<RequestInit, "body"> & { json?: unknown };

export async function api<T>(path: string, { json, headers, ...init }: Options = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const d = data?.detail;
    // 422s from FastAPI carry a list of field errors; show the first.
    const msg = typeof d === "string" ? d : Array.isArray(d) ? d[0]?.msg : null;
    throw new ApiError(res.status, msg ?? `Request failed (HTTP ${res.status})`);
  }
  return data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
