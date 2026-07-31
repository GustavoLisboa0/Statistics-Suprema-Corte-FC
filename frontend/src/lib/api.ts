const API_BASE = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE) {
  throw new Error(
    "VITE_API_BASE_URL nao configurado. Defina a URL publica do backend no .env local e na Vercel.",
  );
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const fallback = `Erro ${response.status}`;
    let message = fallback;
    try {
      const body = (await response.json()) as {
        detail?: unknown;
        message?: unknown;
        error?: unknown;
      };
      const detail = body.detail ?? body.message ?? body.error;
      if (typeof detail === "string") {
        message = detail;
      } else if (detail && typeof detail === "object") {
        const nested = detail as { message?: unknown; detail?: unknown };
        if (typeof nested.message === "string") {
          message = nested.message;
        } else if (typeof nested.detail === "string") {
          message = nested.detail;
        } else {
          message = JSON.stringify(detail);
        }
      }
    } catch {
      // corpo não era JSON, mantém a mensagem genérica
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: (path: string) => request<void>(path, { method: "DELETE" }),
};
