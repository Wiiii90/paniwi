import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === "true" ? "/paniwi/" : "/",
  server: {
    host: "127.0.0.1",
    port: 49153,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 49154,
    strictPort: true
  }
});
