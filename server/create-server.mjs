/**
 * AI Vault 本地服务工厂。
 * 被 cli/aivault.mjs serve（命令行）和 electron/main.cjs（桌面版）共用：
 *   托管前端 dist + 厂商代理 + 千问 CLI + 金库 KV/rev。
 */
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createAivaultApi } from "./aivault-api.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
};

/** 列出局域网可访问地址 */
export function lanAddresses(port) {  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name] || []) {
      if (i.family === "IPv4" && !i.internal) {
        out.push({ name, address: i.address, url: `http://${i.address}:${port}` });
      }
    }
  }
  return out;
}

/**
 * 若目标数据目录还没有金库，则从候选源复制一份。
 * 用于让命令行服务与桌面版共用同一数据目录（%APPDATA%/ai-vault/data）。
 */
export function migrateData(targetDir, sourceDirs = []) {
  try {
    if (fs.existsSync(path.join(targetDir, "kv.json"))) return;
    for (const src of sourceDirs) {
      if (!src || !fs.existsSync(path.join(src, "kv.json"))) continue;
      fs.mkdirSync(targetDir, { recursive: true });
      for (const f of fs.readdirSync(src)) {
        fs.copyFileSync(path.join(src, f), path.join(targetDir, f));
      }
      console.log("[aivault] 已迁移金库数据：", src, "→", targetDir);
      return;
    }
  } catch (e) {
    console.warn("[aivault] 数据迁移失败：", e);
  }
}

/**
 * 创建（但不 listen）一台 AI Vault 服务。
 * @param {{ dataDir: string, distDir: string }} opts
 */
export function createAivaultServer({ dataDir, distDir }) {
  const api = createAivaultApi({ enableKv: true, dataDir });

  async function serveStatic(res, pathname) {
    const filePath = path.join(distDir, pathname);
    const rel = path.relative(distDir, filePath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      res.statusCode = 403;
      res.end("forbidden");
      return;
    }
    const buf = await fsp.readFile(filePath);
    res.setHeader("content-type", MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream");
    res.setHeader("cache-control", pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-store");
    res.end(buf);
  }

  async function serveIndex(res) {
    try {
      const html = await fsp.readFile(path.join(distDir, "index.html"));
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(html);
    } catch {
      res.statusCode = 500;
      res.end("dist 尚未构建：请先运行 npm run build:web（或 npm run build）");
    }
  }

  let server;
  server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = decodeURIComponent(url.pathname);

    // 本地服务接口
    if (pathname === "/__aivault" || pathname.startsWith("/__aivault/")) {
      const sub = pathname.slice("/__aivault".length) || "/";
      if (sub === "/info") {
        const addr = server.address();
        const port = addr && typeof addr === "object" ? addr.port : 0;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: true, port, addresses: lanAddresses(port) }));
        return;
      }
      try {
        await api.handle(req, res, sub);
      } catch (e) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
      }
      return;
    }

    // 静态资源（含扩展名）否则回退 index.html（SPA）
    if (pathname.startsWith("/assets/") || path.posix.basename(pathname).includes(".")) {
      try {
        await serveStatic(res, pathname);
      } catch {
        res.statusCode = 404;
        res.end("not found");
      }
      return;
    }

    await serveIndex(res);
  });

  return server;
}
