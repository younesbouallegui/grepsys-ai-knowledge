export type SkillLevel = "beginner" | "intermediate" | "advanced" | "production_ready";

export function scoreToLevel(score: number): SkillLevel {
  if (score >= 90) return "production_ready";
  if (score >= 75) return "advanced";
  if (score >= 50) return "intermediate";
  return "beginner";
}

export const levelOrder: Record<SkillLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
  production_ready: 3,
};

export function highestLevel(a: SkillLevel, b: SkillLevel): SkillLevel {
  return levelOrder[a] >= levelOrder[b] ? a : b;
}

export const levelColor: Record<SkillLevel, string> = {
  beginner: "bg-muted text-muted-foreground",
  intermediate: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  advanced: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  production_ready: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
};
