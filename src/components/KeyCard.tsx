import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Sparkles, Link2 } from "lucide-react";
import { keyAccount, keyUsages, keyVendor, dailyBurn, daysLeft, membershipDaysLeft } from "@/data/db";
import type { ApiKey } from "@/data/types";
import { MaskedKey } from "./MaskedKey";
import { cn, formatMoney, relativeTime, maskKey, copySecret } from "@/lib/utils";
import { RoleBadge, SoftGlyph, StatusPill, Tag, VendorGlyph } from "./bits";

function UsageChips({ keyId, limit }: { keyId: string; limit?: number }) {
  const usages = keyUsages(keyId);
  if (!usages.length)
    return <span className="text-[11px] text-ink-500">未绑定任何软件 / 项目</span>;
  const shown = limit ? usages.slice(0, limit) : usages;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((u) => (
        <span
          key={`${u.binding.projectId}-${u.binding.role}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/4 py-1 pr-1.5 pl-1"
          title={`${u.software.name} / ${u.project.name}`}
        >
          <SoftGlyph software={u.software} size={16} radius={5} />
          <span className="max-w-[92px] truncate text-[11px] text-ink-200">{u.project.name}</span>
          <RoleBadge role={u.binding.role} />
        </span>
      ))}
      {limit && usages.length > limit && (
        <span className="text-[11px] text-ink-500">+{usages.length - limit}</span>
      )}
    </div>
  );
}

export function KeyCard({
  apiKey,
  selected,
  onSelect,
  index,
}: {
  apiKey: ApiKey;
  selected: boolean;
  onSelect: () => void;
  index: number;
}) {
  const [copied, setCopied] = useState(false);
  const vendor = keyVendor(apiKey);
  const account = keyAccount(apiKey);

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void copySecret(apiKey.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (!vendor || !account) return null;

  const invalid = apiKey.status === "invalid";
  const memberDays = membershipDaysLeft(account);
  const balance = account.balance;
  const currency = account.currency;
  const burn = dailyBurn(account.id);
  const left = daysLeft(account.id, balance);
  const burnInfo =
    burn != null && burn > 0 && balance != null
      ? `日耗 ${formatMoney(burn, currency)} · 约 ${left != null ? Math.max(0, Math.round(left)) : "—"} 天`
      : null;

  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.035, 0.3) }}
      onClick={onSelect}
      className={cn(
        "glass glow-ring group relative cursor-pointer overflow-hidden rounded-2xl p-4 text-left transition-all duration-300",
        selected && "ring-1 ring-[#7c5cff]/70",
        invalid && "opacity-70 saturate-[0.7]",
      )}
      style={selected ? { boxShadow: "0 24px 60px -30px rgba(124,92,255,1)" } : undefined}
    >
      <div
        className="pointer-events-none absolute -top-20 -right-16 h-44 w-44 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-50"
        style={{ background: vendor.ring }}
      />

      <div className="relative flex items-start gap-3">
        <VendorGlyph vendor={vendor} size={40} radius={13} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold text-white">{apiKey.alias}</h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-400">
            <span>{vendor.name}</span>
            <span className="text-ink-500">·</span>
            <span className="truncate">{account.label}</span>
            {apiKey.demo && (
              <span className="flex-none rounded bg-white/8 px-1 py-px text-[9.5px] text-ink-400">
                示例
              </span>
            )}
          </div>
        </div>
        <StatusPill status={apiKey.status} />
      </div>

      <div className="relative mt-3.5 flex items-center gap-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2.5">
        <MaskedKey value={maskKey(apiKey.secret)} className="flex-1 text-[12.5px]" />
        <button
          onClick={copy}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-lg transition-colors",
            copied ? "bg-emerald-400/20 text-emerald-300" : "text-ink-400 hover:bg-white/8 hover:text-white",
          )}
          title="复制密钥（30 秒后自动清空剪贴板）"
        >
          {copied ? <Check size={13} strokeWidth={3} /> : <Copy size={13} />}
        </button>
      </div>

      <div className="relative mt-3.5">
        <div className="flex items-end justify-between">
          <div className="flex items-baseline gap-1.5">
            {balance != null ? (
              <>
                <span className="font-mono text-[17px] font-semibold text-white tabular-nums">
                  {formatMoney(balance, currency)}
                </span>
                <span className="text-[11px] text-ink-500">账号余额</span>
              </>
            ) : account.spent != null ? (
              <>
                <span className="font-mono text-[17px] font-semibold text-white tabular-nums">
                  -{formatMoney(account.spent, account.spentCurrency ?? "USD")}
                </span>
                <span className="text-[11px] text-ink-500">本月花费</span>
              </>
            ) : (
              <span className="text-[12px] text-ink-400">暂无余额 / 花费数据</span>
            )}
          </div>
        </div>
        {burnInfo && (
          <div className="mt-1.5 font-mono text-[10.5px] text-ink-500">{burnInfo}</div>
        )}
      </div>

      <div className="hairline relative my-3" />

      <div className="relative">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wider text-ink-500 uppercase">
          <Link2 size={11} /> 用于
        </div>
        <UsageChips keyId={apiKey.id} limit={3} />
      </div>

      <div className="relative mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {apiKey.tags.slice(0, 2).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
        <div className="flex items-center gap-2.5 text-[11px] text-ink-500">
          <span className="inline-flex items-center gap-1">
            <Sparkles size={11} /> {relativeTime(apiKey.lastChecked)}
          </span>
          {account.membershipExpiresAt && (
            <span className={cn(memberDays != null && memberDays <= 7 ? "text-amber-300" : "text-ink-500")}>
              会员 {memberDays != null ? (memberDays > 0 ? `${memberDays} 天后到期` : "已过期") : ""}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function KeyRow({
  apiKey,
  selected,
  onSelect,
  index,
}: {
  apiKey: ApiKey;
  selected: boolean;
  onSelect: () => void;
  index: number;
}) {
  const [copied, setCopied] = useState(false);
  const vendor = keyVendor(apiKey);
  const account = keyAccount(apiKey);
  const usages = keyUsages(apiKey.id);

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void copySecret(apiKey.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (!vendor || !account) return null;

  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.025, 0.25) }}
      onClick={onSelect}
      className={cn(
        "glass-soft glow-ring flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors hover:bg-white/6",
        selected && "ring-1 ring-[#7c5cff]/60",
      )}
    >
      <VendorGlyph vendor={vendor} size={34} radius={11} />
      <div className="w-[180px] min-w-0">
        <div className="truncate text-[13.5px] font-semibold text-white">{apiKey.alias}</div>
        <div className="truncate text-[11px] text-ink-500">
          {vendor.name} · {account.label}
        </div>
      </div>
      <MaskedKey value={maskKey(apiKey.secret)} className="hidden flex-1 text-[12px] md:flex" />
      <button
        onClick={copy}
        className={cn(
          "grid h-7 w-7 place-items-center rounded-lg transition-colors",
          copied ? "text-emerald-300" : "text-ink-400 hover:text-white",
        )}
      >
        {copied ? <Check size={13} strokeWidth={3} /> : <Copy size={13} />}
      </button>
      <div className="hidden w-[86px] text-right font-mono text-[13px] tabular-nums text-ink-200 lg:block">
        {account.balance != null ? formatMoney(account.balance, account.currency) : "—"}
      </div>
      <div className="hidden w-[74px] text-right text-[11.5px] text-ink-400 xl:block">
        {usages.length ? `${usages.length} 处` : "未绑定"}
      </div>
      <div className="flex w-[92px] justify-end">
        <StatusPill status={apiKey.status} />
      </div>
    </motion.div>
  );
}
