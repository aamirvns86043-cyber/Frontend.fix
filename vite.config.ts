import path from "path"
import { defineConfig } from "vite"

export default defineConfig({
  base: './',
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
