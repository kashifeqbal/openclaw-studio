import { useMemo } from "react";

import { buildAvatarDataUrl } from "@/lib/avatars/multiavatar";

type AgentAvatarProps = {
  seed: string;
  name: string;
  size?: number;
  isSelected?: boolean;
};

export const AgentAvatar = ({
  seed,
  name,
  size = 112,
  isSelected = false,
}: AgentAvatarProps) => {
  const src = useMemo(() => buildAvatarDataUrl(seed), [seed]);

  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-full border border-border bg-card shadow-sm ${isSelected ? "agent-avatar-selected" : ""}`}
      style={{ width: size, height: size }}
    >
      <img
        className="h-full w-full select-none pointer-events-none"
        src={src}
        alt={`Avatar for ${name}`}
        draggable={false}
      />
    </div>
  );
};
