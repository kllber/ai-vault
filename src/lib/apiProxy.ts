/**
 * 通过本地服务转发请求到厂商 API（浏览器直连会被 CORS 拦截）。
 * 仅在桌面版 / 本地地址 模式下可用。
 */

export interface ProxyResponse {
  ok: boolean;
  status: number;
  data: unknown;
  text: string;
  error?: string;
}

export const isHttpOrigin = () =>
  typeof location !== "undefined" &&
  (location.protocol === "http:" || location.protocol === "https:");

let cached: boolean | null = null;

/** 探测本地代理是否可用（结果缓存） */
export async function proxyAvailable(force = false): Promise<boolean> {
  if (!isHttpOrigin()) return false;
  if (cached !== null && !force) return cached;
  try {
    const r = await fetch("/__aivault/ping", { cache: "no-store" });
    cached = r.ok;
  } catch {
    cached = false;
  }
  return cached;
}

/** 千问官方 CLI 返回的用量结构（服务端已裁剪，只保留有用字段） */
export interface QianwenUsage {
  free_tier?: {
    totalModels?: number;
    used?: {
      model_id?: string;
      used_pct?: number;
      remaining?: number;
      total?: number;
      unit?: string;
      resetDate?: string;
    }[];
  };
  token_plan?: {
    subscribed?: boolean;
    planName?: string;
    remainingCredits?: number;
    usedPct?: number;
    resetDate?: string;
  } | null;
  pay_as_you_go?: {
    models?: { model_id?: string; cost?: number; currency?: string }[];
    total?: { cost?: number; currency?: string } | null;
  };
}

export interface QianwenResult {
  ok: boolean;
  code?: string;
  message?: string;
  data?: QianwenUsage;
}

/** 通过本地服务执行 `qianwen usage summary --format json` */
export async function fetchQianwenUsage(): Promise<QianwenResult> {
  if (!isHttpOrigin()) {
    return { ok: false, code: "no-proxy", message: "需要本地服务" };
  }
  try {
    const r = await fetch("/__aivault/qianwen", { method: "POST" });
    return (await r.json()) as QianwenResult;
  } catch (e) {
    return { ok: false, code: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** 一键安装千问 CLI（官方源失败会自动切国内镜像） */
export async function installQianwenCli(): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await fetch("/__aivault/qianwen/install", { method: "POST" });
    return (await r.json()) as { ok: boolean; message: string };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 发起千问授权，返回需要用户打开的链接 */
export async function qianwenLoginInit(): Promise<{
  ok: boolean;
  already?: boolean;
  url?: string;
  expiresIn?: number;
  message?: string;
}> {
  try {
    const r = await fetch("/__aivault/qianwen/login", { method: "POST" });
    return await r.json();
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 等待用户在浏览器完成授权 */
export async function qianwenLoginComplete(): Promise<{ ok: boolean; message?: string }> {
  try {
    const r = await fetch("/__aivault/qianwen/login-complete", { method: "POST" });
    return await r.json();
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function proxyRequest(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<ProxyResponse> {
  try {
    const r = await fetch("/__aivault/proxy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        method: init.method ?? "GET",
        headers: init.headers ?? {},
        body: init.body,
      }),
    });
    const text = await r.text();
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* 非 JSON 响应，保留原文 */
    }
    // 本地代理转发失败（上游连不上）会以 200 + __proxyError 返回
    if (data && typeof data === "object" && "__proxyError" in data) {
      return {
        ok: false,
        status: 0,
        data: null,
        text,
        error: String((data as { __proxyError: unknown }).__proxyError),
      };
    }
    return { ok: r.ok, status: r.status, data, text };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null,
      text: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
