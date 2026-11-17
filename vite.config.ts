import fs from "node:fs";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Plants & Pure Staff Reporting — TanStack Start (React) deployed on Netlify.
// The Netlify plugin is only used for production builds, so local dev
// does not need Deno or Netlify's edge emulation.
const buildId = process.env.COMMIT_REF || process.env.DEPLOY_ID || String(Date.now());

export default defineConfig(({ command }) => ({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    {
      // Writes public/version.json on every production build so installed apps can detect updates.
      name: "pp-version-file",
      apply: "build",
      buildStart() { fs.writeFileSync("public/version.json", JSON.stringify({ id: buildId })); },
    },
    tanstackStart(),
    ...(command === "build" ? [netlify()] : []),
    viteReact(),
    tailwindcss(),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom", "@tanstack/react-router"],
  },
}));
