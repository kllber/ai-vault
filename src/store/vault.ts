import { create } from "zustand";
import { emptyDB, getDB, isBuiltinVendor, isSeedSecret, seedDB, seedIds, setDB, uid } from "@/data/db";
import type {
  Account,
  ApiKey,
  BalanceSnapshot,
  BindRole,
  DB,
  Project,
  Settings,
  Software,
  Vendor,
} from "@/data/types";
import {
  decryptJSON,
  deriveKey,
  encryptJSON,
  newKdfParams,
  type KdfParams,
  type VaultFile,
} from "@/lib/crypto";
import { kvDel, kvGet, kvSet, probeStorage, type StorageBackend } from "@/lib/storage";
import { baseName } from "@/lib/desktop";

const REGISTRY_KEY = "registry";
const ACTIVE_KEY = "active";
const LEGACY_VAULT_KEY = "vault";
const vaultKey = (id: string) => `vault:${id}`;

/** 本机已保存的金库（相当于"账号"） */
export interface VaultRef {
  id: string;
  name: string;
  /** 桌面版：该金库对应的 .aivault 文件路径 */
  path?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

/** 最近记录最多保留几条 */
const MAX_RECENT = 2;

/** 只保留最近打开的 MAX_RECENT 条记录 */
function capRecent(list: VaultRef[]): VaultRef[] {
  if (list.length <= MAX_RECENT) return list;
  const sorted = [...list].sort((a, b) =>
    (a.lastOpenedAt ?? a.createdAt).localeCompare(b.lastOpenedAt ?? b.createdAt),
  );
  const drop = new Set(sorted.slice(0, list.length - MAX_RECENT).map((v) => v.id));
  return list.filter((v) => !drop.has(v.id));
}

export type VaultStatus = "loading" | "login" | "unlocked";

/** 解锁状态下才存在的内存密钥，绝不落盘 */
let secretKey: Uint8Array | null = null;
let kdfParams: KdfParams | null = null;
let createdAtISO = new Date().toISOString();
let persistChain: Promise<void> = Promise.resolve();
let generation = 0;

/**
 * 历史遗留的错误 Base URL 修正表。
 * 例如千问平台域名：`maas.qianwenai.com` 这个域名不存在，正确的是 `maas.qianwenaiapi.com`。
 * 用户的密钥里可能已经被填入了错误地址，这里统一纠正。
 */
const BASE_URL_FIXES: Array<[RegExp, string]> = [
  [/^https?:\/\/maas\.qianwenai\.com/i, "https://maas.qianwenaiapi.com"],
];

export function fixBaseUrl(url: string | null | undefined): string {
  const u = url ?? "";
  for (const [re, to] of BASE_URL_FIXES) {
    if (re.test(u)) return u.replace(re, to);
  }
  return u;
}

function normalize(db: Partial<DB> | null | undefined): DB {
  const base = emptyDB();
  if (!db) return base;

  const rawKeys = (db.apiKeys ?? []) as (ApiKey & {
    balance?: number | null;
    currency?: "USD" | "CNY";
    quotaUsedPct?: number | null;
    expiresAt?: string | null;
  })[];
  const rawAccounts = (db.accounts ?? []) as (Account & {
    balance?: number | null;
    currency?: "USD" | "CNY";
    lastChecked?: string | null;
    membershipExpiresAt?: string | null;
    adminKey?: string | null;
    spent?: number | null;
  })[];

  const apiKeys: ApiKey[] = rawKeys.map((k) => {
    const demo = k.demo === undefined && isSeedSecret(k.secret) ? true : k.demo;
    return {
      id: k.id,
      accountId: k.accountId,
      alias: k.alias,
      secret: k.secret,
      cipherHint: k.cipherHint ?? "AES-256-GCM",
      status: k.status,
      tags: k.tags ?? [],
      baseUrl: fixBaseUrl(k.baseUrl),
      note: k.note ?? "",
      createdAt: k.createdAt,
      lastChecked: k.lastChecked,
      ...(demo ? { demo: true } : {}),
    };
  });

  const accounts: Account[] = rawAccounts.map((a) => {
    let balance = a.balance ?? null;
    let currency = a.currency ?? "CNY";
    let lastChecked = a.lastChecked ?? null;
    if (balance == null) {
      const legacy = rawKeys.find((k) => k.accountId === a.id && k.balance != null);
      if (legacy) {
        balance = legacy.balance ?? null;
        currency = legacy.currency ?? "CNY";
        lastChecked = legacy.lastChecked ?? null;
      }
    }
    // 旧版本把"到期日"记在密钥上，这里迁移到账号的"会员到期日"
    let membershipExpiresAt = a.membershipExpiresAt ?? null;
    if (!membershipExpiresAt) {
      const legacyExpiry = rawKeys.find((k) => k.accountId === a.id && k.expiresAt);
      if (legacyExpiry) membershipExpiresAt = legacyExpiry.expiresAt ?? null;
    }
    return {
      id: a.id,
      vendorId: a.vendorId,
      label: a.label,
      login: a.login ?? "",
      note: a.note ?? "",
      createdAt: a.createdAt,
      balance,
      currency,
      lastChecked,
      membershipExpiresAt,
      adminKey: a.adminKey ?? null,
      spent: a.spent ?? null,
      spentCurrency: a.spentCurrency ?? "USD",
      spentUpdatedAt: a.spentUpdatedAt ?? null,
    };
  });

  const snapshots: BalanceSnapshot[] = (db.snapshots ?? [])
    .map((s) => {
      const raw = s as unknown as {
        id: string;
        at: string;
        balance: number;
        accountId?: string;
        keyId?: string;
      };
      const accountId =
        raw.accountId ?? (raw.keyId ? rawKeys.find((k) => k.id === raw.keyId)?.accountId : undefined);
      if (!accountId || typeof raw.balance !== "number") return null;
      return { id: raw.id, accountId, at: raw.at, balance: raw.balance };
    })
    .filter((s): s is BalanceSnapshot => s !== null);

  return {
    vendors: (db.vendors ?? []).filter((v) => !isBuiltinVendor(v.id)),
    accounts,
    apiKeys,
    softwares: db.softwares ?? base.softwares,
    projects: db.projects ?? base.projects,
    bindings: db.bindings ?? base.bindings,
    snapshots,
    settings: { ...base.settings, ...(db.settings ?? {}) },
  };
}

/**
 * 快照压缩：最近 400 个点保留原始精度，其余按"每天一个点"归档。
 * 这样即使长期频繁变化，文件也不会无限膨胀。
 */
function compactSnapshots(list: BalanceSnapshot[]): BalanceSnapshot[] {
  const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at));
  const RECENT = 400;
  const recent = sorted.slice(-RECENT);
  const older = sorted.slice(0, Math.max(0, sorted.length - RECENT));
  if (!older.length) return recent;

  const byDay = new Map<string, BalanceSnapshot>();
  for (const s of older) {
    const day = s.at.slice(0, 10);
    const cur = byDay.get(day);
    if (!cur || s.at > cur.at) byDay.set(day, s);
  }
  const daily = [...byDay.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-730);
  return [...daily, ...recent].sort((a, b) => a.at.localeCompare(b.at));
}

