const API_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is not set');
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiFetchOptions = RequestInit & {
  skipJsonContentType?: boolean;
  skipAuthRefresh?: boolean;
};

let refreshPromise: Promise<void> | null = null;

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => null);

  const message =
    typeof payload === 'object' && payload !== null && 'message' in payload
      ? Array.isArray((payload as { message: unknown }).message)
        ? (payload as { message: string[] }).message.join(', ')
        : String((payload as { message: unknown }).message)
      : 'Request failed';

  return new ApiError(message, response.status, payload);
}

async function refreshAuthSession() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw await parseApiError(response);
        }
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

function buildHeaders(options: ApiFetchOptions) {
  const isFormData = options.body instanceof FormData;

  return {
    ...(isFormData || options.skipJsonContentType
      ? {}
      : { 'Content-Type': 'application/json' }),
    ...options.headers,
  };
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: buildHeaders(options),
  });

  if (response.status === 401 && !options.skipAuthRefresh) {
    await refreshAuthSession();

    const retryResponse = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: buildHeaders(options),
    });

    if (!retryResponse.ok) {
      throw await parseApiError(retryResponse);
    }

    if (retryResponse.status === 204) {
      return undefined as T;
    }

    return retryResponse.json() as Promise<T>;
  }

  if (!response.ok) {
    throw await parseApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}
