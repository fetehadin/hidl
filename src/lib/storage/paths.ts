/** A path inside the user's own folder, with nothing that could climb out of it. */
export function isOwnPath(userId: string, path: string) {
  return (
    typeof path === "string" &&
    userId.length > 0 &&
    path.startsWith(`${userId}/`) &&
    !path.includes("..") &&
    !path.includes("//") &&
    !path.includes("\\")
  );
}
