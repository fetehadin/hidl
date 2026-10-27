import type { SupabaseClient } from "@supabase/supabase-js";

export const PHOTO_BUCKET = "photos";
const SIGNED_URL_TTL = 60 * 60; // 1 hour

export type PhotoRow = {
  id: string;
  date: string;
  image_path: string;
  thumb_path: string;
  caption: string | null;
  created_at: string;
};

export type PhotoView = {
  date: string;
  caption: string | null;
  thumbUrl: string;
  fullUrl: string;
};

const COLUMNS = "id, date, image_path, thumb_path, caption, created_at";

export async function listPhotos(supabase: SupabaseClient, from: string, to: string) {
  const { data, error } = await supabase
    .from("photos")
    .select(COLUMNS)
    .gte("date", from)
    .lte("date", to)
    .order("date");
  if (error) throw error;
  return data as PhotoRow[];
}

export async function listPhotoDates(supabase: SupabaseClient, from: string, to: string) {
  const { data, error } = await supabase.from("photos").select("date").gte("date", from).lte("date", to);
  if (error) throw error;
  return (data as { date: string }[]).map((r) => r.date);
}

export async function getPhoto(supabase: SupabaseClient, date: string) {
  const { data, error } = await supabase.from("photos").select(COLUMNS).eq("date", date).maybeSingle();
  if (error) throw error;
  return data as PhotoRow | null;
}

/** Signs thumbnail and full-size URLs for a batch of rows in one request. */
export async function signPhotos(supabase: SupabaseClient, rows: PhotoRow[]): Promise<PhotoView[]> {
  if (rows.length === 0) return [];
  const paths = rows.flatMap((r) => [r.thumb_path, r.image_path]);
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
  if (error) throw error;
  const byPath = new Map(data.map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({
    date: r.date,
    caption: r.caption,
    thumbUrl: byPath.get(r.thumb_path) ?? "",
    fullUrl: byPath.get(r.image_path) ?? "",
  }));
}
