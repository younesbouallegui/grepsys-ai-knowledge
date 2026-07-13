import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { SkillLevel, levelColor } from "@/lib/skill";

interface Props {
  level: SkillLevel;
  className?: string;
  showIcon?: boolean;
}

export function SkillBadge({ level, className, showIcon = true }: Props) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        levelColor[level],
        className,
      )}
    >
      {showIcon && level === "production_ready" && <ShieldCheck className="h-3 w-3" />}
      {t(`skills.levels.${level}`)}
    </span>
  );
}
