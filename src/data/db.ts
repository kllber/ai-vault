import type {
  Account,
  ApiKey,
  BalanceSnapshot,
  BindRole,
  Binding,
  DB,
  Project,
  Settings,
  Software,
  Vendor,
} from "./types";

/* ------------------------------------------------------------------ */
/* 当前数据库（内存中的单一真源）                                       */
/* ------------------------------------------------------------------ */
let current: DB = emptyDB();

export const getDB = () => current;
export const setDB = (db: DB) => {
  current = db;
};

export function defaultSettings(): Settings {
  return {
    usdToCny: 7.12,
    rateUpdatedAt: null,
    autoRefreshOnOpen: true,
    autoRateOnOpen: true,
    lastRefreshAt: null,
    balanceIntervalMin: 3,
    rateIntervalMin: 30,
  };
}

/** 判断某个密钥值是否属于内置示例数据（用于把旧版本金库里的示例标记补上） */
let _seedSecrets: Set<string> | null = null;
export function isSeedSecret(secret: string): boolean {
  if (!_seedSecrets) _seedSecrets = new Set(seedDB().apiKeys.map((k) => k.secret));
  return _seedSecrets.has(secret);
}

/** 内置示例数据的 id 集合（用于精准清除示例，而不误删用户自己建的） */
let _seedIds: {
  vendors: Set<string>;
  accounts: Set<string>;
  softwares: Set<string>;
  projects: Set<string>;
} | null = null;
export function seedIds() {
  if (!_seedIds) {
    const s = seedDB();
    _seedIds = {
      vendors: new Set(s.vendors.map((x) => x.id)),
      accounts: new Set(s.accounts.map((x) => x.id)),
      softwares: new Set(s.softwares.map((x) => x.id)),
      projects: new Set(s.projects.map((x) => x.id)),
    };
  }
  return _seedIds;
}

/* ------------------------------------------------------------------ */
/* 内置厂商目录（程序自带，清空金库不会删除；用户自定义的厂商另存于 DB） */
/* ------------------------------------------------------------------ */
export const BUILTIN_VENDORS: Vendor[] = [
  { id: "openai", name: "OpenAI", short: "GPT / o 系列", glyph: "O", icon: "openai", gradient: "linear-gradient(135deg,#10a37f,#0b7a5f)", ring: "rgba(16,163,127,0.55)", region: "海外" },
  { id: "anthropic", name: "Anthropic", short: "Claude", glyph: "A", icon: "anthropic", gradient: "linear-gradient(135deg,#d97757,#a8492b)", ring: "rgba(217,119,87,0.55)", region: "海外" },
  { id: "deepseek", name: "DeepSeek", short: "V3 / R1", glyph: "D", icon: "deepseek", gradient: "linear-gradient(135deg,#4d6bfe,#2b3fd6)", ring: "rgba(77,107,254,0.55)", region: "国内" },
  { id: "qianwen", name: "通义千问", short: "Qwen / 千问AI平台", glyph: "千", icon: "qwen", gradient: "linear-gradient(135deg,#6d5bff,#a855f7)", ring: "rgba(139,92,246,0.55)", region: "国内" },
  { id: "zhipu", name: "智谱 GLM", short: "GLM-4 系列", glyph: "智", gradient: "linear-gradient(135deg,#6366f1,#8b5cf6)", ring: "rgba(124,92,255,0.55)", region: "国内" },
  { id: "moonshot", name: "Moonshot", short: "Kimi", glyph: "K", gradient: "linear-gradient(135deg,#7c3aed,#312e81)", ring: "rgba(124,58,237,0.55)", region: "国内" },
  { id: "siliconflow", name: "硅基流动", short: "SiliconFlow", glyph: "硅", gradient: "linear-gradient(135deg,#06b6d4,#0ea5e9)", ring: "rgba(6,182,212,0.55)", region: "国内" },
  { id: "openrouter", name: "OpenRouter", short: "聚合路由", glyph: "R", icon: "openrouter", gradient: "linear-gradient(135deg,#a855f7,#ec4899)", ring: "rgba(168,85,247,0.55)", region: "海外" },
  { id: "gemini", name: "Google Gemini", short: "Gemini Pro", glyph: "✦", icon: "googlegemini", gradient: "linear-gradient(135deg,#4285f4,#34a853)", ring: "rgba(66,133,244,0.55)", region: "海外" },
  { id: "xai", name: "xAI", short: "Grok", glyph: "x", icon: "x", gradient: "linear-gradient(135deg,#e2e8f0,#7c8497)", ring: "rgba(226,232,240,0.4)", region: "海外" },
];

