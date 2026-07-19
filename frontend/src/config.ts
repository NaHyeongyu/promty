export const API_URL = (
  import.meta.env.VITE_PROMTY_API_URL ??
  import.meta.env.VITE_PROMPTHUB_API_URL ??
  "http://127.0.0.1:8011"
).replace(/\/$/, "");

export const BRAND_NAME = "Promty";
export const BRAND_LOGO_SRC = "/promty.svg";
export const BRAND_LOGO_BRIGHT_SRC = "/promty-bright.svg";
export const PUBLISHED_FLOWS_ENABLED =
  (import.meta.env.VITE_PROMTY_PUBLISHED_FLOWS_ENABLED ??
    import.meta.env.VITE_PROMPTHUB_PUBLISHED_FLOWS_ENABLED) === "true";
