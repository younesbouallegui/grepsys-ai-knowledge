import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const change = (lng: string) => i18n.changeLanguage(lng);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Globe className="h-4 w-4" />
          <span className="text-xs uppercase tracking-wider">{i18n.language.slice(0, 2)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => change("en")}>{t("common.english")}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => change("fr")}>{t("common.french")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
