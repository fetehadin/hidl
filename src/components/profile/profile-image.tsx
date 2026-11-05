/* eslint-disable @next/next/no-img-element -- a tiny public Storage file; next/image would add nothing */
import { Avatar } from "@/components/avatar";
import { type AvatarConfig, DEFAULT_AVATAR } from "@/lib/avatar";

/**
 * Someone's face around the app: their uploaded picture if they have one, else their buddy
 * (else the default buddy). `pictureSrc` is a full URL (see pictureUrl in src/lib/profile-rules.ts).
 */
export function ProfileImage({
  pictureSrc,
  avatar,
  size,
  label,
  className = "",
}: {
  pictureSrc: string | null;
  avatar: AvatarConfig | null;
  size: number;
  label?: string;
  className?: string;
}) {
  if (pictureSrc) {
    return (
      <img
        src={pictureSrc}
        alt={label ?? ""}
        width={size}
        height={size}
        loading="lazy"
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return <Avatar config={avatar ?? DEFAULT_AVATAR} size={size} label={label} className={`rounded-full ${className}`} />;
}
