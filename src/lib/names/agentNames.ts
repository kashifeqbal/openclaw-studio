export const normalizeAgentName = (input: string) => {
  return input.trim().replace(/\s+/g, "-");
};
