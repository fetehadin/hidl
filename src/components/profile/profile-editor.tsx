"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import { type ProfileFormState, preparePictureUpload, removeProfilePicture, saveProfile, setProfilePicture } from "@/actions/profile";
import type { AvatarConfig } from "@/lib/avatar";
import { processProfilePicture } from "@/lib/image";
import { DISPLAY_NAME_MAX, PICTURE_EDGE, pictureUrl } from "@/lib/profile-rules";
import { publicEnv } from "@/lib/public-env";
import { createClient } from "@/lib/supabase/client";
import { ProfileImage } from "./profile-image";

/**
 * The public side of an account: a display name, a picture (an uploaded photo, or the buddy),
 * and whether to appear on the leaderboard. Shown on /account.
 */
export function ProfileEditor({
  displayName,
  picturePath,
  avatar,
  showOnLeaderboard,
}: {
  displayName: string | null;
  picturePath: string | null;
  avatar: AvatarConfig | null;
  showOnLeaderboard: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(saveProfile, { status: "idle" });
  const [uploading, startUpload] = useTransition();
  const [pictureMessage, setPictureMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameError = state.fieldErrors?.display_name?.[0];
  const src = picturePath ? pictureUrl(publicEnv.NEXT_PUBLIC_SUPABASE_URL, picturePath) : null;

  function upload(file: File) {
    setPictureMessage(null);
    startUpload(async () => {
      try {
        const { blob, ext } = await processProfilePicture(file, PICTURE_EDGE);
        const ticket = await preparePictureUpload(ext);
        if (!ticket.ok) return setPictureMessage({ tone: "error", text: ticket.message });
        const { error } = await createClient()
          .storage.from("avatars")
          .uploadToSignedUrl(ticket.path, ticket.token, blob, { contentType: blob.type, cacheControl: "31536000" });
        if (error) return setPictureMessage({ tone: "error", text: "The upload didn't go through. Try again." });
        const saved = await setProfilePicture(ticket.path);
        if (!saved.ok) return setPictureMessage({ tone: "error", text: saved.message });
        setPictureMessage({ tone: "ok", text: "New picture saved." });
        router.refresh();
      } catch (e) {
        setPictureMessage({ tone: "error", text: e instanceof Error ? e.message : "Couldn't use that picture." });
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  function switchToBuddy() {
    setPictureMessage(null);
    startUpload(async () => {
      const result = await removeProfilePicture();
      if (!result.ok) return setPictureMessage({ tone: "error", text: result.message });
      setPictureMessage({ tone: "ok", text: "Your buddy is your picture now." });
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[10rem_1fr]">
      <div className="flex flex-col items-center gap-3">
        <ProfileImage pictureSrc={src} avatar={avatar} size={128} label="Your profile picture" className="ring-4 ring-aqua" />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          id="profile-picture"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <label
          htmlFor="profile-picture"
          aria-disabled={uploading}
          className="btn btn-ghost min-h-10 cursor-pointer px-3 text-sm"
        >
          {uploading ? "Working…" : src ? "Change photo" : "Upload a photo"}
        </label>
        {src && (
          <button type="button" onClick={switchToBuddy} disabled={uploading} className="text-sm font-bold text-accent hover:underline">
            Use my buddy instead
          </button>
        )}
        {pictureMessage && (
          <p role={pictureMessage.tone === "error" ? "alert" : "status"} className={`text-center text-sm ${pictureMessage.tone === "error" ? "text-wax" : "text-accent"}`}>
            {pictureMessage.text}
          </p>
        )}
      </div>

      <form action={action} className="flex flex-col gap-4">
        <div>
          <label htmlFor="display_name" className="mb-1.5 block text-sm font-semibold text-ink-soft">
            Display name
          </label>
          <input
            id="display_name"
            name="display_name"
            maxLength={DISPLAY_NAME_MAX + 8}
            autoComplete="nickname"
            defaultValue={state.values?.display_name ?? displayName ?? ""}
            placeholder="What should others call you?"
            aria-invalid={Boolean(nameError)}
            aria-describedby="display_name_help"
            className="field"
          />
          <p id="display_name_help" className="mt-1 text-xs text-muted">
            Shown on the leaderboard instead of your email. 2 to {DISPLAY_NAME_MAX} characters; nobody else can take it.
          </p>
          {nameError && <p role="alert" className="mt-1 text-sm text-wax">{nameError}</p>}
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-line p-3">
          <input
            type="checkbox"
            name="show_on_leaderboard"
            defaultChecked={state.values ? state.values.show_on_leaderboard === "on" : showOnLeaderboard}
            className="mt-1 size-5 accent-[var(--teal)]"
          />
          <span>
            <span className="font-semibold">Show me on the leaderboard</span>
            <span className="block text-sm text-ink-soft">
              Others see your name, picture and photo streak. Never your photos.{" "}
              <Link href="/leaderboard" className="font-semibold text-accent">See the board</Link>
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save profile"}
          </button>
          {state.status === "saved" && <p role="status" className="text-sm font-semibold text-accent">Saved.</p>}
          {state.status === "error" && state.message && <p role="alert" className="text-sm text-wax">{state.message}</p>}
        </div>
      </form>
    </div>
  );
}
