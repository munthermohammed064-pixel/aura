import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nexora",
    short_name: "Nexora",
    description: "Nexora — private investment packages, Los Angeles.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F3EFE6",
    theme_color: "#F3EFE6",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
