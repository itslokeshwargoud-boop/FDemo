const API_BASE = import.meta.env.VITE_API_URL || '';

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...rest,
    headers,
    credentials: 'include',
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.error?.message || 'Request failed',
      data.error?.code || 'UNKNOWN',
      response.status
    );
  }

  return data.data as T;
}

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

// No-op kept for any lingering imports — safe to remove later
export function setAccessToken(_token: string | null) {}
export function getAccessToken(): string | null { return null; }
