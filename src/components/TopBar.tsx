import { LayoutGrid, List, Menu, Search, RefreshCw, X } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";
import type { KeyStatus } from "@/data/types";

export type StatusFilter = KeyStatus | "all";

const chips: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "active", label: "有效" },
  { id: "expiring", label: "即将过期" },
  { id: "invalid", label: "已失效" },
  { id: "unchecked", label: "待检测" },
];

export function TopBar({
  title,
  subtitle,
  statusFilter,
  onStatusFilter,
  counts,
  view,
  onView,
  query,
  onQuery,
  hideFilters,
  hideSearch,
  onRefresh,
  refreshing,
  lastRefreshAt,
  refreshSupported,
  onMenu,
}: {
  title: string;
  subtitle: string;
  statusFilter: StatusFilter;
  onStatusFilter: (s: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
  view: "grid" | "list";
  onView: (v: "grid" | "list") => void;
  query: string;
  onQuery: (q: string) => void;
  hideFilters?: boolean;
  hideSearch?: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  lastRefreshAt: string | null;
  refreshSupported: boolean;
  /** 手机端：打开左侧菜单抽屉 */
  onMenu: () => void;
}) {
  return (
    <header className="flex flex-col gap-3 px-1 pt-1 lg:gap-4">
      <div className="flex items-start justify-between gap-2 lg:gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <button
            onClick={onMenu}
            className="glass-soft grid h-9 w-9 flex-none place-items-center rounded-xl text-ink-200 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="打开菜单"
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[18px] font-semibold tracking-tight lg:text-[22px]">{title}</h1>
            <p className="mt-0.5 truncate text-[12px] text-ink-400 lg:text-[13px]">{subtitle}</p>
          </div>
        </div>

        <div className="flex flex-none flex-wrap items-center justify-end gap-2">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            title={
              refreshSupported
                ? "查询各厂商余额并检测有效性"
                : "自动查询需要本地服务"
            }
            className={cn(
              "glass-soft flex items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors sm:py-1.5 sm:pr-3 sm:pl-2.5",
              refreshSupported ? "hover:bg-white/8" : "opacity-70",
            )}
          >
            <span
              className="grid h-7 w-7 place-items-center rounded-lg"
              style={{ background: "linear-gradient(140deg,#7c5cff,#35e6d0)" }}
            >
              <RefreshCw size={14} className={cn("text-white", refreshing && "animate-spin")} />
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block text-[12.5px] font-medium text-ink-100">
                {refreshing ? "查询中…" : "刷新余额"}
              </span>
              <span className="block text-[10px] text-ink-500">
                {lastRefreshAt ? `上次 ${relativeTime(lastRefreshAt)}` : "尚未查询过"}
              </span>
            </span>
          </button>

          {!hideSearch && (
            <div className="glass-soft flex items-center gap-2 rounded-xl px-2 py-2 sm:px-3">
            <Search size={14} className="text-ink-400" />
            <input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="筛选当前页面…"
              className="w-24 bg-transparent text-[13px] text-white placeholder:text-ink-500 focus:outline-none sm:w-40"
            />
            {query && (
              <button
                onClick={() => onQuery("")}
                className="grid h-5 w-5 place-items-center rounded-full text-ink-400 transition-colors hover:bg-white/10 hover:text-white"
                title="清除筛选"
              >
                <X size={12} strokeWidth={2.6} />
              </button>
            )}
          </div>
          )}

          {!hideFilters && (
            <div className="glass-soft hidden items-center rounded-xl p-0.5 sm:flex">
            {(
              [
                { id: "grid", icon: LayoutGrid },
                { id: "list", icon: List },
              ] as const
            ).map(({ id, icon: Icon }) => (
              <button
                key={id}
                onClick={() => onView(id)}
                className={cn(
                  "grid h-8 w-9 place-items-center rounded-[9px] transition-colors",
                  view === id
                    ? "bg-white/12 text-white"
                    : "text-ink-400 hover:text-white",
                )}
              >
                <Icon size={15} />
              </button>
            ))}
            </div>
          )}
        </div>
      </div>

      <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 lg:flex-wrap lg:overflow-visible">
        {!hideFilters &&
          chips.map((c) => {
          const active = statusFilter === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onStatusFilter(c.id)}
              className={cn(
                "group inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-all",
                active
                  ? "border-transparent bg-white/90 text-[#0a0a12]"
                  : "border-white/8 bg-white/3 text-ink-300 hover:bg-white/6 hover:text-white",
              )}
            >
              {c.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-[10px]",
                  active ? "bg-black/10 text-black/70" : "bg-white/8 text-ink-400",
                )}
              >
                {counts[c.id]}
              </span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