interface VaultStore {
  status: VaultStatus;
  revision: number;
  error: string | null;
  /** 保存到金库文件失败（如文件被移动/删除）时的错误，界面弹窗提示 */
  saveError: string | null;
  updatedAt: string | null;
  storageBackend: StorageBackend;

  vaults: VaultRef[];
  activeId: string | null;
  /** 从文件读进来、还没注册成金库的临时数据 */
  pending: { envelope: VaultFile; fileName: string; path?: string | null } | null;

  init: () => Promise<void>;
  setActive: (id: string | null) => Promise<void>;
  setPending: (p: { envelope: VaultFile; fileName: string; path?: string | null } | null) => void;

  createVault: (name: string, password: string, withSeed: boolean) => Promise<string | null>;
  openVault: (id: string, password: string) => Promise<boolean>;
  /** 桌面版：新建金库并把内容保存到指定的 .aivault 文件 */
  createVaultAt: (path: string, name: string, password: string, withSeed: boolean) => Promise<string | null>;
  /** 桌面版：打开指定的 .aivault 文件 */
  openVaultAt: (path: string, password: string) => Promise<boolean>;
  /** 桌面版：把当前金库另存为新文件并切换过去 */
  saveAs: (path: string) => Promise<boolean>;
  importFromFile: (envelope: VaultFile, fileName: string, password: string, path?: string | null) => Promise<boolean>;
  renameVault: (id: string, name: string) => Promise<void>;
  deleteVault: (id: string) => Promise<void>;
  resetAll: () => Promise<void>;

