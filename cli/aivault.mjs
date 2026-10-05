#!/usr/bin/env node
/**
 * AI Vault 开发者命令行（**仅用于开发/测试**，不影响桌面版用户）。
 *
 * 目标：让 AI/开发者**不点原生窗口、也不开网页 UI**就能把金库跑一遍完整流程——
 *   「打开/解锁 → 修改 → 保存 / 另存为」，并能在服务端验证"保存相关逻辑"
 *   （立即写盘、文件被删报 409、另存为到同名/同路径可用等，见 维护约定 §七点五）。
 *
 * 三类命令：
 *   ① 离线（直接读写 .aivault 文件）：create / dump / get / set / add-software
 *   ② 经服务（HTTP，走真实服务端读写）：open / edit / save-as / status / register / list
 *   ③ 一键自测：selftest（自己起一个临时服务 + 临时金库，跑完整流程后全部清理）
 *
 * 约定：本工具**不在项目里留任何 .aivault**；测试文件一律放系统临时目录并删除（维护约定 §六.10）。
 * 服务地址：默认 http://localhost:5183，可用最后参数或环境变量 AIVAULT_SERVER 覆盖。
 */
import { argon2id } from "hash-wasm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/* ------------------------------------------------------------------ */
/* 基础工具                                                            */
/* ------------------------------------------------------------------ */
const webcrypto = globalThis.crypto;
const enc = new TextEncoder();
const dec = new TextDecoder();
const toB64 = (b) => Buffer.from(b).toString("base64");
const fromB64 = (s) => new Uint8Array(Buffer.from(s, "base64"));
const now = () => new Date().toISOString();
const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 最近记录上限（与 src/store/vault.ts 的 MAX_RECENT 保持一致） */
const MAX_RECENT = 2;
function capRecent(list) {
  if (list.length <= MAX_RECENT) return list;
  const sorted = [...list].sort((a, b) =>
    (a.lastOpenedAt ?? a.createdAt ?? "").localeCompare(b.lastOpenedAt ?? b.createdAt ?? ""),
  );
  const drop = new Set(sorted.slice(0, list.length - MAX_RECENT).map((v) => v.id));
  return list.filter((v) => !drop.has(v.id));
}
function baseName(p) {
  const name = (p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p).replace(/\.aivault$/i, "");
  return name || "我的金库";
}

/* ------------------------------------------------------------------ */
/* 加密（与服务端/前端格式一致：Argon2id + AES-256-GCM）               */
/* ------------------------------------------------------------------ */
function newKdfParams() {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  return { algo: "argon2id", salt: toB64(salt), iterations: 3, memorySize: 65536, parallelism: 1, hashLength: 32 };
}
async function deriveKey(password, p) {
  return argon2id({
    password,
    salt: fromB64(p.salt),
    iterations: p.iterations,
    memorySize: p.memorySize,
    parallelism: p.parallelism,
    hashLength: p.hashLength,
    outputType: "binary",
  });
}
async function encryptJSON(key, obj) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ck = await webcrypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, ck, enc.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), data: toB64(new Uint8Array(ct)) };
}
async function decryptJSON(key, ivB64, dataB64) {
  const ck = await webcrypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["decrypt"]);
  const pt = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivB64) }, ck, fromB64(dataB64));
  return JSON.parse(dec.decode(pt));
}

/* ------------------------------------------------------------------ */
/* 空金库结构                                                          */
/* ------------------------------------------------------------------ */
const defaultSettings = () => ({
  usdToCny: 7.12,
  rateUpdatedAt: null,
  autoRefreshOnOpen: true,
  autoRateOnOpen: true,
  lastRefreshAt: null,
  balanceIntervalMin: 3,
  rateIntervalMin: 30,
});
const emptyDB = () => ({
  vendors: [],
  accounts: [],
  apiKeys: [],
  softwares: [],
  projects: [],
  bindings: [],
  snapshots: [],
  settings: defaultSettings(),
});

