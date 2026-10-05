import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Pencil,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  Link2,
  Clock,
  Wallet,
  Fingerprint,
  UserRound,
  Boxes,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { keyAccount, keyUsages, keyVendor, keysOfAccount, snapshotsOf, dailyBurn, daysLeft, membershipDaysLeft } from "@/data/db";
import type { KeyUsage } from "@/data/db";
import type { ApiKey } from "@/data/types";
import type { Account } from "@/data/types";
import { VendorGlyph, StatusPill, Tag, RoleBadge, SoftGlyph } from "./bits";
import { cn, formatMoney, relativeTime, maskKey, copySecret } from "@/lib/utils";
import { adapterFor } from "@/lib/adapters";

function AreaChart({ points, color }: { points: number[]; color: string }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * 100;
    const y = 40 - ((p - min) / range) * 34 - 3;
    return [x, y] as const;
  });
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const id = `grad-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-20 w-full">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1="0" x2="100" y1={i * 13 + 3} y2={i * 13 + 3} stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
      ))}
      <path d={`${line} L100,40 L0,40 Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === coords.length - 1 ? 1.8 : 0} fill={color} />
      ))}
    </svg>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Clock;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="inline-flex flex-none items-center gap-2 text-[12px] text-ink-400">
        <Icon size={13} /> {label}
      </span>
      <span className={cn("truncate text-[12.5px] text-ink-100", mono && "font-mono text-[11.5px]")}>{value}</span>
    </div>
  );
}

