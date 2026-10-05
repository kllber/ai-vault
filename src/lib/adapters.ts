/**
 * 各厂商的余额 / 有效性适配器。
 * 能查到余额的：DeepSeek、Moonshot、OpenRouter、硅基流动；
 * 只支持有效性检测的：OpenAI、Anthropic（它们不提供按 key 查余额）。
 */
import { proxyRequest } from "./apiProxy";

export interface BalanceResult {
  ok: boolean;
  balance?: number;
  currency?: "USD" | "CNY";
  message?: string;
}
export interface ValidResult {
  ok: boolean;
  message?: string;
}

export interface Adapter {
  id: string;
  name: string;
  /** 是否支持自动查询余额 / 花费 */
  supportsBalance: boolean;
  /** 是否支持有效性检测 */
  supportsValid: boolean;
  /**
   * 余额/花费的获取方式：
   * - "api"    直接用 API Key 查（DeepSeek / Moonshot / OpenRouter / 硅基流动）
   * - "admin"  需要额外的「管理密钥」（OpenAI / Anthropic）
   * - "cli"    通过厂商官方 CLI 查询（通义千问）
   */
  balanceVia?: "api" | "admin" | "cli";
  checkValid(baseUrl: string, key: string): Promise<ValidResult>;
  fetchBalance(baseUrl: string, key: string): Promise<BalanceResult>;
  /** balanceVia === "admin" 时使用 */
  fetchSpend?(baseUrl: string, adminKey: string): Promise<BalanceResult>;
}

/** 从花费接口的返回里把所有金额加起来（兼容 OpenAI / Anthropic 两种结构） */
function sumAmounts(node: unknown): number {
  let total = 0;
  const walk = (n: unknown) => {
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (!n || typeof n !== "object") return;
    const obj = n as Record<string, unknown>;
    if (typeof obj.currency === "string" && typeof obj.value === "number") total += obj.value;
    for (const [k, v] of Object.entries(obj)) {
      if (k === "value") continue;
      if (k === "amount") {
        if (typeof v === "number") total += v;
        else if (typeof v === "string") {
          const f = parseFloat(v);
          if (Number.isFinite(f)) total += f;
        } else walk(v);
      } else {
        walk(v);
      }
    }
  };
  walk(node);
  return Number(total.toFixed(4));
}

export const DEFAULT_BASE: Record<string, string> = {
  deepseek: "https://api.deepseek.com",
  qianwen: "https://maas.qianwenaiapi.com/compatible-mode/v1",
  moonshot: "https://api.moonshot.cn/v1",
  openrouter: "https://openrouter.ai/api/v1",
  siliconflow: "https://api.siliconflow.cn/v1",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
};

const strip = (u: string) => (u || "").replace(/\/+$/, "");
const toNum = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};
const bearer = (k: string) => ({ authorization: `Bearer ${k}` });
const authErr = (status: number) =>
  status === 401 || status === 403 ? "密钥无效或无权访问" : `请求失败（HTTP ${status}）`;

function baseFor(vendorId: string, baseUrl: string) {
  return strip(baseUrl) || DEFAULT_BASE[vendorId] || "";
}

/* ----------------------------- 有效性 ----------------------------- */

async function validityByModels(
  vendorId: string,
  baseUrl: string,
  key: string,
  extraHeaders: Record<string, string> = {},
): Promise<ValidResult> {
  const base = baseFor(vendorId, baseUrl);
  if (!base) return { ok: false, message: "缺少 Base URL" };
  const r = await proxyRequest(`${base}/models`, {
    headers: { ...bearer(key), ...extraHeaders },
  });
  if (r.status === 0) return { ok: false, message: r.error ?? "无法连接本地代理" };
  if (r.status === 401 || r.status === 403) return { ok: false, message: "密钥无效" };
  if (!r.ok) return { ok: false, message: `HTTP ${r.status}` };
  return { ok: true };
}

