import { describe, expect, it } from "vitest";

import type { SkillStatusEntry } from "@/lib/skills/types";
import {
  buildSkillMissingDetails,
  buildSkillReasons,
  groupSkillsBySource,
  hasInstallableMissingBinary,
  isBundledBlockedSkill,
  resolvePreferredInstallOption,
} from "@/lib/skills/presentation";

const createSkill = (overrides: Partial<SkillStatusEntry>): SkillStatusEntry => ({
  name: "skill",
  description: "",
  source: "openclaw-workspace",
  bundled: false,
  filePath: "/tmp/workspace/skill/SKILL.md",
  baseDir: "/tmp/workspace/skill",
  skillKey: "skill",
  always: false,
  disabled: false,
  blockedByAllowlist: false,
  eligible: true,
  requirements: { bins: [], anyBins: [], env: [], config: [], os: [] },
  missing: { bins: [], anyBins: [], env: [], config: [], os: [] },
  configChecks: [],
  install: [],
  ...overrides,
});

describe("skills presentation helpers", () => {
  it("groups skills by source with stable ordering", () => {
    const groups = groupSkillsBySource([
      createSkill({ name: "other", source: "custom-source" }),
      createSkill({ name: "installed", source: "openclaw-managed" }),
      createSkill({ name: "workspace", source: "openclaw-workspace" }),
      createSkill({ name: "bundled", source: "openclaw-bundled", bundled: true }),
      createSkill({ name: "extra", source: "openclaw-extra" }),
    ]);

    expect(groups.map((group) => group.id)).toEqual([
      "workspace",
      "built-in",
      "installed",
      "extra",
      "other",
    ]);
    expect(groups[0]?.skills.map((skill) => skill.name)).toEqual(["workspace"]);
    expect(groups[1]?.skills.map((skill) => skill.name)).toEqual(["bundled"]);
  });

  it("builds explicit missing detail lines", () => {
    const details = buildSkillMissingDetails(
      createSkill({
        eligible: false,
        missing: {
          bins: ["playwright"],
          anyBins: ["chromium", "chrome"],
          env: ["GITHUB_TOKEN"],
          config: ["browser.enabled"],
          os: ["linux"],
        },
      })
    );

    expect(details).toEqual([
      "Missing tools: playwright",
      "Missing one-of tools (install any): chromium | chrome",
      "Missing env vars (set in gateway env): GITHUB_TOKEN",
      "Missing config values (set in openclaw.json): browser.enabled",
      "Unsupported OS: linux",
    ]);
  });

  it("builds reasons from policy and missing requirements", () => {
    const reasons = buildSkillReasons(
      createSkill({
        eligible: false,
        disabled: true,
        blockedByAllowlist: true,
        missing: {
          bins: ["playwright"],
          anyBins: [],
          env: [],
          config: [],
          os: [],
        },
      })
    );

    expect(reasons).toEqual(["disabled", "blocked by allowlist", "missing tools"]);
  });

  it("detects bundled blocked skills", () => {
    expect(
      isBundledBlockedSkill(
        createSkill({
          source: "openclaw-bundled",
          bundled: true,
          eligible: false,
        })
      )
    ).toBe(true);
    expect(isBundledBlockedSkill(createSkill({ bundled: true, eligible: true }))).toBe(false);
  });

  it("detects installable missing binaries including anyBins overlap", () => {
    const skill = createSkill({
      eligible: false,
      missing: {
        bins: [],
        anyBins: ["chromium", "chrome"],
        env: [],
        config: [],
        os: [],
      },
      install: [
        {
          id: "install-chromium",
          kind: "download",
          label: "Install chromium",
          bins: ["chromium"],
        },
      ],
    });

    expect(hasInstallableMissingBinary(skill)).toBe(true);
    expect(resolvePreferredInstallOption(skill)?.id).toBe("install-chromium");
  });

  it("selects_install_option_that_matches_missing_bins", () => {
    const skill = createSkill({
      eligible: false,
      missing: {
        bins: ["gh"],
        anyBins: [],
        env: [],
        config: [],
        os: [],
      },
      install: [
        {
          id: "install-other",
          kind: "download",
          label: "Install other tool",
          bins: ["other"],
        },
        {
          id: "install-gh",
          kind: "brew",
          label: "Install gh",
          bins: ["gh"],
        },
      ],
    });

    expect(resolvePreferredInstallOption(skill)?.id).toBe("install-gh");
  });
});
