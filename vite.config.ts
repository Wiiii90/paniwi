import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function getGithubPagesBase(): string {
  const explicitBase = process.env.GITHUB_PAGES_BASE;
  if (explicitBase) {
    return explicitBase.endsWith("/") ? explicitBase : `${explicitBase}/`;
  }

  const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
  return repoName ? `/${repoName}/` : "/paniwi/";
}

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES === "true" ? getGithubPagesBase() : "/",
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
