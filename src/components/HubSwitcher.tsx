import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

async function readFunctionError(error: any, fallback: string) {
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

function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const [, payload] = token.split(".");
    if (!payload) return true;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded));
    if (typeof claims?.exp !== "number") return false;
    // treat as expired 5s early to avoid boundary races
    return claims.exp <= Math.floor(Date.now() / 1000) + 5;
  } catch {
    return true;
  }
}

export function HubSwitcher() {
  const { ssoSessionToken, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const requireResignIn = async () => {
    toast.error("Your session has expired. Please sign in again to continue to Grepsys AI Hub.");
    await signOut();
  };

  const go = async () => {
    if (!ssoSessionToken) {
      toast.error("Please sign in via Hub to enable SSO handoff.");
      return;
    }
    if (isTokenExpired(ssoSessionToken)) {
      await requireResignIn();
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("sso-issue", {
        body: { session_token: ssoSessionToken },
      });
      if (error || !data?.redirect_url) {
        const message = data?.error ?? await readFunctionError(error, "Could not start handoff to Grepsys AI Hub.");
        setBusy(false);
        if (/expired/i.test(message)) {
          await requireResignIn();
        } else {
          toast.error(message);
        }
        return;
      }
      document.body.style.transition = "opacity 200ms ease";
      document.body.style.opacity = "0";
      setTimeout(() => {
        window.location.href = data.redirect_url;
      }, 180);
    } catch {
      toast.error("Could not start handoff to Grepsys AI Hub.");
      setBusy(false);
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            onClick={go}
            disabled={busy}
            className="gap-2 font-medium"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Grepsys AI Hub</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Switch to AI Hub — stay logged in</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