/* ------------------------------------------------------------------ */
/* JSON 路径读写                                                       */
/* ------------------------------------------------------------------ */
function parseValue(raw) {
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  try {
    return JSON.parse(raw);
  } catch {
    return raw; // 当普通字符串
  }
}
function pathGet(obj, p) {
  let cur = obj;
  for (const k of p.split(".").filter(Boolean)) {
    if (cur == null) return undefined;
    cur = Array.isArray(cur) ? cur[Number(k)] : cur[k];
  }
  return cur;
}
function pathSet(obj, p, val) {
  const parts = p.split(".").filter(Boolean);
  if (!parts.length) throw new Error("路径不能为空");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const wantArray = /^\d+$/.test(parts[i + 1]);
    if (Array.isArray(cur)) {
      const idx = Number(k);
      if (cur[idx] == null) cur[idx] = wantArray ? [] : {};
      cur = cur[idx];
    } else {
      if (cur[k] == null) cur[k] = wantArray ? [] : {};
      cur = cur[k];
    }
  }
  const last = parts[parts.length - 1];
  if (Array.isArray(cur)) cur[Number(last)] = val;
  else cur[last] = val;
}

/* ------------------------------------------------------------------ */
/* 离线：直接读写 .aivault 文件                                        */
/* ------------------------------------------------------------------ */
async function opCreate(file, password) {
  const kdf = newKdfParams();
  const key = await deriveKey(password, kdf);
  const env = { v: 1, kdf, iv: "", data: "", meta: { createdAt: now(), updatedAt: now() } };
  await opWriteFile(file, env, key, emptyDB());
  return { file };
}
async function opRead(file, password) {
  if (!fs.existsSync(file)) throw new Error(`文件不存在：${file}`);
  const env = JSON.parse(fs.readFileSync(file, "utf8"));
  const key = await deriveKey(password, env.kdf);
  const db = await decryptJSON(key, env.iv, env.data);
  return { env, key, db };
}
async function opWriteFile(file, env, key, db) {
  const { iv, data } = await encryptJSON(key, db);
  env.iv = iv;
  env.data = data;
  env.meta = { ...(env.meta ?? {}), updatedAt: now() };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(env));
}

/* ------------------------------------------------------------------ */
/* HTTP（走真实服务端：/__aivault/kv/*）                               */
/* ------------------------------------------------------------------ */
const trim = (s) => String(s).replace(/\/+$/, "");
const kvUrl = (server, key) => `${trim(server)}/__aivault/kv/${encodeURIComponent(key)}`;
async function httpJson(url, init) {
  let r;
  try {
    r = await fetch(url, init);
  } catch (e) {
    return { status: 0, ok: false, body: { error: (e instanceof Error ? e.message : String(e)) } };
  }
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: r.status, ok: r.ok, body };
}
const kvGet = (server, key) => httpJson(kvUrl(server, key));
const kvPut = (server, key, val) =>
  httpJson(kvUrl(server, key), {
    method: "PUT",
    headers: { "content-type": "application/json", "x-client-id": "aivault-cli" },
    body: JSON.stringify(val),
  });
const kvDel = (server, key) =>
  httpJson(kvUrl(server, key), { method: "DELETE", headers: { "x-client-id": "aivault-cli" } });
/* ---- 便捷封装：registry 读写 ---- */
async function fetchRegistry(server) {
  const g = await kvGet(server, "registry");
  return Array.isArray(g.body) ? g.body : [];
}
/** 确保某文件在服务端 registry 里有记录（没有就登记并设为 active），返回该记录 */
async function ensureRecord(server, file) {
  const reg = await fetchRegistry(server);
  const existing = reg.find((v) => v && v.path === file);
  if (existing) {
    await kvPut(server, "active", existing.id);
    return existing;
  }
  const rec = { id: uid("vault"), name: baseName(file), path: file, createdAt: now(), updatedAt: now(), lastOpenedAt: now() };
  await kvPut(server, "registry", capRecent([...reg, rec]));
  await kvPut(server, "active", rec.id);
  return rec;
}

/* ------------------------------------------------------------------ */
/* 进服务端的操作（一条龙核心）                                        */
/* ------------------------------------------------------------------ */

