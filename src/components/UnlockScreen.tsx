import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
  Lock,
  KeyRound,
  AlertTriangle,
  Check,
  FileKey2,
  Upload,
  Trash2,
  Plus,
  X,
  HardDrive,
} from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";
import { Checkbox } from "@/components/ui/inputs";
import { desktop as desktopApi } from "@/lib/desktop";
import type { VaultRef } from "@/store/vault";
import type { VaultFile } from "@/lib/crypto";

export interface PendingFile {
  envelope: VaultFile;
  fileName: string;
  /** 桌面版：被拖入文件的真实路径（用于绑定为工作文件） */
  path?: string | null;
}

export function UnlockScreen({
  vaults,
  activeId,
  pending,
  error,
  busy,
  onSelectVault,
  onOpen,
  onFilePicked,
  onImport,
  onCreate,
  onDeleteVault,
  desktopMode,
  onOpenPath,
  initialPath,
}: {
  vaults: VaultRef[];
  activeId: string | null;
  pending: PendingFile | null;
  error: string | null;
  busy: boolean;
  onSelectVault: (id: string) => void;
  onOpen: (id: string, password: string) => void;
  onFilePicked: (p: PendingFile | null) => void;
  onImport: (password: string) => void;
  onCreate: (name: string, password: string, withSeed: boolean) => void;
  onDeleteVault: (id: string) => void;
  /** 桌面版：用系统对话框打开任意 .aivault 文件 */
  desktopMode: boolean;
  onOpenPath: (path: string, password: string) => void;
  /** 双击 .aivault 传入的待打开文件（自动预选） */
  initialPath?: string | null;
}) {
  const [mode, setMode] = useState<"open" | "create">("open");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [withSeed, setWithSeed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 双击 .aivault 打开：自动切到"打开"模式并预选该文件（只需再输密码）
  useEffect(() => {
    if (!initialPath) return;
    setMode("open");
    setFilePath(initialPath);
    setPassword("");
    setLocalError(null);
  }, [initialPath]);

  const selected = useMemo(
    () => vaults.find((v) => v.id === activeId) ?? vaults[0] ?? null,
    [vaults, activeId],
  );

  const readFile = async (f: File) => {
    setLocalError(null);
    try {
      const text = await f.text();
      const env = JSON.parse(text) as VaultFile;
      if (!env || env.v !== 1 || !env.kdf || !env.iv || !env.data) {
        return setLocalError("这不是有效的 .aivault 文件");
      }
      let path: string | null = null;
      const api = desktopApi();
      if (api && api.getPathForFile) {
        try {
          path = api.getPathForFile(f) || null;
        } catch {
          path = null;
        }
      }
      // 双保险：桌面版若取不到拖入路径，让用户用对话框选一次，确保绑定为工作文件
      if (api && !path) {
        try {
          path = (await api.chooseOpenPath()) || null;
        } catch {
          path = null;
        }
      }
      onFilePicked({ envelope: env, fileName: f.name, path });
      setPassword("");
    } catch {
      setLocalError("无法解析该文件");
    }
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setLocalError(null);
    if (mode === "create") {
      if (password.length < 6) return setLocalError("金库密码至少 6 位");
      if (password !== confirm) return setLocalError("两次输入的密码不一致");
      onCreate(name.trim() || "我的金库", password, withSeed);
      return;
    }
    if (filePath) {
      if (!password) return setLocalError("请输入该文件的密码");
      onOpenPath(filePath, password);
      return;
    }
    if (pending) {
      if (!password) return setLocalError("请输入该备份文件的密码");
      onImport(password);
      return;
    }
    if (!selected) return setLocalError("请先选择或新建一个金库");
    if (!password) return setLocalError("请输入金库密码");
    onOpen(selected.id, password);
  };

  const shown = localError ?? error;
  const primaryLabel = mode === "create" ? "创建金库" : filePath ? "解锁金库" : pending ? "导入并打开" : "解锁金库";
  const canSubmit =
    mode === "create"
      ? Boolean(password && confirm)
      : filePath
        ? Boolean(password)
        : pending
          ? Boolean(password)
          : Boolean(selected && password);

  return (
    <div className="relative z-10 grid h-full w-full place-items-center overflow-y-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="glass-panel relative w-full max-w-[460px] overflow-hidden rounded-[30px] p-7"
        style={{ boxShadow: "0 50px 140px -40px rgba(124,92,255,0.7)" }}
        onDragOver={(e) => {
          e.preventDefault();
          if (mode === "open") setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f && mode === "open") void readFile(f);
        }}
      >
        <div
          className="pointer-events-none absolute -top-28 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(124,92,255,0.9), transparent 70%)" }}
        />

        <div className="relative flex flex-col items-center text-center">
          <div
            className="animate-breathe grid h-14 w-14 place-items-center rounded-[19px] text-white"
            style={{
              background: "linear-gradient(140deg,#7c5cff,#4d6bfe 55%,#35e6d0)",
              boxShadow: "0 20px 50px -14px rgba(124,92,255,1), inset 0 1px 0 rgba(255,255,255,0.45)",
            }}
          >
            <ShieldCheck size={27} strokeWidth={2.1} />
          </div>
          <h1 className="mt-4 text-[22px] font-semibold tracking-tight">
            AI <span className="text-aurora">Vault</span>
          </h1>
          <p className="mt-1 text-[12.5px] text-ink-400">
            {mode === "create" ? "新建一个金库文件" : "选择金库并输入金库密码"}
          </p>
        </div>

        <form onSubmit={submit} className="relative mt-6 space-y-3">
          {mode === "open" && (
            <>
              {/* 金库选择器 */}
              <div className="space-y-1.5">
                {pending && (
                  <div className="flex items-center gap-2.5 rounded-xl border border-[#7c5cff]/40 bg-[#7c5cff]/10 px-3 py-2.5">
                    <FileKey2 size={16} className="flex-none text-[#c3b8ff]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-white">{pending.fileName}</span>
                      <span className="block text-[10.5px] text-ink-400">待导入的备份文件</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onFilePicked(null)}
                      className="grid h-6 w-6 place-items-center rounded-md text-ink-400 hover:bg-white/10 hover:text-white"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}

                {filePath && (
                  <div className="flex items-center gap-2.5 rounded-xl border border-[#7c5cff]/40 bg-[#7c5cff]/10 px-3 py-2.5">
                    <FileKey2 size={16} className="flex-none text-[#c3b8ff]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-white">{filePath}</span>
                      <span className="block text-[10.5px] text-ink-400">待打开的金库文件</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setFilePath(null)}
                      className="grid h-6 w-6 place-items-center rounded-md text-ink-400 hover:bg-white/10 hover:text-white"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}

                {!pending && vaults.length > 0 && (
                  <div className="no-scrollbar max-h-[132px] space-y-1.5 overflow-y-auto">
                    {vaults.map((v) => {
                      const active = selected?.id === v.id;
                      return (
                        <div
                          key={v.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectVault(v.id)}
                          onKeyDown={(e) => e.key === "Enter" && onSelectVault(v.id)}
                          className={cn(
                            "group/v flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
                            active
                              ? "border-[#7c5cff]/50 bg-[#7c5cff]/12"
                              : "border-white/8 bg-white/3 hover:bg-white/6",
                          )}
                        >
                          <HardDrive size={15} className={cn("flex-none", active ? "text-[#c3b8ff]" : "text-ink-400")} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] text-white">{v.name}</span>
                            <span className="block truncate text-[10.5px] text-ink-500">
                              {v.lastOpenedAt ? `上次打开 ${relativeTime(v.lastOpenedAt)}` : "尚未打开过"}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteVault(v.id);
                            }}
                            title="从最近记录移除（不会删除你的 .aivault 文件）"
                            className="hidden h-6 w-6 flex-none place-items-center rounded-md text-ink-400 hover:bg-rose-500/15 hover:text-rose-300 group-hover/v:grid"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {!pending && !filePath && (
                  desktopMode ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const api = desktopApi();
                        if (!api) return;
                        const p = await api.chooseOpenPath();
                        if (p) {
                          setFilePath(p);
                          setPassword("");
                          setLocalError(null);
                        }
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-3 py-3 text-[12px] text-ink-400 transition-colors hover:border-[#7c5cff]/60 hover:text-white"
                    >
                      <Upload size={14} /> 打开 .aivault 文件…
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className={cn(
                        "flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-[12px] transition-colors",
                        dragging
                          ? "border-[#7c5cff] bg-[#7c5cff]/10 text-white"
                          : "border-white/15 text-ink-400 hover:border-[#7c5cff]/60 hover:text-white",
                      )}
                    >
                      <Upload size={14} />
                      {vaults.length ? "导入其它 .aivault 文件（或拖入）" : "拖入或选择 .aivault 文件"}
                    </button>
                  )
                )}
              </div>

              {/* 密码 */}
              <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 transition-colors focus-within:border-[#7c5cff]/70">
                <KeyRound size={17} className="text-ink-400" />
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={pending || filePath ? "输入该文件的密码" : "金库密码"}
                  autoFocus
                  className="flex-1 bg-transparent text-[14px] tracking-wide text-white placeholder:text-ink-500 focus:outline-none"
                />
                <button type="button" onClick={() => setShow((s) => !s)} className="text-ink-400 transition-colors hover:text-white">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </>
          )}

          {mode === "create" && (
            <>
              <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 transition-colors focus-within:border-[#7c5cff]/70">
                <HardDrive size={17} className="text-ink-400" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="金库名称（如：工作 / 个人）"
                  autoFocus
                  className="flex-1 bg-transparent text-[14px] text-white placeholder:text-ink-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 transition-colors focus-within:border-[#7c5cff]/70">
                <KeyRound size={17} className="text-ink-400" />
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="设定金库密码（至少 6 位）"
                  className="flex-1 bg-transparent text-[14px] tracking-wide text-white placeholder:text-ink-500 focus:outline-none"
                />
                <button type="button" onClick={() => setShow((s) => !s)} className="text-ink-400 transition-colors hover:text-white">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5 transition-colors focus-within:border-[#7c5cff]/70">
                <Check size={17} className="text-ink-400" />
                <input
                  type={show ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="再次输入确认"
                  className="flex-1 bg-transparent text-[14px] tracking-wide text-white placeholder:text-ink-500 focus:outline-none"
                />
              </div>
              <Checkbox checked={withSeed} onChange={setWithSeed}>
                载入示例数据，先看看效果（之后可一键删除）
              </Checkbox>
            </>
          )}

          {shown && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-[12px] text-rose-200">
              <AlertTriangle size={14} className="flex-none" />
              {shown}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[14px] font-semibold text-[#0a0a12] transition-transform hover:scale-[1.015] active:scale-[0.99] disabled:opacity-60"
            style={{
              background: "linear-gradient(120deg,#c9bdff,#7c5cff 48%,#35e6d0)",
              boxShadow: "0 18px 44px -16px rgba(124,92,255,1)",
            }}
          >
            {busy ? (
              <motion.span
                className="h-[18px] w-[18px] rounded-full border-2 border-black/25 border-t-black/80"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
              />
            ) : (
              <>
                {primaryLabel}
                <ArrowRight size={17} strokeWidth={2.6} />
              </>
            )}
          </button>

          {/* 底部：新建 / 返回 */}
          <div className="pt-1">
            {mode === "open" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("create");
                  setLocalError(null);
                  setPassword("");
                  setConfirm("");
                  setName("");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/4 py-3 text-[13px] font-medium text-ink-200 transition-colors hover:bg-white/8 hover:text-white"
              >
                <Plus size={15} /> 新建金库文件
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode("open");
                  setLocalError(null);
                  setPassword("");
                  setConfirm("");
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/4 py-3 text-[13px] font-medium text-ink-200 transition-colors hover:bg-white/8 hover:text-white"
              >
                返回打开已有金库
              </button>
            )}
          </div>
        </form>

        <div className="relative mt-5 grid grid-cols-3 gap-2">
          {[
            { icon: Lock, label: "Argon2id + AES-GCM" },
            { icon: FileKey2, label: ".aivault 文件" },
            { icon: ShieldCheck, label: "零知识加密" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 rounded-xl border border-white/6 bg-white/2 py-2.5">
              <Icon size={13} className="text-ink-400" />
              <span className="text-center text-[10px] text-ink-500">{label}</span>
            </div>
          ))}
        </div>

        <div className="relative mt-4 text-center text-[10.5px] text-ink-500">
          金库密码只在本机使用，不会上传
        </div>
      </motion.div>

      <input
        ref={fileRef}
        type="file"
        accept=".aivault,.json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void readFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
