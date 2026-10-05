/**
 * AI Vault 本地服务端逻辑（Vite 开发中间件 与 独立局域网服务 共用）。
 *
 * 职责：
 *   ① /proxy        转发浏览器请求到厂商 API（绕过 CORS，带域名白名单）
 *   ② /qianwen*     执行千问官方 CLI（固定命令，不接受用户输入）
 *   ③ /kv/*         读写金库键值（仅独立局域网服务启用，用于多端共享同一份数据）
 *
 * 安全：代理只放行白名单域名；千问只跑固定命令；KV 只存密文，密码不经过服务器。
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/** 允许代理访问的厂商域名白名单（避免变成开放代理） */
export const ALLOWED_HOSTS = new Set([
  "api.deepseek.com",
  "maas.qianwenaiapi.com",
  "maas.qianwenai.com",
  "dashscope.aliyuncs.com",
  "api.moonshot.cn",
  "openrouter.ai",
  "api.siliconflow.cn",
  "api.openai.com",
  "api.anthropic.com",
  // 汇率来源
  "open.er-api.com",
  "api.frankfurter.app",
]);

function commandExists(cmd) {
  return new Promise((resolve) => {
    const finder = process.platform === "win32" ? "where" : "which";
    execFile(finder, [cmd], { windowsHide: true, timeout: 8000 }, (err) => {
      resolve(!err);
    });
  });
}

/** 执行一条命令（Windows 走 cmd，避免 .cmd 找不到） */
function runCmd(cmd, args, timeout = 240000) {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const file = isWin ? "cmd.exe" : cmd;
    const argv = isWin ? ["/d", "/s", "/c", cmd, ...args] : args;
    execFile(file, argv, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err ? err.code : 0,
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? ""),
      });
    });
  });
}

/** 一键安装千问 CLI：先试官方源，失败再自动切国内镜像 */
async function installQianwenCli() {
  const tries = [
    { label: "官方源", extra: [] },
    { label: "国内镜像", extra: ["--registry=https://registry.npmmirror.com"] },
  ];
  let last = "";
  for (const t of tries) {
    const r = await runCmd("npm", ["install", "-g", "@qianwenai/qianwen-cli", ...t.extra], 300000);
    if (r.ok && (await commandExists("qianwen"))) {
      return { ok: true, message: `安装成功（${t.label}）` };
    }
    const raw = (r.stderr || r.stdout || "").trim();
    last = raw ? raw.slice(-260) : `退出码 ${String(r.code)}`;
  }
  return { ok: false, message: `安装失败：${last}` };
}

/** 一键登录：发起设备码授权，返回需要用户打开的链接 */
async function qianwenLoginInit() {
  if (!(await commandExists("qianwen"))) {
    return { ok: false, message: "尚未安装千问 CLI" };
  }
  const r = await runCmd("qianwen", ["auth", "login", "--init-only", "--format", "json"], 60000);
  try {
    const j = JSON.parse(r.stdout);
    const events = j.events ?? [];
    if (events.some((e) => e.event === "already_authenticated")) return { ok: true, already: true };
    const dev = events.find((e) => e.event === "device_code");
    if (dev?.verification_url) {
      return { ok: true, url: dev.verification_url, expiresIn: dev.expires_in_seconds ?? 300 };
    }
  } catch {
    /* fallthrough */
  }
  return { ok: false, message: "无法获取授权链接" };
}

/** 等待用户在浏览器里完成授权（会阻塞到成功/超时） */
async function qianwenLoginComplete() {
  const r = await runCmd("qianwen", ["auth", "login", "--complete", "--format", "json"], 330000);
  try {
    const j = JSON.parse(r.stdout);
    const events = j.events ?? [];
    if (events.some((e) => e.event === "success" && e.authenticated)) return { ok: true };
    if (events.some((e) => e.event === "expired")) {
      return { ok: false, message: "授权超时，请重新发起登录" };
    }
  } catch {
    /* fallthrough */
  }
  return { ok: false, message: "授权未完成，请重试" };
}

/**
 * 运行千问官方 CLI 查询用量 / 花费。返回前做裁剪，避免把 200KB 原始 JSON 丢给前端。
 */
