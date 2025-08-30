/*
  Lightweight fetch wrapper with:
  - Base URL detection (Vite dev proxy or VITE_API_BASE)
  - Typed helpers (apiGet/apiPost/apiPut/apiDelete)
  - ETag caching for GET (If-None-Match + 304 handling)
  - Timeouts, abort support, simple retries for transient errors
  - Structured ApiError with status & payload
  - track() helper to POST /api/events with Idempotency-Key
*/

export type CacheMode = "default" | "no-store" | "prefer-cache";

export interface FetcherOptions {
  signal?: AbortSignal;
  timeoutMs?: number; // default 10000
  retries?: number; // default: GET=2, others=0
  cache?: CacheMode; // default "default"
  headers?: Record<string, string>;
  // For non-GET
  body?: unknown;
  // Forwarded to fetch for background beacons like track()
  keepalive?: boolean;
}

export class ApiError<T = unknown> extends Error {
  status: number;
  payload?: T;
  constructor(message: string, status: number, payload?: T) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

const BASE = (import.meta as any).env?.VITE_API_BASE?.replace(/\/$/, "") ?? ""; // empty means relative -> Vite proxy

const etagKey = (url: string) => `etag:${url}`;
const bodyKey = (url: string) => `cache:${url}`;

function getCached(url: string): { etag?: string; body?: any } {
  try {
    const e = localStorage.getItem(etagKey(url)) || undefined;
    const b = localStorage.getItem(bodyKey(url));
    return { etag: e, body: b ? JSON.parse(b) : undefined };
  } catch {
    return { etag: undefined, body: undefined };
  }
}

function setCached(url: string, etag: string | null, body: any) {
  try {
    if (etag) localStorage.setItem(etagKey(url), etag);
    if (body !== undefined) localStorage.setItem(bodyKey(url), JSON.stringify(body));
  } catch {
    // ignore quota errors
  }
}

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${BASE}${path}`;
}

function mergeSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  if (!a) return b;
  if (!b) return a;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (a.aborted || b.aborted) {
    ctrl.abort();
  } else {
    a.addEventListener("abort", onAbort);
    b.addEventListener("abort", onAbort);
  }
  return ctrl.signal;
}

async function delay(ms: number) {
  await new Promise((res) => setTimeout(res, ms));
}

async function request<T>(method: string, path: string, opts: FetcherOptions = {}): Promise<T> {
  const url = buildUrl(path);
  const isGet = method === "GET";
  const cache = opts.cache ?? "default";
  const retries = opts.retries ?? (isGet ? 2 : 0);
  const timeoutMs = opts.timeoutMs ?? 10000;

  const { etag, body: cachedBody } = isGet && cache !== "no-store" ? getCached(url) : { etag: undefined, body: undefined } as any;

  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= retries) {
    const ctrl = new AbortController();
    const signal = mergeSignals(ctrl.signal, opts.signal);
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(opts.headers || {}),
    };
    if (!isGet) headers["Content-Type"] = headers["Content-Type"] || "application/json";
    if (isGet && cache !== "no-store" && etag) headers["If-None-Match"] = etag;

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: isGet ? undefined : (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body ?? {})),
        signal,
        keepalive: opts.keepalive,
        credentials: "same-origin",
      });
      clearTimeout(timer);

      // 304 Not Modified -> return cached
      if (isGet && res.status === 304 && cachedBody !== undefined) {
        return cachedBody as T;
      }

      const ct = res.headers.get("content-type") || "";
      const isJson = ct.includes("application/json");
      const payload = isJson ? await res.json().catch(() => undefined) : await res.text();

      if (!res.ok) {
        // Retry on transient 502/503/504
        if (isGet && [502,503,504].includes(res.status) && attempt < retries) {
          const backoff = 300 * Math.pow(2, attempt) + Math.floor(Math.random()*200);
          await delay(backoff);
          attempt += 1;
          continue;
        }
        throw new ApiError(typeof payload === "string" ? payload : (payload?.message || "Request failed"), res.status, payload);
      }

      // Success
      const freshEtag = res.headers.get("etag");
      if (isGet && cache !== "no-store") setCached(url, freshEtag, payload);

      // Some 204 endpoints may return no body
      return (payload as T);
    } catch (err: any) {
      clearTimeout(timer);
      // Retry network/abort errors for GET
      const isAbort = err?.name === "AbortError";
      const isNetwork = err instanceof TypeError && !isAbort;
      if (isGet && (isAbort || isNetwork) && attempt < retries) {
        const backoff = 300 * Math.pow(2, attempt) + Math.floor(Math.random()*200);
        await delay(backoff);
        attempt += 1;
        lastErr = err;
        continue;
      }
      lastErr = err;
      break;
    }
  }

  if (lastErr instanceof ApiError) throw lastErr;
  if (lastErr instanceof Error) throw new ApiError(lastErr.message, 0);
  throw new ApiError("Unknown error", 0);
}

// -------- Public, typed helpers --------
export async function apiGet<T>(path: string, opts?: Omit<FetcherOptions, "body">): Promise<T> {
  return request<T>("GET", path, opts);
}

export async function apiPost<T>(path: string, body?: unknown, opts: Omit<FetcherOptions, "body"> = {}): Promise<T> {
  return request<T>("POST", path, { ...opts, body });
}

export async function apiPut<T>(path: string, body?: unknown, opts: Omit<FetcherOptions, "body"> = {}): Promise<T> {
  return request<T>("PUT", path, { ...opts, body });
}

export async function apiDelete<T>(path: string, body?: unknown, opts: Omit<FetcherOptions, "body"> = {}): Promise<T> {
  return request<T>("DELETE", path, { ...opts, body });
}

// -------- Events / telemetry --------
export async function track(event: string, payload: Record<string, unknown> = {}, opts: { idempotencyKey?: string } = {}) {
  const ts = new Date().toISOString();
  const body = { event, ts, ...payload };
  const key = opts.idempotencyKey || (typeof crypto !== "undefined" && (crypto as any).randomUUID ? (crypto as any).randomUUID() : `evt:${event}:${ts}`);
  try {
    await request("POST", "/api/events", {
      body,
      headers: { "Idempotency-Key": key },
      keepalive: true,
      timeoutMs: 4000,
      retries: 0,
      cache: "no-store",
    });
  } catch {
    // swallow telemetry errors
  }
}

// Utility to help build query strings safely
export function withQuery(path: string, params: Record<string, string | number | boolean | undefined | null>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    usp.append(k, String(v));
  });
  const qs = usp.toString();
  return qs ? `${path}${path.includes("?") ? "&" : "?"}${qs}` : path;
}
