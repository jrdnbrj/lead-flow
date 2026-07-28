import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LeadFlow · Vende con impulso",
    short_name: "LeadFlow",
    description: "Captura, prioriza y sigue tus leads de venta automotriz.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f3ed",
    theme_color: "#101828",
    orientation: "portrait",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
