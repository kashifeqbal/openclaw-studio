const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export const isStudioDomainIntentModeEnabled = (): boolean => {
  const raw = process.env.NEXT_PUBLIC_STUDIO_DOMAIN_API_MODE?.trim().toLowerCase() ?? "";
  if (!raw) return true;
  return !FALSE_VALUES.has(raw);
};
