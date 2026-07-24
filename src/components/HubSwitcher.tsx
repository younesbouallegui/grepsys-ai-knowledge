import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const HUB_URL = "https://grepsysaihub.younesblg.com/";

export function HubSwitcher() {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            asChild
            className="gap-2 font-medium"
          >
            <a href={HUB_URL}>
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Grepsys AI Hub</span>
            </a>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Go to Grepsys AI Hub</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
