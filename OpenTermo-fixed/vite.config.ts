import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(() => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  // Env variables starting with TAURI_ will be exposed to tauri's source code
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS/Linux
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari14",
    // don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? ("esbuild" as const) : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