  lock: () => Promise<void>;
  clearError: () => void;
  clearSaveError: () => void;
  changePassword: (oldPw: string, newPw: string) => Promise<boolean>;
  exportVault: () => Promise<string>;
  /** 桌面版：立即把未落盘的改动写盘（退出前用） */
  flush: () => Promise<void>;
  /** 从局域网服务拉取当前金库的最新内容（多端自动同步用） */
  pullRemote: () => Promise<boolean>;
  /** 清空当前金库的内容（保留金库与金库密码） */
  clearVaultData: () => void;

  mutate: (fn: (db: DB) => DB) => void;

  addVendor: (v: Omit<Vendor, "id">) => string;
  updateVendor: (id: string, patch: Partial<Vendor>) => void;
  deleteVendor: (id: string) => string | null;

  addAccount: (
    a: Omit<
      Account,
      | "id"
      | "createdAt"
      | "balance"
      | "currency"
      | "lastChecked"
      | "membershipExpiresAt"
      | "adminKey"
      | "spent"
      | "spentCurrency"
      | "spentUpdatedAt"
    > &
      Partial<
        Pick<
          Account,
          | "balance"
          | "currency"
          | "lastChecked"
          | "membershipExpiresAt"
          | "adminKey"
          | "spent"
          | "spentUpdatedAt"
        >
      >,
  ) => string;
  updateAccount: (id: string, patch: Partial<Account>) => void;
  deleteAccount: (id: string) => string | null;

  addKey: (k: Omit<ApiKey, "id" | "createdAt" | "lastChecked" | "cipherHint">) => string;
  updateKey: (id: string, patch: Partial<ApiKey>) => void;
  deleteKey: (id: string) => void;

  addSoftware: (s: Omit<Software, "id">) => string;
  updateSoftware: (id: string, patch: Partial<Software>) => void;
  deleteSoftware: (id: string) => void;

  addProject: (p: Omit<Project, "id">) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  setKeyBindings: (keyId: string, next: { projectId: string; role: BindRole }[]) => void;

  clearDemoData: () => void;

  applyBalance: (accountId: string, balance: number) => void;
  applySpend: (accountId: string, spent: number, currency?: "USD" | "CNY") => void;
  applyValidity: (keyId: string, valid: boolean) => void;
  setSettings: (patch: Partial<Settings>) => void;
}

