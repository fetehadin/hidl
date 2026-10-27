import type { ReactNode } from "react";

/**
 * A paper envelope with a wax seal. `state` controls the seal and flap:
 * sealed (wax intact), ready (seal glowing), opened (flap up, seal gone).
 */
export function Envelope({
  state,
  initial,
  children,
  className = "",
}: {
  state: "sealed" | "ready" | "opened";
  initial: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`envelope ${className}`} data-state={state}>
      <div className="envelope-flap" aria-hidden />
      {state !== "opened" && (
        <div className="envelope-seal" aria-hidden>
          <span>{initial}</span>
        </div>
      )}
      <div className="envelope-content">{children}</div>
    </div>
  );
}