/* ----------------------------- 适配器 ----------------------------- */

const deepseek: Adapter = {
  id: "deepseek",
  name: "DeepSeek",
  supportsBalance: true,
  supportsValid: true,
  balanceVia: "api",
  checkValid: (b, k) => validityByModels("deepseek", b, k),
  fetchBalance: async (baseUrl, key) => {
    const base = baseFor("deepseek", baseUrl);
    const r = await proxyRequest(`${base}/user/balance`, { headers: bearer(key) });
    if (r.status === 0) return { ok: false, message: r.error ?? "无法连接本地代理" };
    if (!r.ok) return { ok: false, message: authErr(r.status) };
    const d = r.data as { balance_infos?: { currency?: string; total_balance?: string }[] } | null;
    const info = d?.balance_infos?.[0];
    const balance = toNum(info?.total_balance);
    if (balance === undefined) return { ok: false, message: "返回格式无法解析" };
    return { ok: true, balance, currency: info?.currency === "USD" ? "USD" : "CNY" };
  },
};

const moonshot: Adapter = {
  id: "moonshot",
  name: "Moonshot / Kimi",
  supportsBalance: true,
  supportsValid: true,
  balanceVia: "api",
  checkValid: (b, k) => validityByModels("moonshot", b, k),
  fetchBalance: async (baseUrl, key) => {
    const base = baseFor("moonshot", baseUrl);
    const r = await proxyRequest(`${base}/users/me/balance`, { headers: bearer(key) });
    if (r.status === 0) return { ok: false, message: r.error ?? "无法连接本地代理" };
    if (!r.ok) return { ok: false, message: authErr(r.status) };
    const d = r.data as { data?: { available_balance?: number; cash_balance?: number } } | null;
    const balance = toNum(d?.data?.available_balance) ?? toNum(d?.data?.cash_balance);
    if (balance === undefined) return { ok: false, message: "返回格式无法解析" };
    return { ok: true, balance, currency: "CNY" };
  },
};

const openrouter: Adapter = {
  id: "openrouter",
  name: "OpenRouter",
  supportsBalance: true,
  supportsValid: true,
  balanceVia: "api",
  checkValid: (b, k) => validityByModels("openrouter", b, k),
  fetchBalance: async (baseUrl, key) => {
    const base = baseFor("openrouter", baseUrl);
    const r = await proxyRequest(`${base}/auth/key`, { headers: bearer(key) });
    if (r.status === 0) return { ok: false, message: r.error ?? "无法连接本地代理" };
    if (!r.ok) return { ok: false, message: authErr(r.status) };
    const d = r.data as { data?: { limit?: number | null; usage?: number; limit_remaining?: number | null } } | null;
    const rem = toNum(d?.data?.limit_remaining);
    const limit = toNum(d?.data?.limit ?? undefined);
    const usage = toNum(d?.data?.usage);
    const balance = rem ?? (limit !== undefined && usage !== undefined ? limit - usage : undefined);
    if (balance === undefined) return { ok: false, message: "该 key 未设置额度上限，无法得到余额" };
    return { ok: true, balance, currency: "USD" };
  },
};

const siliconflow: Adapter = {
  id: "siliconflow",
  name: "硅基流动",
  supportsBalance: true,
  supportsValid: true,
  balanceVia: "api",
  checkValid: (b, k) => validityByModels("siliconflow", b, k),
  fetchBalance: async (baseUrl, key) => {
    const base = baseFor("siliconflow", baseUrl);
    const r = await proxyRequest(`${base}/user/info`, { headers: bearer(key) });
    if (r.status === 0) return { ok: false, message: r.error ?? "无法连接本地代理" };
    if (!r.ok) return { ok: false, message: authErr(r.status) };
    const d = r.data as { data?: { balance?: string; totalBalance?: string; chargeBalance?: string } } | null;
    const balance = toNum(d?.data?.balance) ?? toNum(d?.data?.totalBalance);
    if (balance === undefined) return { ok: false, message: "返回格式无法解析" };
    return { ok: true, balance, currency: "CNY" };
  },
};

