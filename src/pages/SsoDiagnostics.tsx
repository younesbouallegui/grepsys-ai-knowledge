import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

const FUNCTIONS_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co`;

export default function SsoDiagnostics() {
  const { isAdmin, loading } = useAuth();
  const [health, setHealth] = useState<any>(null);
  const [token, setToken] = useState("");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [healthErr, setHealthErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${FUNCTIONS_BASE}/sso-health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setHealthErr(String(e?.message ?? e)));
  }, []);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const inspect = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("sso-diagnostics", {
        body: { token: token.trim() },
      });
      setResult(error ? { error: error.message } : data);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">SSO Diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          Health and token-validation tools for the Knowledge ↔ Hub bridge.
        </p>
      </div>

      <Card className="p-4">
        <h2 className="font-medium mb-2">sso-health</h2>
        {healthErr ? (
          <p className="text-sm text-destructive">{healthErr}</p>
        ) : (
          <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
            {health ? JSON.stringify(health, null, 2) : "Loading…"}
          </pre>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-medium">Inspect a token (read-only)</h2>
        <Textarea
          placeholder="Paste an SSO JWT…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          rows={4}
        />
        <Button onClick={inspect} disabled={busy || !token.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Validate"}
        </Button>
        {result && (
          <pre className="text-xs overflow-x-auto whitespace-pre-wrap rounded bg-muted p-3">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </Card>
    </div>
  );
}
