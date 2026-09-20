import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  logLevel: "error",
  resolve: {
    alias: {
      "@paperclipai/shared": fileURLToPath(
        new URL("./node_modules/@paperclipai/shared/dist/index.js", import.meta.url),
      ),
    },
  },
  ssr: {
    noExternal: ["@paperclipai/plugin-sdk", "@paperclipai/shared"],
  },
  test: {
    include: ["tests/**/*.spec.ts"],
    environment: "node",
  },
});