async function runQianwenCli() {
  if (!(await commandExists("qianwen"))) {
    return {
      ok: false,
      code: "not-installed",
      message: "未检测到 qianwen 命令，请先安装千问 CLI：npm i -g @qianwenai/qianwen-cli",
    };
  }

  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const args = ["usage", "summary", "--format", "json"];
    const cmd = isWin ? "cmd.exe" : "qianwen";
    const cmdArgs = isWin ? ["/d", "/s", "/c", "qianwen", ...args] : args;

    execFile(cmd, cmdArgs, { timeout: 30000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      const out = `${stdout ?? ""}`;
      if (err) {
        const exitCode = err.code;
        if (exitCode === 2) {
          return resolve({ ok: false, code: "not-logged-in", message: "千问 CLI 尚未登录，请执行 qianwen auth login" });
        }
        return resolve({ ok: false, code: "error", message: `CLI 执行失败（退出码 ${String(exitCode)}）` });
      }
      try {
        const raw = JSON.parse(out);

        const paygModels = Array.isArray(raw.pay_as_you_go?.models) ? raw.pay_as_you_go.models : [];
        const topModels = [...paygModels]
          .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
          .slice(0, 20)
          .map((m) => ({ model_id: m.model_id, cost: m.cost, currency: m.currency }));

        const freeTier = Array.isArray(raw.free_tier) ? raw.free_tier : [];
        const usedFree = freeTier
          .filter((f) => (f.quota?.used_pct ?? 0) > 0)
          .slice(0, 20)
          .map((f) => ({
            model_id: f.model_id,
            used_pct: f.quota?.used_pct,
            remaining: f.quota?.remaining,
            total: f.quota?.total,
            unit: f.quota?.unit,
            resetDate: f.quota?.resetDate,
          }));

        resolve({
          ok: true,
          data: {
            pay_as_you_go: { total: raw.pay_as_you_go?.total ?? null, models: topModels },
            token_plan: raw.token_plan ?? null,
            free_tier: { totalModels: freeTier.length, used: usedFree },
          },
        });
      } catch {
        resolve({ ok: false, code: "bad-output", message: "CLI 输出无法解析为 JSON" });
      }
    });
  });
}

/** 读取请求体（带大小上限） */
function readBody(req, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > limit) req.destroy();
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

