import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  KeyRound,
  Boxes,
  Plus,
  Lock,
  RefreshCw,
  Settings,
  Sparkle,
} from "lucide-react";
import { keyAccount, keyVendor, projectsOfSoftware } from "@/data/db";
import type { Account, ApiKey, Software, Vendor } from "@/data/types";
import { cn } from "@/lib/utils";
import { SoftGlyph, VendorGlyph } from "./bits";

interface Cmd {
  id: string;
  group: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  run: () => void;
}

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid h-[26px] w-[26px] place-items-center rounded-lg border border-white/10 bg-white/5 text-ink-200">
      {children}
    </span>
  );
}

export function CommandPalette({
  open,
  onClose,
  apiKeys,
  vendors,
  accounts,
  softwares,
  onSelectKey,
  onSelectAccount,
  onSelectSoftware,
  onAddKey,
  onRefresh,
  onOpenSettings,
  onLock,
}: {
  open: boolean;
  onClose: () => void;
  apiKeys: ApiKey[];
  vendors: Vendor[];
  accounts: Account[];
  softwares: Software[];
  onSelectKey: (k: ApiKey) => void;
  onSelectAccount: (a: Account) => void;
  onSelectSoftware: (s: Software) => void;
  onAddKey: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onLock: () => void;
}) {
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Cmd[]>(() => {
    const keyCmds: Cmd[] = apiKeys.flatMap((k) => {
      const vendor = keyVendor(k);
      const account = keyAccount(k);
      if (!vendor || !account) return [];
      return [
        {
          id: `key-${k.id}`,
          group: "密钥",
          label: k.alias,
          hint: `${vendor.name} · ${account.label}`,
          icon: <VendorGlyph vendor={vendor} size={26} radius={8} />,
          run: () => {
            onSelectKey(k);
            onClose();
          },
        },
      ];
    });

    const accountCmds: Cmd[] = accounts.map((a) => {
      const vendor = vendors.find((v) => v.id === a.vendorId)!;
      return {
        id: `acc-${a.id}`,
        group: "账号",
        label: `${vendor.name} · ${a.label}`,
        hint: a.login,
        icon: <VendorGlyph vendor={vendor} size={26} radius={8} />,
        run: () => {
          onSelectAccount(a);
          onClose();
        },
      };
    });

    const softwareCmds: Cmd[] = softwares.map((s) => ({
      id: `sw-${s.id}`,
      group: "软件",
      label: s.name,
      hint: `${projectsOfSoftware(s.id).length} 个项目 · ${s.category}`,
      icon: <SoftGlyph software={s} size={26} radius={8} />,
      run: () => {
        onSelectSoftware(s);
        onClose();
      },
    }));

    const actionCmds: Cmd[] = [
      {
        id: "a-add",
        group: "操作",
        label: "添加新密钥",
        hint: "新建一张厂商密钥卡",
        icon: <IconBox><Plus size={14} /></IconBox>,
        run: () => {
          onAddKey();
          onClose();
        },
      },
      {
        id: "a-check",
        group: "操作",
        label: "检测全部密钥有效性",
        hint: "批量 ping 各厂商接口",
        icon: <IconBox><RefreshCw size={14} /></IconBox>,
        run: () => {
          onRefresh();
          onClose();
        },
      },
      {
        id: "a-settings",
        group: "操作",
        label: "打开设置",
        hint: "同步、安全、外观",
        icon: <IconBox><Settings size={14} /></IconBox>,
        run: () => {
          onOpenSettings();
          onClose();
        },
      },
      {
        id: "a-lock",
        group: "操作",
        label: "锁定金库",
        hint: "立即要求金库密码",
        icon: <IconBox><Lock size={14} /></IconBox>,
        run: () => {
          onLock();
          onClose();
        },
      },
    ];

    return [...keyCmds, ...accountCmds, ...softwareCmds, ...actionCmds];
  }, [apiKeys, vendors, accounts, softwares, onClose, onSelectKey, onSelectAccount, onSelectSoftware, onAddKey, onRefresh, onOpenSettings, onLock]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(term) ||
        c.hint.toLowerCase().includes(term) ||
        c.group.toLowerCase().includes(term),
    );
  }, [commands, q]);

  useEffect(() => setIndex(0), [q, open]);

  useEffect(() => {
    if (open) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        filtered[index]?.run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, index, onClose]);

  let lastGroup = "";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel w-full max-w-[620px] overflow-hidden rounded-3xl"
            style={{ boxShadow: "0 40px 120px -30px rgba(124,92,255,0.6)" }}
          >
            <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4">
              <Search size={17} className="text-ink-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索密钥、账号、软件，或输入操作…"
                className="flex-1 bg-transparent text-[14.5px] text-white placeholder:text-ink-500 focus:outline-none"
              />
              <kbd className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-ink-400">
                ESC
              </kbd>
            </div>

            <div className="no-scrollbar max-h-[52vh] overflow-y-auto p-2">
              {filtered.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-14 text-ink-500">
                  <Sparkle size={22} />
                  <span className="text-[13px]">没有匹配结果</span>
                </div>
              )}
              {filtered.map((c, i) => {
                const showGroup = c.group !== lastGroup;
                lastGroup = c.group;
                return (
                  <div key={c.id}>
                    {showGroup && (
                      <div className="px-3 pt-3 pb-1.5 text-[10.5px] font-semibold tracking-wider text-ink-500 uppercase">
                        {c.group}
                      </div>
                    )}
                    <button
                      onMouseEnter={() => setIndex(i)}
                      onClick={c.run}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                        i === index ? "bg-white/8" : "hover:bg-white/4",
                      )}
                    >
                      <span className="flex-none">{c.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink-50">
                          {c.label}
                        </span>
                        <span className="block truncate text-[11px] text-ink-500">{c.hint}</span>
                      </span>
                      {i === index && <CornerDownLeft size={14} className="flex-none text-[#b9aaff]" />}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-white/8 px-4 py-2.5 text-[10.5px] text-ink-500">
              <span className="inline-flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <ArrowUp size={11} />
                  <ArrowDown size={11} /> 选择
                </span>
                <span className="inline-flex items-center gap-1">
                  <CornerDownLeft size={11} /> 执行
                </span>
              </span>
              <span className="inline-flex items-center gap-1">
                <KeyRound size={11} /> {apiKeys.length} 密钥
                <span className="text-ink-600">·</span>
                <Boxes size={11} /> {softwares.length} 软件
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