/** 打开/解锁：登记该文件 → 设为当前 → 从服务端读出并解密校验密码 */
async function opOpen(server, file, password) {
  const rec = await ensureRecord(server, file);
  const g = await kvGet(server, `vault:${rec.id}`);
  if (!g.ok) return { ok: false, step: "read", status: g.status, body: g.body };
  try {
    const key = await deriveKey(password, g.body.kdf);
    await decryptJSON(key, g.body.iv, g.body.data);
  } catch {
    return { ok: false, step: "decrypt", status: g.status, body: { error: "密码错误或文件损坏" } };
  }
  return { ok: true, id: rec.id, name: rec.name, path: file };
}

/** 直接向服务端提交某一文件的密文（模拟前端"内存里的改动保存"，不重新读文件） */
async function opServerPut(server, file, envelope) {
  const rec = await ensureRecord(server, file);
  const p = await kvPut(server, `vault:${rec.id}`, envelope);
  return { ok: p.ok, status: p.status, body: p.body, id: rec.id };
}

/** 修改并保存：从服务端读 → 解密 → 改 → 加密 → 写回（走真实服务端写文件逻辑） */
async function opServerEdit(server, file, password, jsonPath, rawValue) {
  const rec = await ensureRecord(server, file);
  const g = await kvGet(server, `vault:${rec.id}`);
  if (!g.ok) return { ok: false, step: "read", status: g.status, body: g.body, id: rec.id };
  const env = g.body;
  const key = await deriveKey(password, env.kdf);
  const db = await decryptJSON(key, env.iv, env.data);
  pathSet(db, jsonPath, parseValue(rawValue));
  const enc2 = await encryptJSON(key, db);
  env.iv = enc2.iv;
  env.data = enc2.data;
  env.meta = { ...(env.meta ?? {}), updatedAt: now() };
  const p = await kvPut(server, `vault:${rec.id}`, env);
  return { ok: p.ok, status: p.status, body: p.body, id: rec.id };
}

/** 用一份密文在"新文件/新 id"上落地（另存为的核心；同名/同路径也允许——新 id） */
async function opServerPutNew(server, file, envelope) {
  const reg = await fetchRegistry(server);
  const id = uid("vault");
  const rec = { id, name: baseName(file), path: file, createdAt: now(), updatedAt: now(), lastOpenedAt: now() };
  await kvPut(server, "registry", capRecent([...reg, rec]));
  await kvPut(server, "active", id);
  const p = await kvPut(server, `vault:${id}`, envelope);
  return { ok: p.ok, status: p.status, body: p.body, id };
}

/** 另存为：读旧文件 → 落新文件/新 id → 移除旧记录（旧文件保留，与桌面版行为一致） */
async function opServerSaveAs(server, oldFile, newFile, password) {
  const { env } = await opRead(oldFile, password);
  const reg = await fetchRegistry(server);
  const id = uid("vault");
  const rec = { id, name: baseName(newFile), path: newFile, createdAt: now(), updatedAt: now(), lastOpenedAt: now() };
  await kvPut(server, "registry", capRecent([...reg.filter((v) => v.path !== oldFile), rec]));
  await kvPut(server, "active", id);
  const p = await kvPut(server, `vault:${id}`, env);
  return { ok: p.ok, status: p.status, body: p.body, id, newFile };
}