export const isBuiltinVendor = (id: string) => BUILTIN_VENDORS.some((v) => v.id === id);

/** 全部可选厂商 = 内置目录 + 用户自定义（按 id 去重，内置优先） */
export const allVendors = (): Vendor[] => {
  const builtinIds = new Set(BUILTIN_VENDORS.map((v) => v.id));
  return [...BUILTIN_VENDORS, ...current.vendors.filter((v) => !builtinIds.has(v.id))];
};

export const vendorById = (id: string) =>
  current.vendors.find((v) => v.id === id) ?? BUILTIN_VENDORS.find((v) => v.id === id) ?? null;

export function emptyDB(): DB {
  return {
    vendors: [],
    accounts: [],
    apiKeys: [],
    softwares: [],
    projects: [],
    bindings: [],
    snapshots: [],
    settings: defaultSettings(),
  };
}

export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ------------------------------------------------------------------ */
/* 查询辅助                                                            */
/* ------------------------------------------------------------------ */
export const accountById = (id: string) => current.accounts.find((a) => a.id === id) ?? null;
export const softwareById = (id: string) => current.softwares.find((s) => s.id === id) ?? null;
export const projectById = (id: string) => current.projects.find((p) => p.id === id) ?? null;

export const keyAccount = (key: ApiKey) => accountById(key.accountId);
export const keyVendor = (key: ApiKey) => {
  const a = keyAccount(key);
  return a ? vendorById(a.vendorId) : null;
};

export const accountsOfVendor = (vendorId: string) =>
  current.accounts.filter((a) => a.vendorId === vendorId);
export const keysOfAccount = (accountId: string) =>
  current.apiKeys.filter((k) => k.accountId === accountId);
export const keysOfVendor = (vendorId: string) =>
  current.apiKeys.filter((k) => keyAccount(k)?.vendorId === vendorId);

export const projectsOfSoftware = (softwareId: string) =>
  current.projects.filter((p) => p.softwareId === softwareId);
export const bindingsOfKey = (keyId: string) =>
  current.bindings.filter((b) => b.keyId === keyId);
export const bindingsOfProject = (projectId: string) =>
  current.bindings.filter((b) => b.projectId === projectId);

export interface KeyUsage {
  binding: Binding;
  project: Project;
  software: Software;
}

/** 这把密钥用在哪些「软件 / 项目」上 */
export function keyUsages(keyId: string): KeyUsage[] {
  return bindingsOfKey(keyId)
    .map((binding) => {
      const project = projectById(binding.projectId);
      if (!project) return null;
      const software = softwareById(project.softwareId);
      if (!software) return null;
      return { binding, project, software };
    })
    .filter((x): x is KeyUsage => x !== null);
}

export interface ProjectKey {
  binding: Binding;
  key: ApiKey;
  account: Account | null;
  vendor: Vendor | null;
}

/** 这个项目在用哪些密钥（含主备角色） */
export function projectKeys(projectId: string): ProjectKey[] {
  return bindingsOfProject(projectId)
    .map((binding) => {
      const key = current.apiKeys.find((k) => k.id === binding.keyId);
      if (!key) return null;
      const account = accountById(key.accountId);
      return { binding, key, account, vendor: account ? vendorById(account.vendorId) : null };
    })
    .filter((x): x is ProjectKey => x !== null);
}

export const primaryCount = (projectId: string) =>
  current.bindings.filter((b) => b.projectId === projectId && b.role === "primary").length;

