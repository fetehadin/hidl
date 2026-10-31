import type { SVGProps } from "react";
import {
  BriefcaseIcon,
  CakeIcon,
  ExamIcon,
  FlagIcon,
  GraduationIcon,
  PlaneIcon,
  RingsIcon,
  SproutIcon,
} from "@/components/icons";
import type { CountdownKind } from "@/lib/countdown-kinds";

const ICONS = {
  exam: ExamIcon,
  graduation: GraduationIcon,
  birthday: CakeIcon,
  wedding: RingsIcon,
  work: BriefcaseIcon,
  trip: PlaneIcon,
  life: SproutIcon,
  deadline: FlagIcon,
} satisfies Record<CountdownKind, unknown>;

export function KindIcon({ kind, ...props }: { kind: CountdownKind } & SVGProps<SVGSVGElement>) {
  const Icon = ICONS[kind];
  return <Icon {...props} />;
}

/** The kind's icon in a mint circle, like the dashboard stat chips. */
export function KindBadge({ kind, size = 44 }: { kind: CountdownKind; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-mint text-teal"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <KindIcon kind={kind} width={size * 0.55} height={size * 0.55} />
    </span>
  );
}
