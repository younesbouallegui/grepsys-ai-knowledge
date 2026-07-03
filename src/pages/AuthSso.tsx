import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

function getRawSsoCode(): string | null {
  const query = window.location.search.startsWith("?") ? window.location.search.slice(1) : window.location.search;
  for (const part of query.split("&")) {
    const [key, ...valueParts] = part.split("=");
    if (decodeURIComponent(key) === "code") {
      const rawValue = valueParts.join("=");
      return rawValue ? decodeURIComponent(rawValue) : "";
    }
  }
  return null;
}

async function readFunctionError(error: any, fallback = "SSO exchange failed") {
  const context = error?.context;
  if (context?.json) {
    try {
      const body = await context.json();
      if (Array.isArray(body?.validation?.failure_reasons) && body.validation.failure_reasons.length) {
        return body.validation.failure_reasons.join("; ");
      }
      return body?.error ?? fallback;
    } catch {
      return error?.message ?? fallback;
    }
  }
  return error?.message ?? fallback;
}

export default function AuthSso() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signInFromSso } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = getRawSsoCode() ?? params.get("code");
    if (!token) {
      setError("Missing SSO code");
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("sso-accept", {
          body: { code: token },
        });
        if (error || !data?.session_token) {
          const reason = data?.validation?.failure_reasons?.join("; ") ?? data?.error ?? await readFunctionError(error);
          setError(reason);
          return;
        }
        signInFromSso(data);
        navigate("/", { replace: true });
      } catch (e: any) {
        setError(e?.message ?? "SSO exchange failed");
      }
    })();
  }, [params, navigate, signInFromSso]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      {error ? (
        <div className="max-w-md text-center space-y-4 px-6">
          <h1 className="text-xl font-semibold">Sign-in from Hub failed</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      ) : (
        <div aria-hidden="true" />
      )}
    </div>
  );
}