/** 生成一个厂商没被占用时的默认配色 */
const PALETTE = [
  "linear-gradient(135deg,#7c5cff,#4d6bfe)",
  "linear-gradient(135deg,#10a37f,#0b7a5f)",
  "linear-gradient(135deg,#d97757,#a8492b)",
  "linear-gradient(135deg,#06b6d4,#0ea5e9)",
  "linear-gradient(135deg,#a855f7,#ec4899)",
  "linear-gradient(135deg,#f59e0b,#ef4444)",
  "linear-gradient(135deg,#22c55e,#0d9488)",
  "linear-gradient(135deg,#6366f1,#8b5cf6)",
];
export const paletteFor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};
export const ringFor = (seed: string) => {
  const g = paletteFor(seed);
  const m = g.match(/#([0-9a-f]{6})/i);
  const hex = m ? m[1] : "7c5cff";
  const r = parseInt(hex.slice(0, 2), 16);
  const gg = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${gg},${b},0.55)`;
};

/* ------------------------------------------------------------------ */
/* 余额快照                                                            */
/* ------------------------------------------------------------------ */
export const snapshotsOf = (accountId: string) =>
  current.snapshots
    .filter((s) => s.accountId === accountId)
    .sort((a, b) => a.at.localeCompare(b.at));

/** 由快照差值估算该账号的日消耗（正数 = 每天消耗金额），采样点不足返回 null */
export function dailyBurn(accountId: string): number | null {
  const list = snapshotsOf(accountId);
  if (list.length < 2) return null;
  const first = list[0];
  const last = list[list.length - 1];
  const days = (new Date(last.at).getTime() - new Date(first.at).getTime()) / 86400000;
  if (days <= 0) return null;
  const used = first.balance - last.balance;
  if (used <= 0) return 0; // 没降（没用或已充值）
  return used / days;
}

/** 结合账号余额估算还能用多少天 */
export function daysLeft(accountId: string, balance: number | null): number | null {
  if (balance == null) return null;
  const burn = dailyBurn(accountId);
  if (burn == null || burn <= 0) return null;
  return balance / burn;
}

/**
 * 全部账号的"总余额"时间序列（折算成 CNY），用于画真实趋势。
 * 按时间点取每个账号当时最近一次快照，求和；相邻相同值会被去掉。
 * 采样点不足 2 个时返回空数组（界面就不画图，而不是画假图）。
 */
export function balanceSeries(rate: number, maxPoints = 24): number[] {
  const accts = current.accounts;
  if (!accts.length || current.snapshots.length < 2) return [];
  const byAccount = new Map<string, BalanceSnapshot[]>();
  for (const s of current.snapshots) {
    const list = byAccount.get(s.accountId);
    if (list) list.push(s);
    else byAccount.set(s.accountId, [s]);
  }
  for (const list of byAccount.values()) list.sort((a, b) => a.at.localeCompare(b.at));

  const times = [...new Set(current.snapshots.map((s) => s.at))].sort();
  const series: number[] = [];
  for (const t of times) {
    let sum = 0;
    for (const a of accts) {
      const list = byAccount.get(a.id);
      if (!list) continue;
      let lastBal: number | null = null;
      for (const s of list) {
        if (s.at <= t) lastBal = s.balance;
        else break;
      }
      if (lastBal != null) sum += a.currency === "USD" ? lastBal * rate : lastBal;
    }
    series.push(Number(sum.toFixed(2)));
  }

  const dedup = series.filter((v, i) => i === 0 || Math.abs(v - series[i - 1]) > 0.005);
  return dedup.length >= 2 ? dedup.slice(-maxPoints) : [];
}

/** 会员 / 套餐还剩多少天（负数表示已过期） */
export const membershipDaysLeft = (a: Account): number | null =>
  a.membershipExpiresAt
    ? Math.ceil((new Date(a.membershipExpiresAt).getTime() - Date.now()) / 86400000)
    : null;

/** 即将到期的会员/套餐（默认 14 天内），按剩余天数升序 */
export function expiringMemberships(withinDays = 14): Account[] {
  return current.accounts
    .filter((a) => {
      const d = membershipDaysLeft(a);
      return d != null && d <= withinDays;
    })
    .sort((x, y) => (membershipDaysLeft(x) ?? 0) - (membershipDaysLeft(y) ?? 0));
}

/* ------------------------------------------------------------------ */
/* 示例数据（首次创建金库时可选载入）                                   */
/* ------------------------------------------------------------------ */
const ago = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
const days = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

export function seedDB(): DB {
  const accounts: Account[] = [
    { id: "acc-oai-main", vendorId: "openai", label: "个人主号", login: "me@gmail.com", note: "绑定了个人信用卡。", createdAt: ago(24 * 210), balance: 42.18, currency: "USD", lastChecked: ago(2), membershipExpiresAt: days(23) },
    { id: "acc-oai-team", vendorId: "openai", label: "团队工作区", login: "team@corp.com", note: "公司统一付费，额度池较大。", createdAt: ago(24 * 160), balance: 120, currency: "USD", lastChecked: ago(2), membershipExpiresAt: null },
    { id: "acc-ant-team", vendorId: "anthropic", label: "团队工作区", login: "team@corp.com", note: "按 token 计费，无余额接口。", createdAt: ago(24 * 140), balance: null, currency: "USD", lastChecked: null, membershipExpiresAt: days(9) },
    { id: "acc-ds-a", vendorId: "deepseek", label: "手机号账号", login: "138****1234", note: "个人常用，创建了多把 key 分场景使用。", createdAt: ago(24 * 96), balance: 18.64, currency: "CNY", lastChecked: ago(1), membershipExpiresAt: null },
    { id: "acc-ds-b", vendorId: "deepseek", label: "工作邮箱", login: "work@corp.com", note: "工作专用，给 Cursor 备用。", createdAt: ago(24 * 30), balance: 44.05, currency: "CNY", lastChecked: ago(3), membershipExpiresAt: null },
    { id: "acc-zhipu-main", vendorId: "zhipu", label: "主账号", login: "138****1234", note: "国内直连稳定，买了编程套餐。", createdAt: ago(24 * 80), balance: 73.5, currency: "CNY", lastChecked: ago(1), membershipExpiresAt: days(5) },
    { id: "acc-moon-main", vendorId: "moonshot", label: "主账号", login: "me@qq.com", note: "长文本场景。", createdAt: ago(24 * 45), balance: 51.35, currency: "CNY", lastChecked: ago(3), membershipExpiresAt: null },
    { id: "acc-sf-main", vendorId: "siliconflow", label: "主账号", login: "138****1234", note: "开源模型 + 多模态。", createdAt: ago(24 * 30), balance: 27.9, currency: "CNY", lastChecked: ago(4), membershipExpiresAt: null },
    { id: "acc-or-main", vendorId: "openrouter", label: "主账号", login: "me@gmail.com", note: "聚合路由，做主备切换。", createdAt: ago(24 * 22), balance: 9.75, currency: "USD", lastChecked: ago(6), membershipExpiresAt: null },
    { id: "acc-gemini-main", vendorId: "gemini", label: "个人账号", login: "me@gmail.com", note: "免费层。", createdAt: ago(24 * 18), balance: null, currency: "USD", lastChecked: null, membershipExpiresAt: days(61) },
    { id: "acc-xai-main", vendorId: "xai", label: "尝鲜账号", login: "me@gmail.com", note: "刚申请。", createdAt: ago(6), balance: null, currency: "USD", lastChecked: null, membershipExpiresAt: null },
  ];

  const softwares: Software[] = [
    { id: "sw-cursor", name: "Cursor", glyph: "⌘", accent: "#7c5cff", category: "代码编辑器" },
    { id: "sw-claude", name: "Claude Desktop", glyph: "✳", accent: "#d97757", category: "桌面客户端" },
    { id: "sw-chatbot", name: "客服系统", glyph: "◈", accent: "#35e6d0", category: "自研 · Web 服务" },
    { id: "sw-scripts", name: "自动化脚本集", glyph: "⚙", accent: "#4d6bfe", category: "自研 · Python" },
    { id: "sw-research", name: "论文助手", glyph: "研", accent: "#a855f7", category: "自研 · Web 应用" },
    { id: "sw-daily", name: "个人工具", glyph: "◍", accent: "#ff5c9d", category: "个人杂项" },
  ];

  const projects: Project[] = [
    { id: "p-be", softwareId: "sw-cursor", name: "后端重构" },
    { id: "p-fe", softwareId: "sw-cursor", name: "前端组件库" },
    { id: "p-arch", softwareId: "sw-claude", name: "技术方案讨论" },
    { id: "p-live", softwareId: "sw-chatbot", name: "线上机器人" },
    { id: "p-stage", softwareId: "sw-chatbot", name: "测试环境" },
    { id: "p-translate", softwareId: "sw-scripts", name: "文档翻译批处理" },
    { id: "p-codegen", softwareId: "sw-scripts", name: "代码生成管线" },
    { id: "p-survey", softwareId: "sw-research", name: "综述写作" },
    { id: "p-material", softwareId: "sw-research", name: "资料整理" },
    { id: "p-qa", softwareId: "sw-daily", name: "日常问答" },
  ];

  // 示例密钥仍带着 balance/currency/quotaUsedPct/expiresAt 字段，这里统一丢弃
  const mk = (
    k: Omit<ApiKey, "cipherHint" | "demo"> & {
      balance?: number | null;
      currency?: "USD" | "CNY";
      quotaUsedPct?: number | null;
      expiresAt?: string | null;
    },
  ): ApiKey => {
    const {
      balance: _balance,
      currency: _currency,
      quotaUsedPct: _quota,
      expiresAt: _expiresAt,
      ...rest
    } = k;
    void _balance;
    void _currency;
    void _quota;
    void _expiresAt;
    return { ...rest, cipherHint: "AES-256-GCM", demo: true };
  };

  const apiKeys: ApiKey[] = [
    mk({ id: "k1", accountId: "acc-oai-main", alias: "OpenAI · 主号", secret: "sk-proj-demo8Fq2LmW7xT4bZ9cV1nR6yP3kJ5hG4f2a", status: "active", balance: 42.18, currency: "USD", quotaUsedPct: 58, expiresAt: null, tags: ["生产", "主力"], baseUrl: "https://api.openai.com/v1", note: "客服系统主力 key。", createdAt: ago(24 * 210), lastChecked: ago(2) }),
    mk({ id: "k17", accountId: "acc-oai-team", alias: "OpenAI · 团队生产", secret: "sk-proj-demoQ7wE3rT9yU2iO5pA8sD1fG6hJ4kL7b3e", status: "active", balance: 120, currency: "USD", quotaUsedPct: 21, expiresAt: null, tags: ["生产", "团队"], baseUrl: "https://api.openai.com/v1", note: "Cursor 两个项目都用它。", createdAt: ago(24 * 160), lastChecked: ago(2) }),
    mk({ id: "k9", accountId: "acc-oai-main", alias: "OpenAI · 测试号", secret: "sk-proj-demoZx1Cv2Bn3Ma4Sd5Fg6Hj7Kl8Qw9Er9d0c", status: "invalid", balance: 0, currency: "USD", quotaUsedPct: 100, expiresAt: null, tags: ["测试", "已失效"], baseUrl: "https://api.openai.com/v1", note: "额度用尽，密钥已吊销，等待删除。", createdAt: ago(24 * 300), lastChecked: ago(12) }),
    mk({ id: "k2", accountId: "acc-ant-team", alias: "Claude · 工作区", secret: "sk-ant-api03-demo9Kd3Lp5Mn7Bv1Cx2Za4Sf6Gh8Jk0LzP7q", status: "active", balance: null, currency: "USD", quotaUsedPct: 34, expiresAt: null, tags: ["生产"], baseUrl: "https://api.anthropic.com/v1", note: "团队工作区，只能看用量。", createdAt: ago(24 * 140), lastChecked: ago(5) }),
    mk({ id: "k3", accountId: "acc-ds-a", alias: "DS-主力对话", secret: "sk-demo7Rd2Fh4Jk6Lm8Np1Qr3St5Uv7Wx9Yz8c1d", status: "active", balance: 18.64, currency: "CNY", quotaUsedPct: 12, expiresAt: null, tags: ["生产", "性价比"], baseUrl: "https://api.deepseek.com", note: "翻译与日常对话。", createdAt: ago(24 * 96), lastChecked: ago(1) }),
    mk({ id: "k15", accountId: "acc-ds-a", alias: "DS-批量脚本", secret: "sk-demo3Gj5Hl7Km9Np2Qr4St6Uv8Wx1Yz3Ab2e5f", status: "active", balance: 31.2, currency: "CNY", quotaUsedPct: 8, expiresAt: null, tags: ["生产", "批处理"], baseUrl: "https://api.deepseek.com", note: "同一账号下另开的一把，专供代码生成管线。", createdAt: ago(24 * 40), lastChecked: ago(1) }),
    mk({ id: "k16", accountId: "acc-ds-a", alias: "DS-测试临时", secret: "sk-demo5Ik7Jl9Km1Np3Qr5St7Uv9Wx2Yz4Bc0a9c", status: "unchecked", balance: 0, currency: "CNY", quotaUsedPct: null, expiresAt: days(3), tags: ["测试"], baseUrl: "https://api.deepseek.com", note: "临时申请的，用完即删。", createdAt: ago(4), lastChecked: ago(4) }),
    mk({ id: "k11", accountId: "acc-ds-b", alias: "DS-工作号", secret: "sk-demo9Mn2Op4Qr6St8Uv1Wx3Yz5Ab7Cd1a7b", status: "active", balance: 44.05, currency: "CNY", quotaUsedPct: 5, expiresAt: null, tags: ["备用"], baseUrl: "https://api.deepseek.com", note: "工作邮箱账号，给 Cursor 做备用。", createdAt: ago(24 * 12), lastChecked: ago(3) }),
    mk({ id: "k12", accountId: "acc-zhipu-main", alias: "智谱 · 主力", secret: "demoZhipu1Ab2Cd3Ef4Gh5Ij6Kl7Mn8Op9Qr4r8s", status: "active", balance: 73.5, currency: "CNY", quotaUsedPct: 29, expiresAt: days(48), tags: ["生产"], baseUrl: "https://open.bigmodel.cn/api/paas/v4", note: "客服机器人主力。", createdAt: ago(24 * 80), lastChecked: ago(1) }),
    mk({ id: "k4", accountId: "acc-zhipu-main", alias: "智谱 · 备用", secret: "demoZhipu9St8Uv7Wx6Yz5Ab4Cd3Ef2Gh7k2m", status: "expiring", balance: 6.2, currency: "CNY", quotaUsedPct: 88, expiresAt: days(6), tags: ["备用"], baseUrl: "https://open.bigmodel.cn/api/paas/v4", note: "赠送额度快到期，记得续。", createdAt: ago(24 * 60), lastChecked: ago(8) }),
    mk({ id: "k5", accountId: "acc-moon-main", alias: "Kimi · 长文本", secret: "sk-demo1Cd3Ef5Gh7Ij9Kl1Mn3Op5Qr3n9x", status: "active", balance: 51.35, currency: "CNY", quotaUsedPct: 22, expiresAt: null, tags: ["长上下文"], baseUrl: "https://api.moonshot.cn/v1", note: "处理大文档。", createdAt: ago(24 * 45), lastChecked: ago(3) }),
    mk({ id: "k13", accountId: "acc-moon-main", alias: "Kimi · 测试", secret: "sk-demo7Op9Qr1St3Uv5Wx7Yz9Ab1Cd0q3z", status: "expiring", balance: 2.1, currency: "CNY", quotaUsedPct: 94, expiresAt: days(11), tags: ["测试"], baseUrl: "https://api.moonshot.cn/v1", note: "余额不多。", createdAt: ago(24 * 40), lastChecked: ago(20) }),
    mk({ id: "k6", accountId: "acc-sf-main", alias: "硅基流动 · 开源模型", secret: "sk-demo3Ef5Gh7Ij9Kl1Mn3Op5Qr7St5t8w", status: "active", balance: 27.9, currency: "CNY", quotaUsedPct: 41, expiresAt: null, tags: ["开源模型"], baseUrl: "https://api.siliconflow.cn/v1", note: "跑 Qwen / DeepSeek 开源版。", createdAt: ago(24 * 30), lastChecked: ago(4) }),
    mk({ id: "k14", accountId: "acc-sf-main", alias: "硅基流动 · 图像", secret: "sk-demo9Uv1Wx3Yz5Ab7Cd9Ef1Gh6h2j", status: "active", balance: 15.6, currency: "CNY", quotaUsedPct: 52, expiresAt: null, tags: ["多模态"], baseUrl: "https://api.siliconflow.cn/v1", note: "文生图 / 语音额度。", createdAt: ago(24 * 9), lastChecked: ago(7) }),
    mk({ id: "k7", accountId: "acc-or-main", alias: "OpenRouter · 通用", secret: "sk-or-v1-demo2Cd4Ef6Gh8Ij1Kl3Mn5Op7Qr9Stb4e1", status: "active", balance: 9.75, currency: "USD", quotaUsedPct: 76, expiresAt: null, tags: ["聚合", "备用"], baseUrl: "https://openrouter.ai/api/v1", note: "一个 key 通吃各家模型。", createdAt: ago(24 * 22), lastChecked: ago(6) }),
    mk({ id: "k8", accountId: "acc-gemini-main", alias: "Gemini · 免费层", secret: "AIzaSyDemo4Gh6Ij8Kl1Mn3Op5Qr7St9Uv7yQ", status: "active", balance: null, currency: "USD", quotaUsedPct: 63, expiresAt: null, tags: ["免费额度"], baseUrl: "https://generativelanguage.googleapis.com/v1beta", note: "免费层有速率限制。", createdAt: ago(24 * 18), lastChecked: ago(9) }),
    mk({ id: "k10", accountId: "acc-xai-main", alias: "Grok · 尝鲜", secret: "xai-demo8Kl2Mn4Op6Qr8St1Uv3Wx5Yz2p6v", status: "unchecked", balance: null, currency: "USD", quotaUsedPct: null, expiresAt: null, tags: ["尝鲜"], baseUrl: "https://api.x.ai/v1", note: "刚申请，还没验证有效性。", createdAt: ago(6), lastChecked: ago(6) }),
  ];

  const b = (keyId: string, projectId: string, role: BindRole): Binding => ({ keyId, projectId, role });
  const bindings: Binding[] = [
    b("k17", "p-be", "primary"), b("k1", "p-be", "backup"), b("k11", "p-be", "backup"),
    b("k17", "p-fe", "primary"),
    b("k2", "p-arch", "primary"),
    b("k12", "p-live", "primary"), b("k1", "p-live", "backup"),
    b("k4", "p-stage", "primary"), b("k7", "p-stage", "backup"),
    b("k3", "p-translate", "primary"),
    b("k15", "p-codegen", "primary"), b("k12", "p-codegen", "backup"), b("k6", "p-codegen", "backup"),
    b("k2", "p-survey", "primary"), b("k5", "p-survey", "backup"), b("k7", "p-survey", "backup"),
    b("k5", "p-material", "primary"), b("k8", "p-material", "backup"),
    b("k3", "p-qa", "primary"), b("k6", "p-qa", "backup"), b("k10", "p-qa", "backup"),
  ];

  const snapshots: BalanceSnapshot[] = [];
  const mkSnaps = (accountId: string, end: number, burn: number, days = 14) => {
    for (let i = days - 1; i >= 0; i--) {
      snapshots.push({
        id: `${accountId}-s${i}`,
        accountId,
        at: new Date(Date.now() - i * 86400000).toISOString(),
        balance: Math.max(0, Number((end + burn * i).toFixed(2))),
      });
    }
  };
  mkSnaps("acc-oai-main", 42.18, 0.42);
  mkSnaps("acc-oai-team", 120, 0.9);
  mkSnaps("acc-ds-a", 18.64, 0.35);
  mkSnaps("acc-ds-b", 44.05, 0.12);
  mkSnaps("acc-zhipu-main", 73.5, 1.6);
  mkSnaps("acc-moon-main", 51.35, 0.3);
  mkSnaps("acc-sf-main", 27.9, 0.45);
  mkSnaps("acc-or-main", 9.75, 0.28);

  return { vendors: [], accounts, apiKeys, softwares, projects, bindings, snapshots, settings: defaultSettings() };
}

export const BIND_ROLES: { value: BindRole; label: string }[] = [
  { value: "primary", label: "主用" },
  { value: "backup", label: "备用" },
];
