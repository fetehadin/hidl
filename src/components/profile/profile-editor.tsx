"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type ProfileFormState, saveProfile } from "@/actions/profile";
import type { AvatarConfig } from "@/lib/avatar";
import { DISPLAY_NAME_MAX } from "@/lib/profile-rules";
import { ProfileImage } from "./profile-image";

/**
 * The public side of an account: a display name, the buddy others see, and whether to appear on
 * the leaderboard. Shown on /account.
 */
export function ProfileEditor({
  displayName,
  avatar,
  showOnLeaderboard,
}: {
  displayName: string | null;
  avatar: AvatarConfig | null;
  showOnLeaderboard: boolean;
}) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(saveProfile, { status: "idle" });
  const nameError = state.fieldErrors?.display_name?.[0];

  return (
    <div className="grid gap-6 sm:grid-cols-[10rem_1fr]">
      <div className="flex flex-col items-center gap-3">
        <ProfileImage avatar={avatar} size={128} label="Your buddy" className="ring-4 ring-aqua" />
        <a href="#buddy" className="text-sm font-bold text-accent hover:underline">
          Change your buddy
        </a>
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
              Others see your name, buddy and photo streak. Never your photos.{" "}
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
