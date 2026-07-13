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

export function HubSwitcher() {
  const { ssoSessionToken } = useAuth();
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (!ssoSessionToken) {
      toast.error("Please sign in via Hub to enable SSO handoff.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("sso-issue", {
        body: { session_token: ssoSessionToken },
      });
      if (error || !data?.redirect_url) {
        toast.error(data?.error ?? await readFunctionError(error, "Could not start handoff to Poulina AI Hub."));
        setBusy(false);
        return;
      }
      document.body.style.transition = "opacity 200ms ease";
      document.body.style.opacity = "0";
      setTimeout(() => {
        window.location.href = data.redirect_url;
      }, 180);
    } catch {
      toast.error("Could not start handoff to Poulina AI Hub.");
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
            <span className="hidden sm:inline">Poulina AI Hub</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Switch to AI Hub — stay logged in</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
