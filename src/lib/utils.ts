import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function maskKey(key: string) {
  if (key.length <= 10) return "•".repeat(key.length);
  return `${key.slice(0, 6)}${"•".repeat(10)}${key.slice(-4)}`;
}

export function formatMoney(value: number, currency: "USD" | "CNY") {
  const symbol = currency === "USD" ? "$" : "¥";
  const fixed = value >= 100 ? value.toFixed(0) : value.toFixed(2);
  return `${symbol}${fixed}`;
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return `${Math.round(days / 30)} 个月前`;
}

export function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

/**
 * 复制文本到剪贴板。
 * 优先用异步 Clipboard API；在 file:// 等受限环境下回退到 execCommand，
 * 保证双击打开的离线单文件版也能正常复制。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 继续走降级方案 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** 复制后自动清空剪贴板的倒计时（毫秒） */
export const CLIPBOARD_CLEAR_MS = 30000;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 复制密钥：复制成功后在 30 秒后自动把剪贴板清空，
 * 期间若再次复制则会重新计时。
 */
export async function copySecret(text: string): Promise<boolean> {
  const ok = await copyText(text);
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    void copyText("");
    clearTimer = null;
  }, CLIPBOARD_CLEAR_MS);
  return ok;
}
