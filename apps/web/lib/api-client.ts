// scriora-web — API Client
// Consumes scriora-api exclusively — never imports scriora-core directly
// Reference: scriora-docs/architecture/SCRIORA_REPOSITORY_CONTRACT_MATRIX.md
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export async function apiClient<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { code: 'ERR_UNKNOWN' } }));
    throw error;
  }
  return res.json() as Promise<T>;
}
