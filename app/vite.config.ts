import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuração recomendada pelo Tauri v2
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
