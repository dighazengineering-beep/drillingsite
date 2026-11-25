import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const port = Number(process.env.PORT ?? 5173);
const basePath = process.env.BASE_PATH ?? "/";

/** The secret admin address (same rule as src/lib/adminPath.ts), so the installable admin app opens straight at it. */
const adminPath = (() => { const raw = String(process.env.VITE_ADMIN_PATH ?? "").trim().replace(/[^A-Za-z0-9\-_/]/g, "").replace(/\/+$/, ""); return raw.length >= 4 ? (raw.startsWith("/") ? raw : `/${raw}`) : "/dighaz-hq-3a91c7e2b5d8"; })();
const adminApp = () => ({
  name: "admin-app",
  transformIndexHtml: (html: string) => html.replace(/__ADMIN_PATH__/g, adminPath),
  generateBundle() {
    (this as any).emitFile({ type: "asset", fileName: "admin.webmanifest", source: JSON.stringify({
      name: "Dighaz Admin", short_name: "Dighaz Admin", description: "Admin panel for Dighaz Engineering Limited", id: adminPath, start_url: `${adminPath}?source=app`, scope: adminPath,
      display: "standalone", orientation: "portrait", background_color: "#0b2a4a", theme_color: "#0b2a4a", lang: "en-KE",
      icons: [{ src: "/icons/admin-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/icons/admin-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "/icons/admin-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }],
    }, null, 2) });
  },
});

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    adminApp(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