const openai: Adapter = {
  id: "openai",
  name: "OpenAI",
  supportsBalance: true,
  supportsValid: true,
  balanceVia: "admin",
  checkValid: (b, k) => validityByModels("openai", b, k),
  fetchBalance: async () => ({
    ok: false,
    message: "需要「管理密钥（Admin Key）」才能查看花费",
  }),
  fetchSpend: async (baseUrl, adminKey) => {
    const base = baseFor("openai", baseUrl);
    const now = new Date();
    const start = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
    const r = await proxyRequest(
      `${base}/organization/costs?start_time=${start}&bucket_width=1d&limit=31`,
      { headers: bearer(adminKey) },
    );
    if (r.status === 0) return { ok: false, message: r.error ?? "无法连接本地代理" };
    if (r.status === 401 || r.status === 403)
      return { ok: false, message: "管理密钥无效或没有账单权限" };
    if (!r.ok) return { ok: false, message: `HTTP ${r.status}` };
    return { ok: true, balance: sumAmounts(r.data), currency: "USD" };
  },
};

const anthropic: Adapter = {
  id: "anthropic",
  name: "Anthropic",
  supportsBalance: true,
  supportsValid: true,
  balanceVia: "admin",
  checkValid: (b, k) =>
    validityByModels("anthropic", b, k, { "anthropic-version": "2023-06-01" }),
  fetchBalance: async () => ({
    ok: false,
    message: "需要「管理密钥（Admin Key）」才能查看花费",
  }),
  fetchSpend: async (baseUrl, adminKey) => {
    const base = baseFor("anthropic", baseUrl);
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const r = await proxyRequest(
      `${base}/organizations/cost_report?starting_at=${encodeURIComponent(start)}`,
      { headers: { "x-api-key": adminKey, "anthropic-version": "2023-06-01" } },
    );
    if (r.status === 0) return { ok: false, message: r.error ?? "无法连接本地代理" };
    if (r.status === 401 || r.status === 403)
      return { ok: false, message: "管理密钥无效或没有账单权限" };
    if (!r.ok) return { ok: false, message: `HTTP ${r.status}` };
    return { ok: true, balance: sumAmounts(r.data), currency: "USD" };
  },
};

const qianwen: Adapter = {
  id: "qianwen",
  name: "通义千问",
  supportsBalance: true,
  supportsValid: true,
  balanceVia: "cli",
  checkValid: (b, k) => validityByModels("qianwen", b, k),
  fetchBalance: async () => ({
    ok: false,
    message: "千问的花费通过官方 CLI 查询（需先安装并登录 qianwen CLI）",
  }),
};

const REGISTRY: Record<string, Adapter> = {
  deepseek,
  moonshot,
  openrouter,
  siliconflow,
  openai,
  anthropic,
  qianwen,
};

export const adapterFor = (vendorId: string): Adapter | undefined => REGISTRY[vendorId];

/** 该厂商是否能在界面上点"刷新"（有任一能力） */
export const isAutoSupported = (vendorId: string) => Boolean(REGISTRY[vendorId]);

/**
 * 从公开接口获取实时 USD→CNY 汇率。
 * 依次尝试多个来源，全部失败返回 null（调用方保留旧汇率）。
 */
export async function fetchUsdCny(): Promise<number | null> {
  const pick = (d: unknown) => (d as { rates?: { CNY?: number } } | null)?.rates?.CNY;
  const sources = [
    "https://api.frankfurter.app/latest?from=USD&to=CNY",
    "https://open.er-api.com/v6/latest/USD",
  ];
  for (const url of sources) {
    const r = await proxyRequest(url);
    if (!r.ok || !r.data) continue;
    const v = pick(r.data);
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}
