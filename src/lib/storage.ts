/**
 * 极简键值存储。
 * 优先「局域网服务」（多端共享同一份数据）；否则 IndexedDB；file:// 下优先 localStorage；都不可用返回 none。
 */
const DB_NAME = "aivault";
const STORE = "kv";
const LS_PREFIX = "aivault:";
const SERVER_KV = "/__aivault/kv/";

export type StorageBackend = "server" | "idb" | "local" | "none";

let preferred: StorageBackend | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const idb = () => (dbPromise ??= openIDB());

const isFileProtocol = () =>
  typeof location !== "undefined" && location.protocol === "file:";

const isHttpOrigin = () =>
  typeof location !== "undefined" &&
  (location.protocol === "http:" || location.protocol === "https:");

function tryLocal(probe = false): boolean {
  try {
    localStorage.setItem(`${LS_PREFIX}probe`, "1");
    if (probe) localStorage.removeItem(`${LS_PREFIX}probe`);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 服务端 KV（桌面版内置服务 / CLI serve）                            */
/* ------------------------------------------------------------------ */

async function serverAvailable(): Promise<boolean> {
  if (!isHttpOrigin()) return false;
  try {
    const r = await fetch("/__aivault/ping", { cache: "no-store" });
    if (!r.ok) return false;
    const j = (await r.json()) as { storage?: boolean };
    return j?.storage === true;
  } catch {
    return false;
  }
}

async function serverGet<T>(key: string): Promise<T | undefined> {
  try {
    const r = await fetch(SERVER_KV + encodeURIComponent(key), { cache: "no-store" });
    if (!r.ok) return undefined;
    return (await r.json()) as T;
  } catch {
    return undefined;
  }
}

async function serverSet(key: string, value: unknown): Promise<void> {
  const r = await fetch(SERVER_KV + encodeURIComponent(key), {
    method: "PUT",
    headers: { "content-type": "application/json", "x-client-id": getClientId() },
    body: JSON.stringify(value),
  });
  if (!r.ok) {
    let msg = `保存失败（HTTP ${r.status}）`;
    let code: string | undefined;
    try {
      const j = (await r.json()) as { error?: string; code?: string };
      if (j && j.error) msg = j.error;
      if (j && j.code) code = j.code;
    } catch {
      /* 保留默认消息 */
    }
    const err = new Error(msg) as Error & { code?: string };
    if (code) err.code = code;
    throw err;
  }
}

async function serverDel(key: string): Promise<void> {
  await fetch(SERVER_KV + encodeURIComponent(key), {
    method: "DELETE",
    headers: { "x-client-id": getClientId() },
  });
}

/** 本设备的随机 id，用于区分"这次改动是不是自己写的" */
function getClientId(): string {
  try {
    let id = localStorage.getItem(`${LS_PREFIX}client-id`);
    if (!id) {
      id = `c-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      localStorage.setItem(`${LS_PREFIX}client-id`, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}
export const clientId = () => getClientId();

/** 读取服务端变更版本号（用于多端自动同步） */
export async function serverRev(): Promise<{ rev: number; at: string | null; by: string | null } | null> {
  try {
    const r = await fetch("/__aivault/rev", { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as { rev: number; at: string | null; by: string | null };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 本机原始读取（仅用于把旧数据迁移到服务端）                          */
/* ------------------------------------------------------------------ */

async function idbGetRaw<T>(key: string): Promise<T | undefined> {
  try {
    const db = await idb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function localGetRaw<T>(key: string): Promise<T | undefined> {
  const fromIdb = await idbGetRaw<T>(key);
  if (fromIdb !== undefined) return fromIdb;
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${key}`);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 服务端还是空的时，把本机旧数据（IndexedDB / localStorage）搬上去，
 * 避免用户切换到局域网模式后以为「数据丢了」。仅搬一次（服务端非空则跳过）。
 */
async function migrateLocalToServer(): Promise<void> {
  const remote = await serverGet<unknown>("registry");
  if (Array.isArray(remote) && remote.length) return;
  const localRegistry = await localGetRaw<{ id?: string }[]>("registry");
  if (!Array.isArray(localRegistry) || !localRegistry.length) return;

  await serverSet("registry", localRegistry);
  const active = await localGetRaw<string>("active");
  if (active !== undefined) await serverSet("active", active);
  for (const v of localRegistry) {
    if (!v || !v.id) continue;
    const env = await localGetRaw(`vault:${v.id}`);
    if (env !== undefined) await serverSet(`vault:${v.id}`, env);
  }
}

/**
 * 探测可用的持久化后端。
 * 顺序：局域网服务（可共享）→ IndexedDB → localStorage（file:// 优先）。
 */
export async function probeStorage(): Promise<StorageBackend> {
  if (preferred) return preferred;

  // 1) 局域网服务：能连上就用它，实现多端同一份数据
  if (await serverAvailable()) {
    await migrateLocalToServer().catch(() => {});
    preferred = "server";
    return "server";
  }

  // 2) 本机存储
  const order: ("idb" | "local")[] = isFileProtocol() ? ["local", "idb"] : ["idb", "local"];
  for (const p of order) {
    if (p === "local") {
      if (tryLocal(true)) {
        preferred = "local";
        return "local";
      }
    } else {
      try {
        const db = await idb();
        if (db) {
          preferred = "idb";
          return "idb";
        }
      } catch {
        /* 继续尝试下一个 */
      }
    }
  }
  preferred = "none";
  return "none";
}

export const currentBackend = (): StorageBackend => preferred ?? "idb";

/* ------------------------------------------------------------------ */
/* 对外读写（按后端分派）                                              */
/* ------------------------------------------------------------------ */

export async function kvGet<T>(key: string): Promise<T | undefined> {
  if (preferred === "server") return serverGet<T>(key);

  if (preferred !== "local") {
    try {
      const db = await idb();
      const idbVal = await new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      });
      if (idbVal !== undefined) return idbVal;
      if (preferred === "idb") return undefined;
    } catch {
      /* 落到 localStorage */
    }
  }
  const raw = localStorage.getItem(`${LS_PREFIX}${key}`);
  return raw ? (JSON.parse(raw) as T) : undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  if (preferred === "server") {
    await serverSet(key, value);
    return;
  }
  if (preferred === "local") {
    localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify(value));
    return;
  }
  try {
    const db = await idb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    localStorage.setItem(`${LS_PREFIX}${key}`, JSON.stringify(value));
  }
}

export async function kvDel(key: string): Promise<void> {
  if (preferred === "server") {
    await serverDel(key);
    return;
  }
  try {
    if (preferred !== "local") {
      const db = await idb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  } catch {
    /* 忽略 */
  }
  localStorage.removeItem(`${LS_PREFIX}${key}`);
}
