// Shared HS256 JWT helpers for the Knowledge ↔ Hub SSO bridge.
// No external dependency: implements compact JWT manually.

export const ISSUER_HUB = "poulina-hub";
export const ISSUER_KNOWLEDGE = "poulina-knowledge";
export const AUDIENCE_HUB = "poulina-hub";
export const AUDIENCE_KNOWLEDGE = "poulina-knowledge";

// App-session audience used to mark Knowledge's local login token.
export const AUDIENCE_KNOWLEDGE_APP = "poulina-knowledge-app";

export const SSO_VERSION = Deno.env.get("SSO_BUILD_ID") ?? "2026-06-24.1";

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
  signature_valid: boolean;
  expired: boolean;
  issuer_ok: boolean;
  audience_ok: boolean;
  claims: SsoClaims | null;
  error?: string;
}

export async function verifyJwt(
  token: string,
  opts: { expectedIssuer: string; expectedAudience: string; maxAgeSec?: number },
  secret = getSecret(),
): Promise<VerifyResult> {
  const out: VerifyResult = {
    signature_valid: false,
    expired: false,
    issuer_ok: false,
    audience_ok: false,
    claims: null,
  };
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      out.error = "malformed token";
      return out;
    }
    const [h, p, s] = parts;
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
      return out;
    }
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p))) as SsoClaims;
    out.claims = claims;
    const now = Math.floor(Date.now() / 1000);
    out.expired = !claims.exp || claims.exp < now;
    if (opts.maxAgeSec && claims.iat && now - claims.iat > opts.maxAgeSec) out.expired = true;
    out.issuer_ok = claims.iss === opts.expectedIssuer;
    out.audience_ok = claims.aud === opts.expectedAudience;
    return out;
  } catch (e) {
    out.error = String((e as Error).message ?? e);
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
