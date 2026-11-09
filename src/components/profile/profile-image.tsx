import { Avatar } from "@/components/avatar";
import { type AvatarConfig, DEFAULT_AVATAR } from "@/lib/avatar";

/** Someone's face around the app: their buddy, or Hidi's default buddy if they haven't made one. */
export function ProfileImage({
  avatar,
  size,
  label,
  className = "",
}: {
  avatar: AvatarConfig | null;
  size: number;
  label?: string;
  className?: string;
}) {
  return <Avatar config={avatar ?? DEFAULT_AVATAR} size={size} label={label} className={`rounded-full ${className}`} />;
}
