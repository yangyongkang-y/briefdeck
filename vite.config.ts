import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "bundle",
    emptyOutDir: true,
    rollupOptions: { output: { manualChunks: { powerpoint: ["pptxgenjs"] } } },
  },
  test: { include: ["tests/**/*.test.ts"] },
} as Parameters<typeof defineConfig>[0]);