export const useVault = create<VaultStore>((set, get) => {
  async function loadRegistry(): Promise<VaultRef[]> {
    return (await kvGet<VaultRef[]>(REGISTRY_KEY)) ?? [];
  }
  async function saveRegistry(list: VaultRef[]) {
    await kvSet(REGISTRY_KEY, list);
    set({ vaults: list });
  }

  async function writeNow() {
    if (!secretKey || !kdfParams) return;
    const id = get().activeId;
    if (!id) return;
    const gen = generation;
    const { iv, data } = await encryptJSON(secretKey, getDB());
    if (gen !== generation || !secretKey || !kdfParams) return;
    const env: VaultFile = {
      v: 1,
      kdf: kdfParams,
      iv,
      data,
      meta: { createdAt: createdAtISO, updatedAt: new Date().toISOString() },
    };
    await kvSet(vaultKey(id), env); // 失败会 throw（可能带 code，如 vault-missing）
    // 更新注册表里的时间
    const list = get().vaults.map((v) =>
      v.id === id ? { ...v, updatedAt: env.meta.updatedAt } : v,
    );
    await saveRegistry(list);
    set({ updatedAt: env.meta.updatedAt, saveError: null });
  }

  function handleSaveError(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as { code?: string } | null)?.code;
    if (code === "vault-missing") set({ saveError: msg });
    else set({ error: "保存失败：" + msg });
  }

  async function doPersist() {
    try {
      await writeNow();
    } catch (e) {
      console.error("[vault] 保存失败", e);
      handleSaveError(e);
    }
  }

  function persist() {
    persistChain = persistChain.then(doPersist).catch((e) => {
      console.error("[vault] 保存失败", e);
      set({ error: "保存失败：" + (e instanceof Error ? e.message : String(e)) });
    });
    return persistChain;
  }

  // 防抖保存：连续操作只在停顿后写盘一次；退出/锁定前用 flush() 立即落盘
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  function cancelPending() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  }
  function schedulePersist() {
    // 立即持久化：任何改动都要马上写入金库文件（用户要求，不允许丢失）
    void persist();
  }

  function bump() {
    set((s) => ({ revision: s.revision + 1 }));
  }

  return {
    status: "loading",
    revision: 0,
    error: null,
    saveError: null,
    updatedAt: null,
    storageBackend: "idb",
    vaults: [],
    activeId: null,
    pending: null,

    init: async () => {
      const backend = await probeStorage();
      set({ storageBackend: backend });
      if (backend === "none") {
        set({ error: "当前环境不允许本地保存，请改用桌面版 AI Vault 打开" });
      }
      try {
        let list = await loadRegistry();

        // 兼容旧版本：单金库存储在 "vault" 键下，迁移成一条金库记录
        if (!list.length) {
          const legacy = await kvGet<VaultFile>(LEGACY_VAULT_KEY);
          if (legacy) {
            const id = uid("vault");
            await kvSet(vaultKey(id), legacy);
            const now = new Date().toISOString();
            list = [
              {
                id,
                name: "我的金库",
                createdAt: legacy.meta?.createdAt ?? now,
                updatedAt: legacy.meta?.updatedAt ?? now,
                lastOpenedAt: null,
              },
            ];
            await saveRegistry(list);
            await kvSet(ACTIVE_KEY, id);
            await kvDel(LEGACY_VAULT_KEY);
          }
        }

        const activeId = (await kvGet<string>(ACTIVE_KEY)) ?? null;
        const active = activeId && list.some((v) => v.id === activeId) ? activeId : (list[0]?.id ?? null);
        setDB(emptyDB());
        set({ vaults: list, activeId: active, status: "login" });
      } catch (e) {
        console.error(e);
        set({ status: "login", error: "读取本地存储失败" });
      }
    },

    setActive: async (id) => {
      set({ activeId: id, pending: null, error: null });
      if (id) await kvSet(ACTIVE_KEY, id);
      else await kvDel(ACTIVE_KEY);
    },

    setPending: (p) => set({ pending: p, error: null }),

    createVault: async (name, password, withSeed) => {
      cancelPending();
      generation++;
      await persistChain.catch(() => {});
      persistChain = Promise.resolve();

      kdfParams = newKdfParams();
      secretKey = await deriveKey(password, kdfParams);
      createdAtISO = new Date().toISOString();
      setDB(withSeed ? seedDB() : emptyDB());

      const id = uid("vault");
      const now = new Date().toISOString();
      const ref: VaultRef = {
        id,
        name: name.trim() || "我的金库",
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      };
      const list = capRecent([...get().vaults, ref]);
      set({ vaults: list, activeId: id, pending: null, status: "unlocked", error: null, saveError: null });
      await kvSet(ACTIVE_KEY, id);
      await saveRegistry(list);
      bump();
      await persist();
      return id;
    },

    openVault: async (id, password) => {
      cancelPending();
      const env = await kvGet<VaultFile>(vaultKey(id));
      if (!env) {
        set({ error: "找不到该金库的数据，可能已被清理" });
        return false;
      }
      try {
        const key = await deriveKey(password, env.kdf);
        const data = await decryptJSON<DB>(key, env.iv, env.data);
        generation++;
        await persistChain.catch(() => {});
        persistChain = Promise.resolve();
        secretKey = key;
        kdfParams = env.kdf;
        createdAtISO = env.meta.createdAt;
        setDB(normalize(data));
        const now = new Date().toISOString();
        const list = get().vaults.map((v) =>
          v.id === id ? { ...v, lastOpenedAt: now, updatedAt: env.meta.updatedAt } : v,
        );
        set({ status: "unlocked", error: null, updatedAt: env.meta.updatedAt, activeId: id, pending: null, saveError: null });
        await kvSet(ACTIVE_KEY, id);
        await saveRegistry(list);
        bump();
        return true;
      } catch {
        set({ error: "金库密码错误，请重试" });
        return false;
      }
    },

    createVaultAt: async (filePath, name, password, withSeed) => {
      cancelPending();
      generation++;
      await persistChain.catch(() => {});
      persistChain = Promise.resolve();

      kdfParams = newKdfParams();
      secretKey = await deriveKey(password, kdfParams);
      createdAtISO = new Date().toISOString();
      setDB(withSeed ? seedDB() : emptyDB());

      const id = uid("vault");
      const now = new Date().toISOString();
      const ref: VaultRef = {
        id,
        name: name.trim() || baseName(filePath),
        path: filePath,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      };
      const list = capRecent([...get().vaults, ref]);
      set({ vaults: list, activeId: id, pending: null, status: "unlocked", error: null, saveError: null });
      await kvSet(ACTIVE_KEY, id);
      await saveRegistry(list);
      bump();
      await persist(); // 服务端把密文写进该 .aivault 文件
      return id;
    },

    openVaultAt: async (filePath, password) => {
      cancelPending();
      const existing = get().vaults.find((v) => v.path === filePath);
      const id = existing ? existing.id : uid("vault");
      const now = new Date().toISOString();
      const list = existing
        ? get().vaults.map((v) => (v.id === id ? { ...v, lastOpenedAt: now } : v))
        : capRecent([
            ...get().vaults,
            { id, name: baseName(filePath), path: filePath, createdAt: now, updatedAt: now, lastOpenedAt: now },
          ]);
      // 先登记路径，服务端才知道 vault:<id> 该读哪个文件
      await saveRegistry(list);
      const ok = await get().openVault(id, password);
      if (!ok && !existing) {
        const cleaned = get().vaults.filter((v) => v.id !== id);
        await saveRegistry(cleaned);
        set({ vaults: cleaned });
      }
      return ok;
    },

    saveAs: async (filePath) => {
      const curId = get().activeId;
      const cur = curId ? get().vaults.find((v) => v.id === curId) : undefined;
      if (!curId || !cur || !secretKey || !kdfParams) return false;
      cancelPending();
      const now = new Date().toISOString();

      if (!cur.path) {
        // 迁移"内部金库"：直接给当前这条记录加上文件路径（保持同一条，不新增，避免重复/反复提示）
        const list = get().vaults.map((v) =>
          v.id === curId
            ? { ...v, path: filePath, updatedAt: now, lastOpenedAt: now }
            : v,
        );
        await saveRegistry(list);
        set({ vaults: list, error: null });
        try {
          await writeNow(); // 新 id 未在"已写过"里，允许创建该文件
          set({ saveError: null });
        } catch (e) {
          handleSaveError(e);
          return false;
        }
        bump();
        return true;
      }

      // 文件型金库"另存为"：新建记录 + 新 id，并移除旧记录（旧文件已另存/丢失，避免混淆）
      const id = uid("vault");
      const ref: VaultRef = {
        id,
        name: baseName(filePath),
        path: filePath,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      };
      const list = capRecent([...get().vaults.filter((v) => v.id !== curId), ref]);
      await saveRegistry(list); // 先登记新路径，服务端才会写到新文件
      generation++;
      persistChain = Promise.resolve();
      set({ vaults: list, activeId: id, error: null });
      await kvSet(ACTIVE_KEY, id);
      try {
        await writeNow(); // 把当前内存里的金库写到新文件（不依赖旧文件是否还在）
        set({ saveError: null });
      } catch (e) {
        handleSaveError(e);
        return false;
      }
      bump();
      return true;
    },

    importFromFile: async (envelope, fileName, password, path) => {
      try {
        if (!envelope || envelope.v !== 1 || !envelope.kdf || !envelope.iv || !envelope.data) {
          set({ error: "文件格式不正确，不是有效的 .aivault 文件" });
          return false;
        }
        const key = await deriveKey(password, envelope.kdf);
        const data = await decryptJSON<DB>(key, envelope.iv, envelope.data);
        cancelPending();
        generation++;
        await persistChain.catch(() => {});
        persistChain = Promise.resolve();
        secretKey = key;
        kdfParams = envelope.kdf;
        createdAtISO = envelope.meta?.createdAt ?? new Date().toISOString();
        setDB(normalize(data));

        const now = new Date().toISOString();
        const name = fileName.replace(/\.aivault$/i, "") || "导入的金库";
        const existing = path ? get().vaults.find((v) => v.path === path) : undefined;
        const id = existing ? existing.id : uid("vault");
        const list = existing
          ? get().vaults.map((v) =>
              v.id === id
                ? {
                    ...v,
                    path: path ?? v.path,
                    name,
                    lastOpenedAt: now,
                    updatedAt: envelope.meta?.updatedAt ?? now,
                  }
                : v,
            )
          : capRecent([
              ...get().vaults,
              {
                id,
                name,
                // 拖入/选择本地文件时绑定其路径；之后所有改动写回该文件（否则退化为内部存储）
                path: path || undefined,
                createdAt: envelope.meta?.createdAt ?? now,
                updatedAt: envelope.meta?.updatedAt ?? now,
                lastOpenedAt: now,
              },
            ]);
        set({
          vaults: list,
          activeId: id,
          pending: null,
          status: "unlocked",
          error: null,
          updatedAt: now,
          saveError: null,
        });
        await kvSet(ACTIVE_KEY, id);
        await saveRegistry(list);
        // 登记后再写一次密文：
        // - 有路径（桌面版）：让服务端把密文写回该 .aivault 文件，并记住"这个文件存在"以便日后检测被删；
        // - 无路径（浏览器 / 手机）：把密文存进存储后端，否则刷新后会打不开（提示"找不到该金库的数据"）
        await kvSet(vaultKey(id), envelope);
        bump();
        return true;
      } catch {
        set({ error: "导入失败：密码错误或文件损坏" });
        return false;
      }
    },

    renameVault: async (id, name) => {
      await saveRegistry(get().vaults.map((v) => (v.id === id ? { ...v, name } : v)));
    },

    deleteVault: async (id) => {
      // 只从"最近记录"里移除，绝不删除用户的金库数据/文件
      const list = get().vaults.filter((v) => v.id !== id);
      await saveRegistry(list);
      const activeId = get().activeId === id ? (list[0]?.id ?? null) : get().activeId;
      set({ activeId, pending: null });
      if (activeId) await kvSet(ACTIVE_KEY, activeId);
      else await kvDel(ACTIVE_KEY);
    },

    resetAll: async () => {
      cancelPending();
      generation++;
      const list = get().vaults;
      for (const v of list) await kvDel(vaultKey(v.id));
      await kvDel(REGISTRY_KEY);
      await kvDel(ACTIVE_KEY);
      await kvDel(LEGACY_VAULT_KEY);
      secretKey = null;
      kdfParams = null;
      setDB(emptyDB());
      set({ vaults: [], activeId: null, pending: null, status: "login", error: null });
      bump();
    },

    lock: async () => {
      cancelPending();
      await persist().catch(() => {});
      generation++;
      secretKey = null;
      kdfParams = null;
      setDB(emptyDB());
      set({ status: "login", error: null, pending: null, saveError: null });
      bump();
    },

    clearError: () => set({ error: null }),
    clearSaveError: () => set({ saveError: null }),

    clearVaultData: () => {
      setDB(emptyDB());
      bump();
      schedulePersist();
    },

    changePassword: async (oldPw, newPw) => {
      const id = get().activeId;
      if (!id) return false;
      const env = await kvGet<VaultFile>(vaultKey(id));
      if (!env) return false;
      try {
        const oldKey = await deriveKey(oldPw, env.kdf);
        await decryptJSON(oldKey, env.iv, env.data);
      } catch {
        set({ error: "原密码不正确" });
        return false;
      }
      kdfParams = newKdfParams();
      cancelPending();
      generation++;
      await persistChain.catch(() => {});
      persistChain = Promise.resolve();
      secretKey = await deriveKey(newPw, kdfParams);
      await persist();
      set({ error: null });
      return true;
    },

    exportVault: async () => {
      await persistChain;
      const id = get().activeId;
      if (!id) return "";
      const env = await kvGet<VaultFile>(vaultKey(id));
      if (!env) return "";
      return JSON.stringify(env, null, 2);
    },

    flush: async () => {
      cancelPending();
      await persistChain.catch(() => {});
      try {
        await writeNow();
      } catch (e) {
        handleSaveError(e);
        throw e;
      }
    },

    pullRemote: async () => {
      const id = get().activeId;
      if (!id || !secretKey) return false;
      // 先把本地尚未落盘的改动写完，避免被下面的整体替换丢弃
      await persistChain.catch(() => {});
      const env = await kvGet<VaultFile>(vaultKey(id));
      if (!env) return false;
      let data: DB;
      try {
        data = await decryptJSON<DB>(secretKey, env.iv, env.data);
      } catch {
        // 远端可能改了密码/数据异常，保持本地不动
        return false;
      }
      const list = await loadRegistry();
      generation++;
      persistChain = Promise.resolve();
      setDB(normalize(data));
      set({ vaults: list, updatedAt: env.meta?.updatedAt ?? get().updatedAt, error: null });
      bump();
      return true;
    },

    mutate: (fn) => {
      setDB(fn(getDB()));
      bump();
      schedulePersist();
    },

    /* ---------------- 厂商 ---------------- */
    addVendor: (v) => {
      const id = uid("v");
      get().mutate((db) => ({ ...db, vendors: [...db.vendors, { ...v, id }] }));
      return id;
    },
    updateVendor: (id, patch) =>
      get().mutate((db) => ({
        ...db,
        vendors: db.vendors.map((v) => (v.id === id ? { ...v, ...patch } : v)),
      })),
    deleteVendor: (id) => {
      const db = getDB();
      if (isBuiltinVendor(id)) return "这是预设厂商，不能删除";
      if (db.accounts.some((a) => a.vendorId === id)) return "该厂商下还有账号，请先删除账号";
      get().mutate((d) => ({ ...d, vendors: d.vendors.filter((v) => v.id !== id) }));
      return null;
    },

    /* ---------------- 账号 ---------------- */
    addAccount: (a) => {
      const id = uid("acc");
      get().mutate((db) => ({
        ...db,
        accounts: [
          ...db.accounts,
          {
            ...a,
            id,
            createdAt: new Date().toISOString(),
            balance: a.balance ?? null,
            currency: a.currency ?? "CNY",
            lastChecked: a.lastChecked ?? null,
            membershipExpiresAt: a.membershipExpiresAt ?? null,
            adminKey: a.adminKey ?? null,
            spent: a.spent ?? null,
            spentCurrency: "USD" as const,
            spentUpdatedAt: a.spentUpdatedAt ?? null,
          },
        ],
      }));
      return id;
    },
    updateAccount: (id, patch) =>
      get().mutate((db) => ({
        ...db,
        accounts: db.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
      })),
    deleteAccount: (id) => {
      const db = getDB();
      if (db.apiKeys.some((k) => k.accountId === id)) return "该账号下还有密钥，请先删除密钥";
      get().mutate((d) => ({ ...d, accounts: d.accounts.filter((a) => a.id !== id) }));
      return null;
    },

    /* ---------------- 密钥 ---------------- */
    addKey: (k) => {
      const id = uid("k");
      const now = new Date().toISOString();
      get().mutate((db) => ({
        ...db,
        apiKeys: [
          ...db.apiKeys,
          { ...k, id, cipherHint: "AES-256-GCM", createdAt: now, lastChecked: now },
        ],
      }));
      return id;
    },
    updateKey: (id, patch) => {
      const now = new Date().toISOString();
      get().mutate((db) => ({
        ...db,
        apiKeys: db.apiKeys.map((k) => (k.id === id ? { ...k, ...patch, lastChecked: now } : k)),
      }));
    },
    deleteKey: (id) =>
      get().mutate((db) => ({
        ...db,
        apiKeys: db.apiKeys.filter((k) => k.id !== id),
        bindings: db.bindings.filter((b) => b.keyId !== id),
      })),

    /* ---------------- 软件 ---------------- */
    addSoftware: (s) => {
      const id = uid("sw");
      get().mutate((db) => ({ ...db, softwares: [...db.softwares, { ...s, id }] }));
      return id;
    },
    updateSoftware: (id, patch) =>
      get().mutate((db) => ({
        ...db,
        softwares: db.softwares.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      })),
    deleteSoftware: (id) =>
      get().mutate((db) => {
        const projectIds = db.projects.filter((p) => p.softwareId === id).map((p) => p.id);
        return {
          ...db,
          softwares: db.softwares.filter((s) => s.id !== id),
          projects: db.projects.filter((p) => p.softwareId !== id),
          bindings: db.bindings.filter((b) => !projectIds.includes(b.projectId)),
        };
      }),

    /* ---------------- 项目 ---------------- */
    addProject: (p) => {
      const id = uid("p");
      get().mutate((db) => ({ ...db, projects: [...db.projects, { ...p, id }] }));
      return id;
    },
    updateProject: (id, patch) =>
      get().mutate((db) => ({
        ...db,
        projects: db.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      })),
    deleteProject: (id) =>
      get().mutate((db) => ({
        ...db,
        projects: db.projects.filter((p) => p.id !== id),
        bindings: db.bindings.filter((b) => b.projectId !== id),
      })),

    /* ---------------- 绑定 ---------------- */
    setKeyBindings: (keyId, next) =>
      get().mutate((db) => ({
        ...db,
        bindings: [
          ...db.bindings.filter((b) => b.keyId !== keyId),
          ...next.map((n) => ({ keyId, projectId: n.projectId, role: n.role })),
        ],
      })),

    /* ---------------- 示例数据 ---------------- */
    clearDemoData: () =>
      get().mutate((db) => {
        const si = seedIds();
        const apiKeys = db.apiKeys.filter((k) => !k.demo);
        const keyIds = new Set(apiKeys.map((k) => k.id));
        const bindings = db.bindings.filter((b) => keyIds.has(b.keyId));
        const projectIds = new Set(bindings.map((b) => b.projectId));
        const accountIds = new Set(apiKeys.map((k) => k.accountId));

        const projects = db.projects.filter((p) => projectIds.has(p.id) || !si.projects.has(p.id));
        const softwareIds = new Set(projects.map((p) => p.softwareId));
        const softwares = db.softwares.filter((s) => softwareIds.has(s.id) || !si.softwares.has(s.id));
        const accounts = db.accounts.filter((a) => accountIds.has(a.id) || !si.accounts.has(a.id));
        const vendorIds = new Set(accounts.map((a) => a.vendorId));
        const vendors = db.vendors.filter((v) => vendorIds.has(v.id) || !si.vendors.has(v.id));
        const snapshots = db.snapshots.filter((s) => accountIds.has(s.accountId));

        return { ...db, apiKeys, bindings, projects, softwares, accounts, vendors, snapshots };
      }),

    /* ---------------- 余额 / 有效性 ---------------- */
    applyBalance: (accountId, balance) =>
      get().mutate((db) => {
        const now = new Date().toISOString();
        const mine = db.snapshots
          .filter((s) => s.accountId === accountId)
          .sort((a, b) => a.at.localeCompare(b.at));
        const last = mine[mine.length - 1];
        const changed = !last || Math.abs(last.balance - balance) > 0.005;

        const withNew = changed
          ? [...db.snapshots, { id: uid("snap"), accountId, at: now, balance }]
          : db.snapshots;

        const others = withNew.filter((s) => s.accountId !== accountId);
        const kept = compactSnapshots(withNew.filter((s) => s.accountId === accountId));

        return {
          ...db,
          accounts: db.accounts.map((a) =>
            a.id === accountId ? { ...a, balance, lastChecked: now } : a,
          ),
          snapshots: [...others, ...kept],
        };
      }),

    applySpend: (accountId, spent, currency = "USD") =>
      get().mutate((db) => ({
        ...db,
        accounts: db.accounts.map((a) =>
          a.id === accountId
            ? { ...a, spent, spentCurrency: currency, spentUpdatedAt: new Date().toISOString() }
            : a,
        ),
      })),

    applyValidity: (keyId, valid) =>
      get().mutate((db) => ({
        ...db,
        apiKeys: db.apiKeys.map((k) =>
          k.id === keyId
            ? { ...k, status: valid ? "active" : "invalid", lastChecked: new Date().toISOString() }
            : k,
        ),
      })),

    setSettings: (patch) =>
      get().mutate((db) => ({ ...db, settings: { ...db.settings, ...patch } })),
  };
});