export function createAivaultApi({ enableKv = false, dataDir = "" } = {}) {
  const kvFile = dataDir ? path.join(dataDir, "kv.json") : "";
  const metaFile = dataDir ? path.join(dataDir, "meta.json") : "";
  let kvCache = null;
  let writeChain = Promise.resolve();

  // 变更版本号：多端轮询用它发现"别的设备改过"
  let rev = 0;
  let revAt = null;
  let lastWriter = null;
  let metaLoaded = false;
  // 记录"曾经写入过的金库 id"，用于识别"同一个金库的文件被外部删除"（避免静默重建）
  // 注意：按 id 而不是路径，这样"另存为到同名/同路径"是新 id，允许创建文件
  const writtenVaults = new Set();

  async function loadMeta() {
    if (metaLoaded || !enableKv) return;
    metaLoaded = true;
    try {
      const m = JSON.parse(await fs.readFile(metaFile, "utf8"));
      rev = Number(m.rev) || 0;
      revAt = m.at ?? null;
      lastWriter = m.by ?? null;
      if (Array.isArray(m.written)) for (const x of m.written) writtenVaults.add(x);
    } catch {
      /* 首次运行还没有 meta */
    }
  }

  function bumpRev(req) {
    rev += 1;
    revAt = new Date().toISOString();
    lastWriter = (req.headers && req.headers["x-client-id"]) || null;
    persistMeta();
  }

  // 只落盘 meta（不改 rev），用于"某金库的文件确实存在（读过/写过）"的标记
  function persistMeta() {
    const tmp = `${metaFile}.tmp`;
    writeChain = writeChain
      .then(async () => {
        await fs.mkdir(dataDir, { recursive: true });
        await fs.writeFile(
          tmp,
          JSON.stringify({ rev, at: revAt, by: lastWriter, written: [...writtenVaults] }),
          "utf8",
        );
        await fs.rename(tmp, metaFile);
      })
      .catch(() => {});
  }

  /** 标记某金库的文件"确实存在过"（读过或写过），之后它消失就视为被删除 */
  function markExpected(id) {
    if (id && !writtenVaults.has(id)) {
      writtenVaults.add(id);
      persistMeta();
    }
  }

  async function loadKv() {
    if (kvCache) return kvCache;
    try {
      kvCache = JSON.parse(await fs.readFile(kvFile, "utf8"));
    } catch {
      kvCache = {};
    }
    return kvCache;
  }

  function saveKv() {
    writeChain = writeChain
      .then(async () => {
        await fs.mkdir(dataDir, { recursive: true });
        const tmp = `${kvFile}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(kvCache), "utf8");
        await fs.rename(tmp, kvFile);
      })
      .catch(() => {});
    return writeChain;
  }

  /** 从 registry 里找某个金库 id 对应的 .aivault 文件路径（没有则返回 null，走内置 KV 兼容旧数据） */
  function vaultFilePath(kv, id) {
    const reg = Array.isArray(kv.registry) ? kv.registry : [];
    const entry = reg.find((x) => x && x.id === id);
    return entry && typeof entry.path === "string" && entry.path ? entry.path : null;
  }

  /** 原子写文件：先写临时文件再重命名，避免中途写坏金库 */
  async function writeFileAtomic(file, text) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, text, "utf8");
    await fs.rename(tmp, file);
  }

  async function handle(req, res, subpath) {
    const method = req.method || "GET";
    const p = subpath || "/";
    const send = (code, payload) => {
      res.statusCode = code;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify(payload));
    };

    if (p === "/ping" && method === "GET") {
      return send(200, {
        ok: true,
        service: enableKv ? "aivault-server" : "aivault-proxy",
        ...(enableKv ? { storage: true } : {}),
      });
    }

    if (p === "/rev" && method === "GET") {
      await loadMeta();
      return send(200, { rev, at: revAt, by: lastWriter });
    }

    if (p === "/qianwen") return send(200, await runQianwenCli());
    if (p === "/qianwen/install") return send(200, await installQianwenCli());
    if (p === "/qianwen/login") return send(200, await qianwenLoginInit());
    if (p === "/qianwen/login-complete") return send(200, await qianwenLoginComplete());

    if (p === "/proxy") {
      if (method !== "POST") return send(405, { error: "method not allowed" });
      try {
        const raw = await readBody(req);
        const { url: target, method: m = "GET", headers = {}, body } = JSON.parse(raw || "{}");
        const u = new URL(String(target));
        if (!ALLOWED_HOSTS.has(u.hostname)) {
          return send(403, { error: `host not allowed: ${u.hostname}` });
        }
        const r = await fetch(target, { method: m, headers, body });
        const text = await r.text();
        res.statusCode = r.status;
        res.setHeader("content-type", r.headers.get("content-type") ?? "application/json");
        res.end(text);
      } catch (e) {
        // 上游网络失败不属于 HTTP 错误，用 200 + 标记返回，避免浏览器控制台报错
        send(200, { __proxyError: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    // KV：仅独立局域网服务启用。`vault:<id>` 若在 registry 里登记了 path，则读写那个 .aivault 文件
    if (enableKv && (p === "/kv" || p.startsWith("/kv/"))) {
      await loadMeta();
      const kv = await loadKv();
      if (p === "/kv" || p === "/kv/") {
        if (method === "GET") return send(200, { keys: Object.keys(kv) });
        return send(405, { error: "method not allowed" });
      }
      const key = decodeURIComponent(p.slice(4)); // 去掉 "/kv/"
      const vaultId = key.startsWith("vault:") ? key.slice("vault:".length) : null;
      const vaultFile = vaultId ? vaultFilePath(kv, vaultId) : null;

      if (method === "GET") {
        if (vaultFile) {
          try {
            const text = await fs.readFile(vaultFile, "utf8");
            markExpected(vaultId); // 文件确实存在 → 记住它，之后消失即视为被删除
            return send(200, JSON.parse(text));
          } catch {
            return send(404, { error: "vault file not found" });
          }
        }
        return kv[key] === undefined ? send(404, { error: "not found" }) : send(200, kv[key]);
      }

      if (method === "PUT") {
        let value;
        try {
          const raw = await readBody(req);
          value = JSON.parse(raw || "null");
        } catch {
          return send(400, { error: "invalid json" });
        }
        if (vaultFile) {
          // 之前写过、现在文件却没了 → 被移动/删除，报错而不是静默重建（虚空保存）
          let exists = true;
          try {
            await fs.access(vaultFile);
          } catch {
            exists = false;
          }
          if (!exists && vaultId && writtenVaults.has(vaultId)) {
            return send(409, {
              error: "金库文件已不存在（可能被移动或删除），本次改动未保存。请点「另存为」保存到新位置。",
              code: "vault-missing",
            });
          }
          try {
            await writeFileAtomic(vaultFile, JSON.stringify(value));
            if (vaultId) writtenVaults.add(vaultId);
          } catch (e) {
            return send(500, { error: `写入金库文件失败：${e instanceof Error ? e.message : String(e)}` });
          }
          bumpRev(req);
          return send(200, { ok: true, path: vaultFile });
        }
        kv[key] = value;
        await saveKv();
        bumpRev(req);
        return send(200, { ok: true });
      }

      if (method === "DELETE") {
        if (vaultFile) {
          // 文件是用户自己的资产：这里只表示"移除记录"，绝不删除文件
          return send(200, { ok: true, kept: true });
        }
        delete kv[key];
        await saveKv();
        bumpRev(req);
        return send(200, { ok: true });
      }
      return send(405, { error: "method not allowed" });
    }

    return send(404, { error: "not found" });
  }

  return { handle };
}
