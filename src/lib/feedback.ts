// Feedback kinds and statuses, shared by the form, the admin inbox and the validation schema.
// Mirrors the check constraints on public.feedback (..._admin_and_feedback.sql): change both together.

export const FEEDBACK_KINDS = ["bug", "idea", "praise", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  bug: "Something's broken",
  idea: "An idea",
  praise: "Something I love",
  other: "Something else",
};

export const FEEDBACK_KIND_SHORT: Record<FeedbackKind, string> = {
  bug: "Bug",
  idea: "Idea",
  praise: "Praise",
  other: "Other",
};

export const FEEDBACK_STATUSES = ["new", "in_progress", "resolved", "archived"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New",
  in_progress: "In progress",
  resolved: "Resolved",
  archived: "Archived",
};

/** What the sender sees for each status (they never see "archived" as such). */
export const FEEDBACK_STATUS_FOR_SENDER: Record<FeedbackStatus, string> = {
  new: "Sent",
  in_progress: "Being looked at",
  resolved: "Done",
  archived: "Closed",
};

export const FEEDBACK_MESSAGE_MAX = 4000;
export const FEEDBACK_PER_DAY = 10;
