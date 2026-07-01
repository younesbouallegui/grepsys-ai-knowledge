import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export default function AuthSso() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signInFromSso } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get("code");
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
          let reason = data?.error ?? "SSO exchange failed";
          const context = (error as any)?.context;
          if (!data?.error && context?.json) {
            try {
              const body = await context.json();
              reason = body?.error ?? reason;
            } catch {
              reason = error?.message ?? reason;
            }
          } else if (!data?.error && error?.message) {
            reason = error.message;
          }
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
