import type { ReactNode } from "react";

type LockedDataRegionProps = {
  children: ReactNode;
  provider: "Google" | "GitHub";
};

export function LockedDataRegion({ children, provider }: LockedDataRegionProps) {
  return (
    <div className="locked-region" aria-label={`Requires signing in with ${provider}`}>
      <div className="locked-region__content" aria-hidden="true" inert>
        {children}
      </div>
      <div className="locked-region__overlay">
        <span>Requires signing in with {provider}</span>
      </div>
    </div>
  );
}