export function DetailDrawer({
  apiKey,
  onClose,
  onEdit,
  onDelete,
  onCheckValid,
  onEditAccount,
  onOpenHistory,
}: {
  apiKey: ApiKey | null;
  onClose: () => void;
  onEdit: (k: ApiKey) => void;
  onDelete: (k: ApiKey) => void;
  onCheckValid: (k: ApiKey) => Promise<{ ok: boolean; message?: string }>;
  onEditAccount: (a: Account) => void;
  onOpenHistory: (a: Account) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<{ ok: boolean; message?: string } | null>(null);

  const runCheck = async (k: ApiKey) => {
    setChecking(true);
    setCheckMsg(null);
    const res = await onCheckValid(k);
    setCheckMsg(res);
    setChecking(false);
  };

  const copy = (text: string, id: string) => {
    void copySecret(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1600);
  };

  const vendor = apiKey ? keyVendor(apiKey) : null;
  const account = apiKey ? keyAccount(apiKey) : null;
  const usages = apiKey ? keyUsages(apiKey.id) : [];
  const siblings = account && apiKey ? keysOfAccount(account.id).filter((k) => k.id !== apiKey.id) : [];
  const snaps = account ? snapshotsOf(account.id) : [];
  const burn = account ? dailyBurn(account.id) : null;
  const left = account ? daysLeft(account.id, account.balance) : null;
  const memberDays = account ? membershipDaysLeft(account) : null;

  const groups = usages.reduce<Record<string, { software: KeyUsage["software"]; items: KeyUsage[] }>>(
    (acc, u) => {
      if (!acc[u.software.id]) acc[u.software.id] = { software: u.software, items: [] };
      acc[u.software.id].items.push(u);
      return acc;
    },
    {},
  );

  return (
    <AnimatePresence>
      {apiKey && vendor && account && (
        <motion.aside
          key="drawer"
          initial={{ opacity: 0, x: 40, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 40, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="glass-panel absolute inset-0 z-40 flex flex-col overflow-hidden rounded-none bg-[#0b0b13] lg:top-3 lg:right-3 lg:bottom-3 lg:left-auto lg:w-[398px] lg:rounded-[26px] 2xl:static 2xl:flex-none"
          style={{ boxShadow: "0 40px 120px -30px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.04)" }}
        >
          <div className="relative px-5 pt-5">
            <div
              className="pointer-events-none absolute -top-24 -right-16 h-52 w-52 rounded-full opacity-40 blur-3xl"
              style={{ background: vendor.ring }}
            />
            <div className="relative flex items-start gap-3">
              <VendorGlyph vendor={vendor} size={46} radius={15} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[16px] font-semibold tracking-tight">{apiKey.alias}</h2>
                <div className="mt-0.5 text-[12px] text-ink-400">
                  {vendor.name} · {account.label}
                </div>
              </div>
              <button
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-white/8 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="relative mt-4 flex flex-wrap items-center gap-2">
              <StatusPill status={apiKey.status} />
              <span className="glass-soft inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-ink-300">
                <ShieldCheck size={12} className="text-[#35e6d0]" /> {apiKey.cipherHint}
              </span>
              <span className="glass-soft inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-ink-300">
                <Fingerprint size={12} /> 本机独有
              </span>
            </div>

            <div className="relative mt-3.5 flex items-center gap-2 rounded-xl border border-white/8 bg-black/30 px-3 py-2.5">
              <span className="flex-1 truncate font-mono text-[12.5px] text-ink-200">
                {reveal ? apiKey.secret : maskKey(apiKey.secret)}
              </span>
              <button
                onClick={() => setReveal((r) => !r)}
                className="rounded-lg bg-white/6 px-2 py-1.5 text-[11px] text-ink-300 transition-colors hover:bg-white/12 hover:text-white"
              >
                {reveal ? "隐藏" : "显示"}
              </button>
              <button
                onClick={() => copy(apiKey.secret, "key")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                  copied === "key" ? "bg-emerald-400/20 text-emerald-300" : "bg-white/8 text-ink-200 hover:bg-white/14",
                )}
              >
                {copied === "key" ? (
                  <>
                    <Check size={12} strokeWidth={3} /> 已复制
                  </>
                ) : (
                  <>
                    <Copy size={12} /> 复制
                  </>
                )}
              </button>
            </div>
            <div className="relative mt-1.5 text-[10.5px] text-ink-500">复制后剪贴板将在 30 秒后自动清空</div>
          </div>

          <div className="no-scrollbar mt-4 flex-1 overflow-y-auto px-5 pb-5">
            <div className="glass-soft rounded-2xl p-3.5">
              <div className="flex items-center gap-2 text-[11.5px] text-ink-400">
                <UserRound size={12} /> 所属账号
              </div>
              <div className="mt-2 flex items-center gap-2.5">
                <span
                  className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[11px] font-semibold text-white"
                  style={{ background: vendor.gradient }}
                >
                  {vendor.glyph}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-ink-50">{account.label}</div>
                  <div className="truncate text-[11.5px] text-ink-500">{account.login || "—"}</div>
                  {account.membershipExpiresAt && (
                    <div
                      className={cn(
                        "truncate text-[11px]",
                        memberDays != null && memberDays <= 7 ? "text-amber-300" : "text-ink-500",
                      )}
                    >
                      会员到期 {account.membershipExpiresAt.slice(0, 10)}
                      {memberDays != null ? `（${memberDays} 天）` : ""}
                    </div>
                  )}
                </div>
                <span className="glass-soft rounded-full px-2 py-0.5 text-[10.5px] text-ink-300">
                  共 {keysOfAccount(account.id).length} 把 key
                </span>
                <button
                  onClick={() => onEditAccount(account)}
                  className="grid h-7 w-7 flex-none place-items-center rounded-lg text-ink-400 transition-colors hover:bg-white/8 hover:text-white"
                  title="编辑账号 / 余额"
                >
                  <Pencil size={13} />
                </button>
              </div>
              {siblings.length > 0 && (
                <div className="mt-2.5 border-t border-white/6 pt-2.5">
                  <div className="mb-1.5 text-[10.5px] text-ink-500">同一账号下的其他密钥</div>
                  <div className="flex flex-wrap gap-1.5">
                    {siblings.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/4 px-2 py-1 text-[11px] text-ink-200"
                      >
                        <span
                          className={cn(
                            "status-dot",
                            s.status === "active" && "status-active",
                            s.status === "expiring" && "status-expiring",
                            s.status === "invalid" && "status-invalid",
                            s.status === "unchecked" && "status-unchecked",
                          )}
                        />
                        {s.alias}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="glass-soft mt-3 rounded-2xl p-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="flex items-center gap-1.5 text-[11.5px] text-ink-400">
                    <Wallet size={12} /> {account.balance != null ? "账号余额" : "本月花费"}
                  </div>
                  <div className="mt-1 font-mono text-[24px] font-semibold tracking-tight tabular-nums">
                    {account.balance != null
                      ? formatMoney(account.balance, account.currency)
                      : account.spent != null
                        ? `-${formatMoney(account.spent, account.spentCurrency ?? "USD")}`
                        : "—"}
                  </div>
                  <div className="mt-1 text-[10.5px] text-ink-500">
                    该账号下 {keysOfAccount(account.id).length} 把 key 共用此余额
                  </div>                </div>
                <div className="text-right">
                  {account.lastChecked && (
                    <>
                      <div className="text-[11.5px] text-ink-400">更新于</div>
                      <div className="mt-1 text-[12.5px] text-ink-100">
                        {relativeTime(account.lastChecked)}
                      </div>
                    </>
                  )}
                </div>
              </div>
              {(burn != null || left != null) && (
                <div className="mt-3 flex items-center gap-4 border-t border-white/6 pt-3 text-[11.5px]">
                  <span className="text-ink-400">
                    日消耗{" "}
                    <span className="font-mono text-ink-100">
                      {burn != null && burn > 0 ? formatMoney(burn, account.currency) : "—"}
                    </span>
                  </span>
                  <span className="text-ink-400">
                    预计可用{" "}
                    <span className="font-mono text-ink-100">
                      {left != null ? `${Math.max(0, Math.round(left))} 天` : "—"}
                    </span>
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onOpenHistory(account)}
              className="glass-soft mt-4 block w-full rounded-2xl p-3 text-left transition-colors hover:bg-white/8"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12.5px] font-semibold text-ink-200">账号余额变化</span>
                <span className="text-[11px] text-ink-400">
                  {snaps.length >= 2 ? `${snaps.length} 次采样 · 点击看明细` : "采样不足 · 点击查看"}
                </span>
              </div>
              {snaps.length >= 2 ? (
                <AreaChart points={snaps.map((s) => s.balance)} color={vendor.ring} />
              ) : (
                <div className="flex h-20 flex-col items-center justify-center gap-1 rounded-xl text-center">
                  <span className="text-[11.5px] text-ink-400">余额发生变化后才会记录采样点</span>
                  <span className="text-[10.5px] text-ink-500">
                    余额没变时只更新查询时间，不会把横线越拉越长
                  </span>
                </div>
              )}
            </button>

            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2">
                <Boxes size={13} className="text-ink-400" />
                <span className="text-[12.5px] font-semibold text-ink-200">使用位置</span>
                <span className="ml-auto font-mono text-[11px] text-ink-500">{usages.length}</span>
              </div>
              {usages.length ? (
                <div className="space-y-2">
                  {Object.values(groups).map(({ software, items }) => (
                    <div key={software.id} className="glass-soft rounded-xl p-2.5">
                      <div className="mb-1.5 flex items-center gap-2">
                        <SoftGlyph software={software} size={20} radius={6} />
                        <span className="text-[12px] font-medium text-ink-100">{software.name}</span>
                        <span className="text-[10px] text-ink-500">{software.category}</span>
                      </div>
                      <div className="space-y-1">
                        {items.map((u) => (
                          <div key={u.binding.projectId} className="flex items-center gap-2 pl-1">
                            <Link2 size={11} className="text-ink-500" />
                            <span className="flex-1 text-[12px] text-ink-200">{u.project.name}</span>
                            <RoleBadge role={u.binding.role} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="glass-soft rounded-xl px-3 py-3 text-center text-[12px] text-ink-500">
                  尚未绑定任何软件 / 项目
                </div>
              )}
            </div>

            <div className="mt-4">
              <div className="mb-2 text-[12.5px] font-semibold text-ink-200">标签</div>
              <div className="flex flex-wrap gap-1.5">
                {apiKey.tags.length ? (
                  apiKey.tags.map((t) => <Tag key={t}>{t}</Tag>)
                ) : (
                  <span className="text-[11.5px] text-ink-500">无</span>
                )}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-[12.5px] font-semibold text-ink-200">备注</div>
              <div className="glass-soft rounded-xl px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-300">
                {apiKey.note || "—"}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 text-[12.5px] font-semibold text-ink-200">元信息</div>
              <div className="divide-y divide-white/5">
                <Row icon={Link2} label="Base URL" value={apiKey.baseUrl || "—"} mono />
                <Row
                  icon={Wallet}
                  label="余额来源"
                  value={
                    adapterFor(vendor.id)?.supportsBalance ? "自动查询（按账号）" : "该厂商不支持查询"
                  }
                />
                <Row icon={Clock} label="最近改动" value={relativeTime(apiKey.lastChecked)} />
                <Row icon={Clock} label="创建时间" value={relativeTime(apiKey.createdAt)} />
                <Row
                  icon={Wallet}
                  label="会员到期"
                  value={
                    account.membershipExpiresAt
                      ? `${account.membershipExpiresAt.slice(0, 10)}（${
                          memberDays != null ? `${memberDays} 天` : "—"
                        }）`
                      : "未设置"
                  }
                />
              </div>
            </div>
          </div>

          <div className="border-t border-white/8 px-5 py-4">
            {checkMsg && (
              <div
                className={cn(
                  "mb-2.5 rounded-xl px-3 py-2 text-[11.5px]",
                  checkMsg.ok ? "bg-emerald-500/12 text-emerald-200" : "bg-amber-500/12 text-amber-200",
                )}
              >
                {checkMsg.ok ? "✓ 密钥有效" : `检测未通过：${checkMsg.message ?? "未知原因"}`}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => runCheck(apiKey)}
                disabled={checking}
                className="glass-soft flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] font-medium text-ink-200 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-60"
              >
                <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
                {checking ? "检测中…" : "检测有效性"}
              </button>
              <button
                onClick={() => onEdit(apiKey)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-[#0a0a12] transition-transform hover:scale-[1.015] active:scale-[0.99]"
                style={{
                  background: "linear-gradient(120deg,#c9bdff,#7c5cff 50%,#35e6d0)",
                  boxShadow: "0 14px 34px -14px rgba(124,92,255,1)",
                }}
              >
                <Pencil size={15} strokeWidth={2.4} /> 编辑
              </button>
              <button
                onClick={() => onDelete(apiKey)}
                className="glass-soft grid h-10 w-10 place-items-center rounded-xl text-ink-300 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                title="删除"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
