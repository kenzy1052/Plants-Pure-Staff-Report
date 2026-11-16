import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import netlify from "@netlify/vite-plugin-tanstack-start";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Plants & Pure Staff Reporting — TanStack Start (React) deployed on Netlify.
// The Netlify plugin is only used for production builds, so local dev
// does not need Deno or Netlify's edge emulation.
export default defineConfig(({ command }) => ({
  plugins: [
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