async function opStatus(server) {
  const reg = await fetchRegistry(server);
  const active = (await kvGet(server, "active")).body;
  return {
    active,
    rows: reg.map((v) => ({
      id: v.id,
      name: v.name,
      path: v.path || "(内部，无文件)",
      exists: v.path ? fs.existsSync(v.path) : null,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* 常驻服务：headless 起一台 AI Vault 服务（替代原 server/index.mjs）  */
/* ------------------------------------------------------------------ */
async function opServe(rest) {
  let port = 5183;
  let host = "0.0.0.0";
  let dataDir =
    process.env.AIVAULT_DATA_DIR || path.join(process.env.APPDATA || os.tmpdir(), "ai-vault", "data");
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--port") port = Number(rest[++i]);
    else if (a.startsWith("--port=")) port = Number(a.slice("--port=".length));
    else if (a === "--data") dataDir = rest[++i];
    else if (a.startsWith("--data=")) dataDir = a.slice("--data=".length);
    else if (a === "--host") host = rest[++i];
    else if (a.startsWith("--host=")) host = a.slice("--host=".length);
  }
  const { createAivaultServer, lanAddresses } = await import(
    pathToFileURL(path.join(projectRoot, "server", "create-server.mjs")).href
  );
  fs.mkdirSync(dataDir, { recursive: true });
  const server = createAivaultServer({ dataDir, distDir: path.join(projectRoot, "dist") });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const actual = server.address().port;
  console.log("");
  console.log("  ==============================================");
  console.log("     AI Vault - 服务已启动（CLI serve）");
  console.log("  ==============================================");
  console.log("");
  console.log(`  本机：  http://localhost:${actual}`);
  const addrs = lanAddresses(actual);
  if (addrs.length) {
    console.log("  手机（同一 WiFi）：");
    for (const a of addrs) console.log(`          ${a.url}    [${a.name}]`);
  }
  console.log("");
  console.log(`  数据目录： ${dataDir}`);
  console.log("  保持本窗口开启；按 Ctrl+C 停止。");
  console.log("");
  return server;
}

/* ------------------------------------------------------------------ */
/* 一键自测：起临时服务 + 临时金库，跑完整流程后清理                   */
/* ------------------------------------------------------------------ */
function assertLine(results, name, cond) {
  results.push([name, Boolean(cond)]);
}
async function opSelftest() {
  const tmp = path.join(os.tmpdir(), "opencode", `aivault-cli-selftest-${Date.now()}`);
  const dataDir = path.join(tmp, "data");
  fs.mkdirSync(tmp, { recursive: true });
  const pw = "Test123456";

  // 在进程内起一台真实的 AI Vault 服务（复用 server/create-server.mjs），端口由系统分配
  const { createAivaultServer } = await import(
    pathToFileURL(path.join(projectRoot, "server", "create-server.mjs")).href
  );
  const httpServer = createAivaultServer({ dataDir, distDir: path.join(projectRoot, "dist") });
  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });
  const server = `http://127.0.0.1:${httpServer.address().port}`;

  const results = [];
  try {
    const a = path.join(tmp, "a.aivault");
    const b = path.join(tmp, "b.aivault");
    const c = path.join(tmp, "c.aivault");
    const d = path.join(tmp, "d.aivault");

    // 1) 建文件
    await opCreate(a, pw);
    assertLine(results, "create 生成 .aivault", fs.existsSync(a));

    // 2) 打开/解锁（登记 + 解密校验）
    const o = await opOpen(server, a, pw);
    assertLine(results, "open 登记并解锁成功", o.ok);

    // 3) 修改并经服务端保存，独立读盘校验
    const e1 = await opServerEdit(server, a, pw, "settings.usdToCny", "7.77");
    assertLine(results, "edit 经服务端保存成功", e1.ok);
    const rd = await opRead(a, pw);
    assertLine(results, "磁盘文件已写入改动", rd.db.settings.usdToCny === 7.77);

    // 4) 另存为 b：新文件可解密、旧记录移除
    const sa = await opServerSaveAs(server, a, b, pw);
    assertLine(results, "save-as 落新文件", sa.ok && fs.existsSync(b));
    const rd2 = await opRead(b, pw);
    assertLine(results, "另存的新文件可解密且数据在", rd2.db.settings.usdToCny === 7.77);
    const regAfter = await fetchRegistry(server);
    assertLine(results, "另存后旧记录已移除", !regAfter.some((v) => v.path === a));

    // 5) 另存为到"已存在的同名/同路径"也应允许（新 id，#33）
    const samename = await opServerPutNew(server, b, rd2.env);
    assertLine(results, "另存为到同路径可用（新 id）", samename.ok);

    // 6) 文件被外部删除后保存应 409（#36：只要读过/写过就应检测到）
    const envMissing = { ...rd2.env, iv: rd2.env.iv, data: rd2.env.data };
    fs.unlinkSync(b);
    const put = await opServerPut(server, b, envMissing);
    assertLine(results, "文件被删后保存应 409", put.status === 409 && put.body?.code === "vault-missing");

    // 7) 丢失后"另存为"救援（用内存里的密文，模拟点「另存为…」）
    const rescue = await opServerPutNew(server, c, envMissing);
    assertLine(results, "丢失后另存为可用", rescue.ok && fs.existsSync(c));
    const rd3 = await opRead(c, pw);
    assertLine(results, "救援出的新文件可解密", rd3.db.settings.usdToCny === 7.77);

    // 8) 只"打开过（GET）"、没写过的文件被删，保存也应 409（#36）
    await opCreate(d, pw);
    await opOpen(server, d, pw); // GET → 服务端 markExpected
    const rdd = await opRead(d, pw);
    fs.unlinkSync(d);
    const put2 = await opServerPut(server, d, rdd.env);
    assertLine(results, "只读过未写过的文件被删也 409", put2.status === 409 && put2.body?.code === "vault-missing");
  } catch (e) {
    assertLine(results, `自测异常：${e instanceof Error ? e.message : e}`, false);
  } finally {
    await new Promise((resolve) => httpServer.close(() => resolve()));
    await sleep(200);
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  console.log("\n  AI Vault CLI 自测（临时目录 + 临时服务，已自动清理）：\n");
  for (const [name, ok] of results) console.log(`    ${ok ? "✅" : "❌"} ${name}`);
  const allOk = results.length > 0 && results.every(([, ok]) => ok);
  console.log(`\n  ${allOk ? "== 全部通过 ==" : "== 有失败项 =="}\n`);
  return allOk;
}

/* ------------------------------------------------------------------ */
/* 命令分发                                                            */
/* ------------------------------------------------------------------ */
const HELP = `AI Vault 开发命令行（仅开发/测试用）

离线（直接读写 .aivault 文件）：
  create  <file> <password>                          新建一个空金库文件
  dump    <file> <password> [--full]                 查看内容概览（--full 打印完整 JSON）
  get     <file> <password> <path>                   读取某个字段（支持 a.b.0.c）
  set     <file> <password> <path> <value>           修改某个字段并写盘
  add-software <file> <password> <名称> [logoFile]   追加一个软件

经真实服务端（默认 http://localhost:5183，可加 [serverUrl] 或设 AIVAULT_SERVER）：
  open    <file> <password> [serverUrl]              打开/解锁（登记路径 + 解密校验）
  edit    <file> <password> <path> <value> [serverUrl] 读→改→保存（走服务端写文件）
  save-as <oldFile> <newFile> <password> [serverUrl] 另存为（新 id + 移除旧记录）
  status  [serverUrl]                                 查看 registry / active / 文件是否存在
  register <file> [serverUrl]                         仅登记为当前金库
  list     [serverUrl]                                打印 registry + active

一键自测：
  selftest                                           起临时服务+临时金库，跑完整流程后清理

常驻服务（替代原 server/index.mjs）：
  serve   [--port 5183] [--host 0.0.0.0] [--data <dir>]   headless 起服务（可手机访问）
`;

function takeServer(args, fallback = process.env.AIVAULT_SERVER || "http://localhost:5183") {
  const last = args[args.length - 1];
  if (last && /^https?:\/\//i.test(last)) return { server: args.pop(), fallback };
  return { server: fallback };
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = argv.slice(1);

  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") {
    console.log(HELP);
    return;
  }

  if (cmd === "create") {
    const [file, password] = args;
    await opCreate(file, password);
    console.log("已创建:", file);
    return;
  }

  if (cmd === "dump") {
    const full = args.includes("--full");
    const [file, password] = args.filter((x) => x !== "--full");
    const { env, db } = await opRead(file, password);
    if (full) {
      console.log(JSON.stringify(db, null, 2));
      return;
    }
    console.log(
      JSON.stringify(
        {
          meta: env.meta,
          summary: {
            vendors: db.vendors.map((v) => v.name),
            accounts: db.accounts.length,
            keys: db.apiKeys.length,
            softwares: db.softwares.map((s) => ({ name: s.name, logo: s.logoData ? s.logoData.length : 0 })),
            projects: db.projects.map((p) => p.name),
          },
          settings: db.settings,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === "get") {
    const [file, password, jsonPath] = args;
    const { db } = await opRead(file, password);
    const v = pathGet(db, jsonPath);
    console.log(typeof v === "object" ? JSON.stringify(v, null, 2) : String(v));
    return;
  }

  if (cmd === "set") {
    const [file, password, jsonPath, ...rest] = args;
    const rawValue = rest.join(" ");
    const { env, key, db } = await opRead(file, password);
    pathSet(db, jsonPath, parseValue(rawValue));
    await opWriteFile(file, env, key, db);
    console.log(`已写入 ${jsonPath} = ${rawValue}`);
    return;
  }

  if (cmd === "add-software") {
    const [file, password, name, logoFile] = args;
    const { env, key, db } = await opRead(file, password);
    const logoData = logoFile ? fs.readFileSync(logoFile, "utf8").trim() : null;
    db.softwares.push({ id: uid("sw"), name, glyph: name.slice(0, 1), accent: "#7c5cff", category: "", icon: null, logoData });
    await opWriteFile(file, env, key, db);
    console.log("已添加软件:", name, logoData ? `(logo ${logoData.length})` : "");
    return;
  }

  if (cmd === "open") {
    const { server } = takeServer(args);
    const [file, password] = args;
    const r = await opOpen(server, file, password);
    if (!r.ok) {
      console.error(`打开失败（${r.step}，HTTP ${r.status}）：`, r.body?.error ?? r.body);
      process.exitCode = 1;
      return;
    }
    console.log(`已打开并解锁：${r.name}  [id=${r.id}]`);
    return;
  }

  if (cmd === "edit") {
    const { server } = takeServer(args);
    const [file, password, jsonPath, ...rest] = args;
    const rawValue = rest.join(" ");
    const r = await opServerEdit(server, file, password, jsonPath, rawValue);
    if (!r.ok) {
      console.error(`保存失败（${r.step ?? "write"}，HTTP ${r.status}）：`, r.body?.error ?? r.body);
      process.exitCode = 1;
      return;
    }
    console.log(`已保存 ${jsonPath} = ${rawValue}（HTTP ${r.status}）`);
    return;
  }

  if (cmd === "save-as") {
    const { server } = takeServer(args);
    const [oldFile, newFile, password] = args;
    const r = await opServerSaveAs(server, oldFile, newFile, password);
    if (!r.ok) {
      console.error(`另存为失败（HTTP ${r.status}）：`, r.body?.error ?? r.body);
      process.exitCode = 1;
      return;
    }
    console.log(`已另存为：${newFile}  [新 id=${r.id}]（旧记录已移除，旧文件保留）`);
    return;
  }

  if (cmd === "status") {
    const { server } = takeServer(args);
    const s = await opStatus(server);
    console.log(JSON.stringify(s, null, 2));
    return;
  }

  if (cmd === "register") {
    const { server } = takeServer(args);
    const [file] = args;
    if (!fs.existsSync(file)) {
      console.error("文件不存在:", file);
      process.exitCode = 1;
      return;
    }
    const rec = await ensureRecord(server, file);
    console.log("已登记为当前金库:", baseName(file), "->", file, "\n  id:", rec.id);
    return;
  }

  if (cmd === "list") {
    const { server } = takeServer(args);
    const reg = await fetchRegistry(server);
    const active = (await kvGet(server, "active")).body;
    console.log(JSON.stringify({ registry: reg, active }, null, 2));
    return;
  }

  if (cmd === "selftest") {
    const ok = await opSelftest();
    if (!ok) process.exitCode = 1;
    return;
  }

  if (cmd === "serve") {
    await opServe(args);
    return;
  }

  console.error(`未知命令：${cmd}\n`);
  console.log(HELP);
  process.exitCode = 1;
}

main().catch((e) => {
  console.error("失败:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
