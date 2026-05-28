import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api/youdao": {
        target: "https://dict.youdao.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/youdao/, ""),
        secure: false,
      },
      "/api/bing": {
        target: "https://cn.bing.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bing/, ""),
        secure: false,
      },
    },
  },
});
