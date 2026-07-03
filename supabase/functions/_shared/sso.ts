// Shared HS256 JWT helpers for the Knowledge ↔ Hub SSO bridge.
// No external dependency: implements compact JWT manually.

export const ISSUER_HUB = "hub";
export const ISSUER_KNOWLEDGE = "knowledge";
export const AUDIENCE_HUB = "hub";
export const AUDIENCE_KNOWLEDGE = "knowledge";

// App-session audience used to mark Knowledge's local login token.
export const AUDIENCE_KNOWLEDGE_APP = "knowledge-app";

export const SSO_VERSION = Deno.env.get("SSO_BUILD_ID") ?? "2026-07-03.2";

export interface SsoClaims {
  iss: string;
  aud: string;
  sub: string;                // zabbix user id
  username: string;
  display_name: string;
  email?: string;
  roles: string[];
  nonce: string;
  iat: number;
  exp: number;
}

function b64url(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlStr(input: string): string {
  return b64url(new TextEncoder().encode(input));
}
function b64urlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const s = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function getSecret(): string {
  const s = Deno.env.get("SSO_SHARED_SECRET");
  if (!s) throw new Error("SSO_SHARED_SECRET is not configured");
  return s;
}

export async function signJwt(payload: Record<string, unknown>, secret = getSecret()): Promise<string> {
  const header = b64urlStr(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64urlStr(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

export interface VerifyResult {
  alg_ok: boolean;
  signature_valid: boolean;
  expired: boolean;
  iat_ok: boolean;
  issuer_ok: boolean;
  audience_ok: boolean;
  nonce_present: boolean;
  expected_issuer: string;
  expected_audience: string;
  actual_issuer: string | null;
  actual_audience: string | null;
  token_length: number;
  token_segments: number;
  segment_lengths: number[];
  token_sha256_prefix: string;
  failure_reasons: string[];
  claims: SsoClaims | null;
  error?: string;
}

export async function sha256Prefix(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export async function verifyJwt(
  token: string,
  opts: { expectedIssuer: string; expectedAudience: string; maxAgeSec?: number; requireNonce?: boolean },
  secret = getSecret(),
): Promise<VerifyResult> {
  const parts = token.split(".");
  const out: VerifyResult = {
    alg_ok: false,
    signature_valid: false,
    expired: false,
    iat_ok: false,
    issuer_ok: false,
    audience_ok: false,
    nonce_present: false,
    expected_issuer: opts.expectedIssuer,
    expected_audience: opts.expectedAudience,
    actual_issuer: null,
    actual_audience: null,
    token_length: token.length,
    token_segments: parts.length,
    segment_lengths: parts.map((p) => p.length),
    token_sha256_prefix: await sha256Prefix(token),
    failure_reasons: [],
    claims: null,
  };
  try {
    if (token.includes(" ")) out.failure_reasons.push("token contains spaces; possible '+' decoded as space");
    if (parts.length !== 3) {
      out.error = "malformed token";
      out.failure_reasons.push("malformed JWT");
      return out;
    }
    const [h, p, s] = parts;
    let header: Record<string, unknown>;
    try {
      header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
    } catch {
      out.error = "malformed JWT header";
      out.failure_reasons.push("malformed JWT header");
      return out;
    }
    out.alg_ok = header.alg === "HS256";
    if (!out.alg_ok) out.failure_reasons.push(`algorithm mismatch: expected HS256, got ${String(header.alg ?? "missing")}`);

    let decodedClaims: SsoClaims | null = null;
    try {
      decodedClaims = JSON.parse(new TextDecoder().decode(b64urlDecode(p))) as SsoClaims;
      out.claims = decodedClaims;
      out.actual_issuer = decodedClaims.iss ?? null;
      out.actual_audience = decodedClaims.aud ?? null;
      out.issuer_ok = decodedClaims.iss === opts.expectedIssuer;
      out.audience_ok = decodedClaims.aud === opts.expectedAudience;
      out.nonce_present = typeof decodedClaims.nonce === "string" && decodedClaims.nonce.length > 0;
    } catch {
      out.error = "malformed JWT payload";
      out.failure_reasons.push("malformed JWT payload");
      return out;
    }

    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    out.signature_valid = ok;
    if (!ok) {
      out.error = "bad signature";
      out.failure_reasons.push("signature mismatch");
      return out;
    }
    const claims = decodedClaims;
    const now = Math.floor(Date.now() / 1000);
    out.expired = typeof claims.exp !== "number" || claims.exp < now;
    if (out.expired) out.failure_reasons.push("expired token");
    out.iat_ok = typeof claims.iat === "number" && claims.iat <= now + 60;
    if (!out.iat_ok) out.failure_reasons.push(typeof claims.iat === "number" ? "iat is in the future" : "missing iat");
    if (opts.maxAgeSec && claims.iat && now - claims.iat > opts.maxAgeSec) {
      out.expired = true;
      out.failure_reasons.push("iat too old for SSO exchange window");
    }
    if (!out.issuer_ok) out.failure_reasons.push(`issuer mismatch: expected ${opts.expectedIssuer}, got ${String(claims.iss ?? "missing")}`);
    if (!out.audience_ok) out.failure_reasons.push(`audience mismatch: expected ${opts.expectedAudience}, got ${String(claims.aud ?? "missing")}`);
    if (opts.requireNonce && !out.nonce_present) out.failure_reasons.push("missing nonce");
    return out;
  } catch (e) {
    out.error = String((e as Error).message ?? e);
    out.failure_reasons.push(out.error);
    return out;
  }
}

export function newNonce(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function ssoCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

export const ssoCors = ssoCorsHeaders();

export function jsonResponse(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...ssoCorsHeaders(req), "Content-Type": "application/json" },
  });
}
