import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  KeyRound,
  Boxes,
  Settings,
  Search,
  ShieldCheck,
  Lock,
  Plus,
  ChevronRight,
  UserRound,
  Download,
  ShieldAlert,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";
import { isBuiltinVendor } from "@/data/db";
import { BrandIcon } from "./BrandIcon";
import type { Account, Vendor } from "@/data/types";

export type NavId = "overview" | "vault" | "projects" | "settings";
export type Scope =
  | { level: "all" }
  | { level: "vendor"; id: string }
  | { level: "account"; id: string };

const navItems: { id: NavId; label: string; icon: typeof KeyRound }[] = [
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "vault", label: "密钥库", icon: KeyRound },
  { id: "projects", label: "软件与项目", icon: Boxes },
];

export function Sidebar({
  nav,
  onNav,
  scope,
  onScope,
  expandedVendor,
  onToggleVendor,
  vendors,
  accountsByVendor,
  vendorCounts,
  accountCounts,
  totalKeys,
  onOpenPalette,
  onLock,
  onAdd,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  onDeleteVendor,
  onExport,
  updatedAt,
  open,
  onClose,
  desktopMode,
}: {
  nav: NavId;
  onNav: (n: NavId) => void;
  scope: Scope;
  onScope: (s: Scope) => void;
  expandedVendor: string | null;
  onToggleVendor: (id: string) => void;
  vendors: Vendor[];
  accountsByVendor: Record<string, Account[]>;
  vendorCounts: Record<string, number>;
  accountCounts: Record<string, number>;
  totalKeys: number;
  onOpenPalette: () => void;
  onLock: () => void;
  onAdd: () => void;
  onAddAccount: (vendorId: string) => void;
  onEditAccount: (a: Account) => void;
  onDeleteAccount: (a: Account) => void;
  onDeleteVendor: (v: Vendor) => void;
  onExport: () => void;
  updatedAt: string | null;
  /** 手机端：抽屉是否展开 */
  open: boolean;
  /** 手机端：关闭抽屉 */
  onClose: () => void;
  /** 桌面版：导出按钮显示为「保存」 */
  desktopMode: boolean;
}) {
  const activeVendor =
    scope.level === "vendor"
      ? scope.id
      : scope.level === "account"
        ? vendors.find((v) => accountsByVendor[v.id]?.some((a) => a.id === scope.id))?.id ?? null
        : null;

  return (
    <aside
      className={cn(
        "glass-panel flex w-[282px] max-w-[86vw] flex-none flex-col rounded-[26px] bg-[#0a0a12] transition-transform duration-300",
        "fixed top-2 bottom-2 left-2 z-40",
        "lg:static lg:top-auto lg:bottom-auto lg:left-auto lg:z-20 lg:h-full lg:max-w-none lg:translate-x-0 lg:bg-transparent",
        open ? "translate-x-0" : "-translate-x-[115%]",
      )}
    >
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <div
          className="grid h-10 w-10 place-items-center rounded-[13px] text-white"
          style={{
            background: "linear-gradient(140deg,#7c5cff,#4d6bfe 55%,#35e6d0)",
            boxShadow: "0 10px 30px -8px rgba(124,92,255,0.8), inset 0 1px 0 rgba(255,255,255,0.4)",
          }}
        >
          <ShieldCheck size={20} strokeWidth={2.2} />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight">
            AI <span className="text-aurora">Vault</span>
          </div>
          <div className="text-[11px] text-ink-400">密钥金库 · 本地加密</div>
        </div>
        <button
          onClick={onClose}
          className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="关闭菜单"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-4">
        <button
          onClick={onOpenPalette}
          className="glass-soft glow-ring flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/6"
        >
          <Search size={15} className="text-ink-400" />
          <span className="flex-1 text-[13px] text-ink-400">搜索密钥 / 账号…</span>
          <kbd className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-300">
            Ctrl K
          </kbd>
        </button>
      </div>

      <nav className="mt-5 flex flex-col gap-0.5 px-3">
        {navItems.map((item) => {
          const active = nav === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className={cn(
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                active ? "text-white" : "text-ink-300 hover:text-white",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="absolute inset-0 rounded-xl border border-white/10 bg-white/7"
                  style={{ boxShadow: "0 12px 30px -16px rgba(124,92,255,0.9), inset 0 1px 0 rgba(255,255,255,0.08)" }}
                />
              )}
              <Icon size={17} className={cn("relative", active && "text-[#b9aaff]")} strokeWidth={2} />
              <span className="relative flex-1 text-left">{item.label}</span>
              {active && <span className="relative h-1.5 w-1.5 rounded-full bg-[#35e6d0] shadow-[0_0_10px_#35e6d0]" />}
            </button>
          );
        })}
      </nav>

      <div className="hairline mx-5 my-4" />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-5 pb-2">
          <span className="text-[11px] font-semibold tracking-wider text-ink-400 uppercase">厂商 / 账号</span>
          <span className="text-[11px] text-ink-500">{vendors.length}</span>
        </div>

        <div className="no-scrollbar flex-1 space-y-0.5 overflow-y-auto px-3 pb-2">
          <button
            onClick={() => onScope({ level: "all" })}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
              scope.level === "all" ? "bg-white/7 text-white" : "text-ink-300 hover:bg-white/4 hover:text-white",
            )}
          >
            <span className="grid h-6 w-6 place-items-center rounded-md border border-white/10 bg-white/5 text-[11px]">✦</span>
            <span className="flex-1">全部密钥</span>
            <span className="font-mono text-[11px] text-ink-500">{totalKeys}</span>
          </button>

          {vendors.map((v) => {
            const accs = accountsByVendor[v.id] ?? [];
            const expanded = expandedVendor === v.id;
            const vendorActive = activeVendor === v.id;
            return (
              <div key={v.id} className="group/vendor">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onScope({ level: "vendor", id: v.id });
                    if (!expanded) onToggleVendor(v.id);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && onScope({ level: "vendor", id: v.id })}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors",
                    vendorActive ? "bg-white/7 text-white" : "text-ink-300 hover:bg-white/4 hover:text-white",
                  )}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVendor(v.id);
                    }}
                    className="grid h-4 w-4 flex-none place-items-center text-ink-500 transition-transform hover:text-white"
                    style={{ transform: expanded ? "rotate(90deg)" : "none" }}
                    aria-label="展开账号"
                  >
                    <ChevronRight size={13} />
                  </button>
                  <BrandIcon
                    icon={v.icon}
                    logoData={v.logoData}
                    glyph={v.glyph}
                    size={24}
                    radius={7}
                    gradient={v.gradient}
                    color={v.ring}
                    title={v.name}
                  />
                  <span className="flex-1 truncate">{v.name}</span>
                  <span className="font-mono text-[11px] text-ink-500 group-hover/vendor:hidden">
                    {vendorCounts[v.id] ?? 0}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddAccount(v.id);
                    }}
                    title="为该厂商添加账号"
                    className="hidden h-5 w-5 flex-none place-items-center rounded-md text-ink-400 hover:bg-white/10 hover:text-white group-hover/vendor:grid"
                  >
                    <Plus size={12} />
                  </button>
                  {!isBuiltinVendor(v.id) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteVendor(v);
                      }}
                      title="删除自定义厂商"
                      className="hidden h-5 w-5 flex-none place-items-center rounded-md text-ink-400 hover:bg-rose-500/15 hover:text-rose-300 group-hover/vendor:grid"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>

                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="mt-0.5 ml-[15px] space-y-0.5 border-l border-white/8 pl-2">
                        {accs.map((a) => {
                          const accActive = scope.level === "account" && scope.id === a.id;
                          return (
                            <div
                              key={a.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => onScope({ level: "account", id: a.id })}
                              onKeyDown={(e) => e.key === "Enter" && onScope({ level: "account", id: a.id })}
                              className={cn(
                                "group/acc flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                                accActive ? "bg-white/8 text-white" : "text-ink-400 hover:bg-white/4 hover:text-white",
                              )}
                            >
                              <UserRound size={12} className="flex-none text-ink-500" />
                              <span className="min-w-0 flex-1 truncate">
                                <span className="block truncate text-[12px] leading-tight">{a.label}</span>
                                <span className="block truncate text-[10px] text-ink-500">{a.login || "—"}</span>
                              </span>
                              <span className="font-mono text-[10.5px] text-ink-500 group-hover/acc:hidden">
                                {accountCounts[a.id] ?? 0}
                              </span>
                              <div className="hidden flex-none items-center gap-0.5 group-hover/acc:flex">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEditAccount(a);
                                  }}
                                  className="grid h-5 w-5 place-items-center rounded-md text-ink-400 hover:bg-white/10 hover:text-white"
                                  title="编辑账号"
                                >
                                  <Pencil size={11} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteAccount(a);
                                  }}
                                  className="grid h-5 w-5 place-items-center rounded-md text-ink-400 hover:bg-rose-500/15 hover:text-rose-300"
                                  title="删除账号"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        <button
                          onClick={() => onAddAccount(v.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11.5px] text-ink-500 transition-colors hover:bg-white/4 hover:text-white"
                        >
                          <Plus size={11} /> 添加账号
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 pb-3">
        <button
          onClick={onAdd}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-[#0a0a12] transition-transform hover:scale-[1.015] active:scale-[0.99]"
          style={{
            background: "linear-gradient(120deg,#c9bdff,#7c5cff 45%,#35e6d0)",
            boxShadow: "0 14px 34px -14px rgba(124,92,255,1)",
          }}
        >
          <Plus size={16} strokeWidth={2.6} />
          添加密钥
        </button>
      </div>

      <div className="mx-3 mb-3 rounded-2xl border border-white/8 bg-white/3 p-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} className="text-[#35e6d0]" />
          <span className="text-[12.5px] font-medium">本地加密存储</span>
          <span className="ml-auto text-[10.5px] text-emerald-300">
            {updatedAt ? `已保存 ${relativeTime(updatedAt)}` : "已保存"}
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <button
            onClick={onExport}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/8 bg-white/4 py-2 text-[11.5px] font-medium text-ink-300 transition-colors hover:bg-white/8 hover:text-white"
          >
            <Download size={12} /> {desktopMode ? "保存" : "导出"}
          </button>
          <button
            onClick={onLock}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/8 bg-white/4 py-2 text-[11.5px] font-medium text-ink-300 transition-colors hover:bg-white/8 hover:text-white"
          >
            <Lock size={12} /> 锁定
          </button>
        </div>
      </div>

      {/* 设置：放在最底部 */}
      <button
        onClick={() => onNav("settings")}
        className={cn(
          "relative mx-3 mb-3 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors",
          nav === "settings" ? "text-white" : "text-ink-300 hover:text-white",
        )}
      >
        {nav === "settings" && (
          <motion.span
            layoutId="nav-active"
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="absolute inset-0 rounded-xl border border-white/10 bg-white/7"
            style={{ boxShadow: "0 12px 30px -16px rgba(124,92,255,0.9), inset 0 1px 0 rgba(255,255,255,0.08)" }}
          />
        )}
        <Settings size={17} className={cn("relative", nav === "settings" && "text-[#b9aaff]")} strokeWidth={2} />
        <span className="relative flex-1 text-left">设置</span>
        {nav === "settings" && (
          <span className="relative h-1.5 w-1.5 rounded-full bg-[#35e6d0] shadow-[0_0_10px_#35e6d0]" />
        )}
      </button>
    </aside>
  );
}
