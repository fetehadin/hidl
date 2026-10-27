import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "hidl",
    short_name: "hidl",
    description: "Letters, a countdown, and a year in pictures.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5ede0",
    theme_color: "#9c4a2c",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
