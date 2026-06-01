/**
 * Server-side utility for proxying requests to the FastAPI backend.
 *
 * Used by Next.js API routes under pages/api/reputation-os/[tenant]/*.
 * The backend URL defaults to http://localhost:8000 and can be overridden
 * via the BACKEND_URL environment variable.
 */

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

/**
 * Envelope shape returned by every Reputation OS backend endpoint.
 */
interface BackendEnvelope<T = unknown> {
  tenant_id: string;
  timestamp: string;
  data: T;
  insights: string[];
}

/**
 * Fetch data from the FastAPI backend, unwrap the standard envelope,
 * and return the `data` field.
 *
 * @param path  API path **after** `/api/v1` — e.g. `/reputation-os/anil_ravipudi/score`
 * @returns     The `data` field from the backend envelope.
 * @throws      Error with a descriptive message when the backend is unreachable
 *              or returns a non-2xx status.
 */
export async function fetchFromBackend<T>(path: string): Promise<{ data: T; insights: string[] }> {
  const url = `${BACKEND_URL}/api/v1${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown network error";
    throw new Error(`Backend unreachable at ${url}: ${message}`);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(`Backend error ${res.status}: ${detail}`);
  }

  const envelope = (await res.json()) as BackendEnvelope<T>;

  if (envelope.data == null) {
    throw new Error("Backend returned an empty data payload");
  }

  return { data: envelope.data, insights: envelope.insights ?? [] };
}
