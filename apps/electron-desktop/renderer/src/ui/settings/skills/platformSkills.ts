import type { SkillId } from "./useSkillsStatus";

type SupportedPlatform = "darwin" | "win32" | "linux";

/**
 * Skills that only work on specific platforms.
 * If a skill is NOT listed here, it's available everywhere.
 */
const PLATFORM_RESTRICTED_SKILLS: Partial<Record<SkillId, SupportedPlatform[]>> = {
  "apple-notes": ["darwin"],
  "apple-reminders": ["darwin"],
};

export function isSkillAvailable(skillId: SkillId, platform: NodeJS.Platform): boolean {
  const allowed = PLATFORM_RESTRICTED_SKILLS[skillId];
  if (!allowed) return true;
  return allowed.includes(platform as SupportedPlatform);
}

export function filterSkillsForPlatform<T extends { id: SkillId }>(
  skills: T[],
  platform: NodeJS.Platform
): T[] {
  return skills.filter((s) => isSkillAvailable(s.id, platform));
}
