import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { createAivaultApi } from "./server/aivault-api.mjs";

/**
 * 本地查询代理中间件（开发 / 预览模式用）。
 * 浏览器直连厂商 API 会被 CORS 拦截，因此由本地服务代为转发。
 * 生产式的「局域网服务」见 cli/aivault.mjs serve 或桌面版内置服务（它们额外提供金库 KV 读写）。
 */
function aivaultProxy(): Plugin {
  const api = createAivaultApi();
  const handler = (req: unknown, res: unknown) => {
    const subpath = String((req as { url?: string }).url ?? "").split("?")[0];
    void api.handle(req as never, res as never, subpath);
  };
  return {
    name: "aivault-proxy",
    configureServer(server) {
      server.middlewares.use("/__aivault", handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/__aivault", handler);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), aivaultProxy()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5183,
    host: true,
  },
  preview: {
    port: 5183,
    host: true,
  },
  build: {
    // 单文件应用会把所有依赖内联，体积告警阈值调高以免刷屏
    chunkSizeWarningLimit: 1500,
  },
});
