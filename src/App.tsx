import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  KeyRound,
  Sparkles,
  Link2,
  ListFilter,
  X,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Download,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Wallet,
  PlugZap,
  Database,
  SearchX,
  Terminal,
  Power,
  Info,
} from "lucide-react";
import { Background } from "@/components/Background";
import { Sidebar, type NavId, type Scope } from "@/components/Sidebar";
import { TopBar, type StatusFilter } from "@/components/TopBar";
import { StatCards } from "@/components/StatCards";
import { KeyCard, KeyRow } from "@/components/KeyCard";
import { DetailDrawer } from "@/components/DetailDrawer";
import { BalanceHistoryDialog } from "@/components/BalanceHistory";
import { CommandPalette } from "@/components/CommandPalette";
import { UnlockScreen } from "@/components/UnlockScreen";
import { KeyForm } from "@/components/forms/KeyForm";
import { AccountForm, ProjectForm, SoftwareForm } from "@/components/forms/MiscForms";
import { ConfirmDialog, GhostButton, Modal, PrimaryButton } from "@/components/ui/Modal";
import { Checkbox, NumberField, TextField } from "@/components/ui/inputs";
import { RoleBadge, SoftGlyph, StatusPill, VendorGlyph } from "@/components/bits";
import {
  accountById,
  allVendors,
  balanceSeries,
  dailyBurn,
  daysLeft,
  expiringMemberships,
  getDB,
  isBuiltinVendor,
  keyAccount,
  keyUsages,
  keyVendor,
  membershipDaysLeft,
  projectKeys,
  projectsOfSoftware,
  vendorById,
} from "@/data/db";
import type { Account, ApiKey, Project, Software } from "@/data/types";
import { adapterFor, fetchUsdCny } from "@/lib/adapters";
import {
  fetchQianwenUsage,
  installQianwenCli,
  proxyAvailable,
  qianwenLoginComplete,
  qianwenLoginInit,
} from "@/lib/apiProxy";
import { clientId, serverRev, type StorageBackend } from "@/lib/storage";
import { desktop } from "@/lib/desktop";
import { useVault } from "@/store/vault";
import { cn, formatMoney, relativeTime } from "@/lib/utils";

const AUTO_LOCK_MS = 10 * 60 * 1000;

const navTitles: Record<NavId, { title: string; subtitle: string }> = {
  overview: { title: "概览", subtitle: "所有厂商密钥的一站式看板" },
  vault: { title: "密钥库", subtitle: "加密存储 · 按厂商、账号与使用位置归类" },
  projects: { title: "软件与项目", subtitle: "看清每个软件下的项目正在使用哪些密钥" },
  settings: { title: "设置", subtitle: "安全、备份与同步" },
};

export default function App() {
  const status = useVault((s) => s.status);
  const revision = useVault((s) => s.revision);
  const error = useVault((s) => s.error);
  const saveError = useVault((s) => s.saveError);
  const clearSaveError = useVault((s) => s.clearSaveError);
  const updatedAt = useVault((s) => s.updatedAt);
  const init = useVault((s) => s.init);
  const vaults = useVault((s) => s.vaults);
  const activeId = useVault((s) => s.activeId);
  const pending = useVault((s) => s.pending);
  const setActive = useVault((s) => s.setActive);
  const setPending = useVault((s) => s.setPending);
  const createVault = useVault((s) => s.createVault);
  const openVault = useVault((s) => s.openVault);
  const createVaultAt = useVault((s) => s.createVaultAt);
  const openVaultAt = useVault((s) => s.openVaultAt);
  const saveAs = useVault((s) => s.saveAs);
  const flush = useVault((s) => s.flush);
  const importFromFile = useVault((s) => s.importFromFile);
  const deleteVault = useVault((s) => s.deleteVault);
  const clearVaultData = useVault((s) => s.clearVaultData);
  const lock = useVault((s) => s.lock);
  const deleteKey = useVault((s) => s.deleteKey);
  const deleteSoftware = useVault((s) => s.deleteSoftware);
  const deleteProject = useVault((s) => s.deleteProject);
  const deleteAccount = useVault((s) => s.deleteAccount);
  const deleteVendor = useVault((s) => s.deleteVendor);
  const exportVault = useVault((s) => s.exportVault);
  const clearError = useVault((s) => s.clearError);
  const storageBackend = useVault((s) => s.storageBackend);
  const applyBalance = useVault((s) => s.applyBalance);
  const applySpend = useVault((s) => s.applySpend);
  const applyValidity = useVault((s) => s.applyValidity);
  const setSettings = useVault((s) => s.setSettings);
  const clearDemoData = useVault((s) => s.clearDemoData);
  const pullRemote = useVault((s) => s.pullRemote);

  const [busy, setBusy] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const [proxyOk, setProxyOk] = useState(false);
  const autoRan = useRef(false);
  const syncRevRef = useRef(0);
  const [nav, setNav] = useState<NavId>("overview");
  const [scope, setScope] = useState<Scope>({ level: "all" });
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [navOpen, setNavOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // 双击 .aivault / 主进程转发过来的待打开文件
  const [queuedPath, setQueuedPath] = useState<string | null>(() => desktop()?.initialFile ?? null);

  const [keyModal, setKeyModal] = useState<{ open: boolean; editing: ApiKey | null; presetAccountId: string | null }>({ open: false, editing: null, presetAccountId: null });
  const [accountModal, setAccountModal] = useState<{ open: boolean; editing: Account | null; presetVendorId: string | null }>({ open: false, editing: null, presetVendorId: null });
  const [softwareModal, setSoftwareModal] = useState<{ open: boolean; editing: Software | null }>({ open: false, editing: null });
  const [projectModal, setProjectModal] = useState<{ open: boolean; editing: Project | null; presetSoftwareId: string | null }>({ open: false, editing: null, presetSoftwareId: null });
  const [confirm, setConfirm] = useState<{ open: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => void }>({ open: false, title: "", message: "", onConfirm: () => {} });

  const [changeOpen, setChangeOpen] = useState(false);
  const [historyAccount, setHistoryAccount] = useState<Account | null>(null);
  const [qianwenState, setQianwenState] = useState<{
    state: string;
    message?: string;
    cost?: number;
  } | null>(null);
  const [qwBusy, setQwBusy] = useState<null | "installing" | "authorizing">(null);
  const [qwAuthUrl, setQwAuthUrl] = useState<string | null>(null);

  const checkQianwen = async () => {
    const r = await fetchQianwenUsage();
    if (r.ok) {
      setQianwenState({ state: "ok", cost: r.data?.pay_as_you_go?.total?.cost });
    } else {
      setQianwenState({ state: r.code ?? "error", message: r.message });
    }
  };

  const doInstallQianwen = async () => {
    setQwBusy("installing");
    setLocalMsg("正在安装千问 CLI，通常 20 秒左右…");
    const r = await installQianwenCli();
    setQwBusy(null);
    setLocalMsg(r.message);
    await checkQianwen();
  };

  const doLoginQianwen = async () => {
    setQwAuthUrl(null);
    const init = await qianwenLoginInit();
    // 已经登录过 → 直接刷新状态，不要再去等授权（否则会一直挂着）
    if (init.already) {
      setLocalMsg("已经登录过了");
      await checkQianwen();
      return;
    }
    if (!init.ok) {
      setLocalMsg(init.message ?? "发起登录失败");
      return;
    }
    if (init.url) {
      setQwAuthUrl(init.url);
      window.open(init.url, "_blank");
    }
    setQwBusy("authorizing");
    const done = await qianwenLoginComplete();
    setQwBusy(null);
    setQwAuthUrl(null);
    if (done.ok) {
      setLocalMsg("千问授权成功");
      await checkQianwen();
    } else {
      setLocalMsg(done.message ?? "授权失败");
    }
  };
  const [cpOld, setCpOld] = useState("");
  const [cpNew, setCpNew] = useState("");
  const [cpConfirm, setCpConfirm] = useState("");
  const [cpMsg, setCpMsg] = useState<string | null>(null);

  useEffect(() => {
    void init();
  }, [init]);

  // 首次创建后默认展开第一个有数据的厂商
  useEffect(() => {
    if (status === "unlocked" && expandedVendor === null) {
      const db = getDB();
      const first = db.vendors.find((v) => db.accounts.some((a) => a.vendorId === v.id));
      if (first) setExpandedVendor(first.id);
    }
  }, [status, expandedVendor, revision]);

  // 无操作自动锁定
  useEffect(() => {
    if (status !== "unlocked") return;
    let timer = 0;
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => lock(), AUTO_LOCK_MS);
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [status, lock]);

  // 全局快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const db = getDB();

  /* ------------------------------ 余额 / 有效性 ------------------------------ */
  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  /** 单把 key：刷新其所属账号的余额 + 该 key 的有效性 */
  const refreshOne = async (key: ApiKey): Promise<{ ok: boolean; message?: string }> => {
    if (key.demo) return { ok: false, message: "示例数据，已跳过" };
    const vendor = keyVendor(key);
    const account = keyAccount(key);
    if (!vendor || !account) return { ok: false, message: "找不到所属厂商 / 账号" };
    const ad = adapterFor(vendor.id);
    if (!ad) return { ok: false, message: "该厂商暂不支持自动查询" };
    if (!(await proxyAvailable())) return { ok: false, message: "本地查询服务未连接" };

    let ok = true;
    let message: string | undefined;

    if (ad.balanceVia === "admin") {
      if (!account.adminKey) {
        ok = false;
        message = "未填写管理密钥（Admin Key）";
      } else if (ad.fetchSpend) {
        const r = await ad.fetchSpend(key.baseUrl, account.adminKey);
        if (r.ok && r.balance != null) applySpend(account.id, r.balance, r.currency ?? "USD");
        else {
          ok = false;
          message = r.message;
        }
      }
    } else if (ad.balanceVia === "cli") {
      const r = await fetchQianwenUsage();
      const total = r.data?.pay_as_you_go?.total;
      if (r.ok && total && typeof total.cost === "number") {
        applySpend(account.id, total.cost, total.currency === "USD" ? "USD" : "CNY");
      } else {
        ok = false;
        message = r.message ?? "千问花费查询失败";
      }
    } else if (ad.supportsBalance) {
      const r = await ad.fetchBalance(key.baseUrl, key.secret);
      if (r.ok && r.balance != null) applyBalance(account.id, r.balance);
      else {
        ok = false;
        message = r.message;
      }
    }
    if (ad.supportsValid) {
      const v = await ad.checkValid(key.baseUrl, key.secret);
      applyValidity(key.id, v.ok);
      if (!v.ok) {
        ok = false;
        message = message ?? v.message;
      }
    }
    return { ok, message };
  };

  const refreshAll = async () => {
    if (refreshingRef.current) return;
    const available = await proxyAvailable(true);
    setProxyOk(available);
    if (!available) {
      setLocalMsg("自动查询需要本地服务：请确认电脑上的 AI Vault 正在运行");
      return;
    }
    refreshingRef.current = true;
    setRefreshing(true);

    const all = getDB().apiKeys;
    const active = all.filter((k) => !k.demo);
    const skipped = all.length - active.length;

    // 1) 余额 / 花费：按「账号」去重，一个账号只查一次
    const accountSample = new Map<string, ApiKey>();
    for (const k of active) {
      const vendor = keyVendor(k);
      const account = keyAccount(k);
      if (!vendor || !account) continue;
      const ad = adapterFor(vendor.id);
      if (!ad || !ad.supportsBalance) continue;
      if (ad.balanceVia === "admin" && !account.adminKey) continue;
      if (!accountSample.has(account.id)) accountSample.set(account.id, k);
    }

    const fails: string[] = [];
    let balanceOk = 0;
    let qianwenResult: Awaited<ReturnType<typeof fetchQianwenUsage>> | null = null;

    for (const [accountId, sample] of accountSample) {
      const account = accountById(accountId);
      const vendor = keyVendor(sample);
      const ad = vendor ? adapterFor(vendor.id) : undefined;
      if (!account || !ad) continue;

      if (ad.balanceVia === "cli") {
        // 千问是账号级（OAuth），整个刷新过程只查一次
        if (!qianwenResult) qianwenResult = await fetchQianwenUsage();
        const total = qianwenResult.data?.pay_as_you_go?.total;
        if (qianwenResult.ok && total && typeof total.cost === "number") {
          applySpend(accountId, total.cost, total.currency === "USD" ? "USD" : "CNY");
          balanceOk++;
        } else {
          fails.push(`${account.label} 花费：${qianwenResult.message ?? "查询失败"}`);
        }
      } else if (ad.balanceVia === "admin") {
        if (account.adminKey && ad.fetchSpend) {
          const r = await ad.fetchSpend(sample.baseUrl, account.adminKey);
          if (r.ok && r.balance != null) {
            applySpend(accountId, r.balance, r.currency ?? "USD");
            balanceOk++;
          } else {
            fails.push(`${account.label} 花费：${r.message ?? "失败"}`);
          }
        }
      } else if (ad.supportsBalance) {
        const r = await ad.fetchBalance(sample.baseUrl, sample.secret);
        if (r.ok && r.balance != null) {
          applyBalance(accountId, r.balance);
          balanceOk++;
        } else {
          fails.push(`${account.label} 余额：${r.message ?? "失败"}`);
        }
      }
      await sleep(250);
    }

    // 2) 有效性：每把 key 各查一次（免费；只有这样才能知道具体哪把失效）
    let validOk = 0;
    let unsupported = 0;
    for (const k of active) {
      const vendor = keyVendor(k);
      const ad = vendor ? adapterFor(vendor.id) : undefined;
      if (!ad) {
        unsupported++;
        continue;
      }
      if (!ad.supportsValid) continue;
      const v = await ad.checkValid(k.baseUrl, k.secret);
      applyValidity(k.id, v.ok);
      if (v.ok) validOk++;
      else fails.push(`${k.alias} 有效性：${v.message ?? "失效"}`);
      await sleep(250);
    }

    setSettings({ lastRefreshAt: new Date().toISOString() });
    refreshingRef.current = false;
    setRefreshing(false);

    const notes: string[] = [];
    if (skipped) notes.push(`跳过示例 ${skipped} 个`);
    if (unsupported) notes.push(`不支持自动查询 ${unsupported} 个`);
    setLocalMsg(
      fails.length
        ? `已刷新 ${balanceOk} 个账号余额、${validOk} 把 key 有效；${fails.length} 项失败 —— ${fails.slice(0, 3).join("；")}`
        : `已刷新 ${balanceOk} 个账号余额、${validOk} 把 key 有效性${notes.length ? `（${notes.join("，")}）` : ""}`,
    );
  };

  // 探测本地代理
  useEffect(() => {
    void proxyAvailable().then(setProxyOk);
  }, [status]);

  // 打开软件后自动获取一次实时汇率（可在设置里关闭）
  useEffect(() => {
    if (status !== "unlocked") return;
    if (!getDB().settings.autoRateOnOpen) return;
    let cancelled = false;
    void proxyAvailable().then(async (ok) => {
      if (!ok || cancelled) return;
      const rate = await fetchUsdCny();
      if (!cancelled && rate) {
        useVault.getState().setSettings({ usdToCny: rate, rateUpdatedAt: new Date().toISOString() });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [status]);

  // 打开软件后检测一次千问 CLI 状态（仅当存在千问账号时）
  useEffect(() => {
    if (status !== "unlocked") return;
    const hasQianwen = getDB().accounts.some(
      (a) => vendorById(a.vendorId)?.id === "qianwen",
    );
    if (hasQianwen) void checkQianwen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // 每次解锁后自动查询一次（可在设置里关闭）
  useEffect(() => {
    if (status !== "unlocked") {
      autoRan.current = false; // 锁定后重置，保证下次解锁仍会触发
      return;
    }
    if (!getDB().settings.autoRefreshOnOpen || autoRan.current) return;
    autoRan.current = true;
    void (async () => {
      // 本地服务可能还没就绪，重试几次（避免"隔三岔五不触发"）
      for (let i = 0; i < 6; i++) {
        if (await proxyAvailable(true)) {
          void refreshAll();
          return;
        }
        await new Promise((r) => setTimeout(r, 800));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const accountsByVendor = useMemo(() => {
    const map: Record<string, Account[]> = {};
    for (const a of getDB().accounts) (map[a.vendorId] ??= []).push(a);
    return map;
  }, [revision]);

  /** 侧栏只显示"已导入账户"的厂商；自定义厂商始终保留（否则没法管理/删除） */
  const visibleVendors = useMemo(
    () =>
      allVendors().filter(
        (v) => (accountsByVendor[v.id]?.length ?? 0) > 0 || !isBuiltinVendor(v.id),
      ),
    [accountsByVendor, revision],
  );

  const vendorCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const k of getDB().apiKeys) {
      const vid = keyAccount(k)?.vendorId;
      if (vid) map[vid] = (map[vid] ?? 0) + 1;
    }
    return map;
  }, [revision]);

  const accountCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const k of getDB().apiKeys) map[k.accountId] = (map[k.accountId] ?? 0) + 1;
    return map;
  }, [revision]);

  const statusCounts = useMemo(() => {
    const list = getDB().apiKeys;
    const base: Record<StatusFilter, number> = {
      all: list.length,
      active: 0,
      expiring: 0,
      invalid: 0,
      unchecked: 0,
    };
    for (const k of list) base[k.status]++;
    return base;
  }, [revision]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return getDB().apiKeys.filter((k) => {
      const account = keyAccount(k);
      if (scope.level === "vendor" && account?.vendorId !== scope.id) return false;
      if (scope.level === "account" && k.accountId !== scope.id) return false;
      if (statusFilter !== "all" && k.status !== statusFilter) return false;
      if (!term) return true;
      const vendor = keyVendor(k);
      const usage = keyUsages(k.id)
        .map((u) => `${u.software.name} ${u.project.name}`)
        .join(" ");
      return `${k.alias} ${vendor?.name ?? ""} ${account?.label ?? ""} ${account?.login ?? ""} ${k.tags.join(" ")} ${usage}`
        .toLowerCase()
        .includes(term);
    });
  }, [scope, statusFilter, query, revision]);

  const selected = db.apiKeys.find((k) => k.id === selectedId) ?? null;

  const balanceCNY = useMemo(
    () =>
      getDB().accounts.reduce((sum, a) => {
        if (a.balance == null) return sum;
        return sum + (a.currency === "USD" ? a.balance * getDB().settings.usdToCny : a.balance);
      }, 0),
    [revision],
  );

  const balanceSpark = useMemo(
    () => balanceSeries(getDB().settings.usdToCny),
    [revision, db.settings.usdToCny],
  );

  const activeCount = db.apiKeys.filter((k) => k.status === "active").length;
  const expiringCount = db.apiKeys.filter((k) => k.status === "expiring").length;
  const demoCount = db.apiKeys.filter((k) => k.demo).length;

  const askClearDemo = () =>
    setConfirm({
      open: true,
      title: "删除全部示例数据？",
      message: `将删除 ${demoCount} 条内置示例密钥及其关联（示例自带的账号/软件/项目会一并清理）。你自己添加的内容会保留。`,
      confirmLabel: "删除示例",
      onConfirm: () => {
        clearDemoData();
        setSelectedId(null);
        setConfirm((c) => ({ ...c, open: false }));
        setLocalMsg("示例数据已清除");
      },
    });

  const heading = useMemo(() => {
    if (scope.level === "vendor") {
      const v = vendorById(scope.id);
      const accs = accountsByVendor[v?.id ?? ""]?.length ?? 0;
      return { title: v?.name ?? "厂商", subtitle: `${accs} 个账号 · ${vendorCounts[scope.id] ?? 0} 把密钥` };
    }
    if (scope.level === "account") {
      const a = accountById(scope.id);
      const v = a ? vendorById(a.vendorId) : null;
      return { title: a?.label ?? "账号", subtitle: `${v?.name ?? ""} · ${a?.login || "—"}` };
    }
    return navTitles[nav];
  }, [scope, accountsByVendor, vendorCounts, nav, revision]);

  const scopeLabel = useMemo(() => {
    if (scope.level === "vendor") return vendorById(scope.id)?.name ?? null;
    if (scope.level === "account") {
      const a = accountById(scope.id);
      const v = a ? vendorById(a.vendorId) : null;
      return a ? `${v?.name ?? ""} · ${a.label}` : null;
    }
    return null;
  }, [scope, revision]);

  /* ------------------------------ 导出 / 导入 ------------------------------ */
  const handleExport = async () => {
    const api = desktop();
    if (api) {
      // 桌面版：改动本来就会自动写盘，"保存"= 立即把未落盘的改动写盘
      try {
        await flush();
        setLocalMsg("已保存到当前金库文件");
      } catch {
        // 失败时由 store 弹出 saveError 弹窗（文件被删）或底部提示
      }
      return;
    }
    const json = await exportVault();
    if (!json) return;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aivault-${new Date().toISOString().slice(0, 10)}.aivault`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** 桌面版：另存为新的金库文件并切换过去 */
  const handleSaveAs = async () => {
    const api = desktop();
    if (!api) {
      await handleExport();
      return;
    }
    const cur = vaults.find((v) => v.id === activeId);
    const def = `${(cur?.name ?? "我的金库").replace(/[\\/:*?"<>|]/g, "_")}.aivault`;
    const path = await api.chooseSavePath(def);
    if (!path) return;
    const ok = await saveAs(path);
    if (ok) setLocalMsg("已另存为新的金库文件，并切换过去");
    else setLocalMsg("另存为失败");
  };

  const refreshRate = async () => {
    if (!(await proxyAvailable())) {
      setLocalMsg("获取汇率需要本地服务：请确认电脑上的 AI Vault 正在运行");
      return;
    }
    const rate = await fetchUsdCny();
    if (rate) {
      setSettings({ usdToCny: rate, rateUpdatedAt: new Date().toISOString() });
      setLocalMsg(`汇率已更新：1 USD ≈ ${rate.toFixed(4)} CNY`);
    } else {
      setLocalMsg("汇率获取失败，已保留原值");
    }
  };

  // ---------------- 定时自动刷新 ----------------
  // 余额：默认每 3 分钟一次（可在设置里改；0 = 关闭）
  useEffect(() => {
    if (status !== "unlocked") return;
    const mins = getDB().settings.balanceIntervalMin;
    if (!mins || mins <= 0) return;
    const id = window.setInterval(() => void refreshAll(), mins * 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, db.settings.balanceIntervalMin]);

  // 汇率：默认每 30 分钟一次（可在设置里改；0 = 关闭）
  useEffect(() => {
    if (status !== "unlocked") return;
    const mins = getDB().settings.rateIntervalMin;
    if (!mins || mins <= 0) return;
    const id = window.setInterval(() => void refreshRate(), mins * 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, db.settings.rateIntervalMin]);

  // 局域网服务：轮询变更版本号，别的设备改了就把数据拉过来
  useEffect(() => {
    if (status !== "unlocked" || storageBackend !== "server") return;
    let stop = false;
    let ready = false;
    const tick = async () => {
      const r = await serverRev();
      if (stop || !r) return;
      if (!ready) {
        ready = true;
        syncRevRef.current = r.rev;
        return;
      }
      if (r.rev <= syncRevRef.current) return;
      syncRevRef.current = r.rev;
      if (r.by && r.by === clientId()) return; // 自己写的，忽略
      const ok = await pullRemote();
      if (ok && !stop) setLocalMsg("已同步另一台设备的更新");
    };
    void tick();
    const id = window.setInterval(() => void tick(), 4000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, storageBackend, pullRemote]);

  // 底部提示（错误 / 自动同步 / 其它）：5 秒后自动关闭，仍可手动点击关闭
  useEffect(() => {
    if (!localMsg && !(error && status === "unlocked")) return;
    const id = window.setTimeout(() => {
      setLocalMsg(null);
      clearError();
    }, 5000);
    return () => window.clearTimeout(id);
  }, [localMsg, error, status, clearError]);

  // 桌面版：主进程在"关闭窗口"前请求保存，保存完再允许退出
  useEffect(() => {
    const api = desktop();
    if (!api) return;
    api.onFlushRequest(() => {
      void useVault
        .getState()
        .flush()
        .catch(() => {})
        .finally(() => api.notifyFlushed());
    });
  }, []);

  // 双击 .aivault：主进程把文件转发过来 → 锁回登录界面并预选该文件
  useEffect(() => {
    const api = desktop();
    if (!api?.onOpenFile) return;
    api.onOpenFile((p) => {
      void useVault
        .getState()
        .lock()
        .finally(() => setQueuedPath(p));
    });
  }, []);

  // 解锁后清掉"待打开文件"，避免下次锁定时又自动选中
  useEffect(() => {
    if (status === "unlocked") setQueuedPath(null);
  }, [status]);

  const doChangePw = async () => {
    setCpMsg(null);
    if (cpNew.length < 6) return setCpMsg("新密码至少 6 位");
    if (cpNew !== cpConfirm) return setCpMsg("两次输入的新密码不一致");
    const ok = await useVault.getState().changePassword(cpOld, cpNew);
    if (ok) {
      setCpMsg("✓ 金库密码已更新");
      setCpOld("");
      setCpNew("");
      setCpConfirm("");
      setTimeout(() => setChangeOpen(false), 900);
    } else {
      setCpMsg("原密码不正确");
    }
  };

  /* ------------------------------ 认证界面 ------------------------------ */
  if (status === "loading") {
    return (
      <div className="relative h-[100dvh] w-screen overflow-hidden">
        <Background />
        <div className="relative z-10 grid h-full place-items-center">
          <Loader2 className="animate-spin text-[#b9aaff]" size={28} />
        </div>
      </div>
    );
  }

  if (status === "login") {
    return (
      <div className="relative h-[100dvh] w-screen overflow-hidden">
        <Background />
        {storageBackend === "none" && <StorageWarning />}
        <UnlockScreen
          vaults={vaults}
          activeId={activeId}
          pending={pending}
          error={error}
          busy={busy}
          onSelectVault={(id) => void setActive(id)}
          onOpen={async (id, pw) => {
            setBusy(true);
            await openVault(id, pw);
            setBusy(false);
          }}
          onFilePicked={(p) => setPending(p)}
          onImport={async (pw) => {
            if (!pending) return;
            setBusy(true);
            await importFromFile(pending.envelope, pending.fileName, pw, pending.path ?? null);
            setBusy(false);
          }}
          onCreate={async (name, pw, seed) => {
            setBusy(true);
            const api = desktop();
            if (api) {
              // 桌面版：先让用户选择保存位置（"另存为"），再创建
              const safe = (name.trim() || "我的金库").replace(/[\\/:*?"<>|]/g, "_");
              const path = await api.chooseSavePath(`${safe}.aivault`);
              if (path) await createVaultAt(path, name, pw, seed);
            } else {
              await createVault(name, pw, seed);
            }
            setBusy(false);
          }}
          onDeleteVault={(id) => {
            const v = vaults.find((x) => x.id === id);
            setConfirm({
              open: true,
              title: `从「最近打开」中移除「${v?.name ?? ""}」？`,
              message:
                "只移除这条**最近打开记录**，**不会删除你的 .aivault 文件**。文件仍在原位置，可随时点「打开 .aivault 文件…」再次打开。",
              confirmLabel: "移除记录",
              onConfirm: () => {
                void deleteVault(id);
                setConfirm((c) => ({ ...c, open: false }));
              },
            });
          }}
          desktopMode={desktop() !== null}
          initialPath={queuedPath}
          onOpenPath={async (path, pw) => {
            setBusy(true);
            await openVaultAt(path, pw);
            setBusy(false);
          }}
        />

        {/* 登录界面也要能弹出确认框（删除金库时需要） */}
        <ConfirmDialog
          open={confirm.open}
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
        />
      </div>
    );
  }

  const showVault = nav === "overview" || nav === "vault";
  const showDetail = showVault || nav === "projects";

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden">
      <Background />
      {storageBackend === "none" && <StorageWarning />}

      <div className="relative z-10 flex h-full gap-2 p-2 lg:gap-3 lg:p-3">
        {navOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setNavOpen(false)}
          />
        )}
        <Sidebar
          nav={nav}
          onNav={(n) => {
            setNav(n);
            setScope({ level: "all" });
            setQuery("");
            setNavOpen(false);
          }}
          scope={scope}
          onScope={(s) => {
            setNavOpen(false);
            setScope(s);
            setNav("vault");
            setSelectedId(null);
            if (s.level === "account") {
              const a = accountById(s.id);
              if (a) setExpandedVendor(a.vendorId);
            }
          }}
          expandedVendor={expandedVendor}
          onToggleVendor={(id) => setExpandedVendor((cur) => (cur === id ? null : id))}
          vendors={visibleVendors}
          accountsByVendor={accountsByVendor}
          vendorCounts={vendorCounts}
          accountCounts={accountCounts}
          totalKeys={db.apiKeys.length}
          onOpenPalette={() => setPaletteOpen(true)}
          onLock={lock}
          onAdd={() => setKeyModal({ open: true, editing: null, presetAccountId: null })}
          onAddAccount={(vendorId) => setAccountModal({ open: true, editing: null, presetVendorId: vendorId })}
          onDeleteVendor={(v) =>
            setConfirm({
              open: true,
              title: `删除厂商「${v.name}」？`,
              message: "将删除该自定义厂商（其中的账号需先删除）。预设厂商不能删除。",
              confirmLabel: "删除厂商",
              onConfirm: () => {
                const err = deleteVendor(v.id);
                if (err) setLocalMsg(err);
                setConfirm((c) => ({ ...c, open: false }));
              },
            })
          }
          onEditAccount={(a) => setAccountModal({ open: true, editing: a, presetVendorId: null })}
          onDeleteAccount={(a) =>
            setConfirm({
              open: true,
              title: `删除账号「${a.label}」？`,
              message: "若该账号下还有密钥，需要先删除或改绑这些密钥。",
              onConfirm: () => {
                const err = deleteAccount(a.id);
                if (err) setLocalMsg(err);
                setConfirm((c) => ({ ...c, open: false }));
              },
            })
          }
          onExport={handleExport}
          updatedAt={updatedAt}
          open={navOpen}
          onClose={() => setNavOpen(false)}
          desktopMode={desktop() !== null}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="px-1">
            <TopBar
              title={heading.title}
              subtitle={heading.subtitle}
              statusFilter={statusFilter}
              onStatusFilter={setStatusFilter}
              counts={statusCounts}
              view={view}
              onView={setView}
              query={query}
              onQuery={setQuery}
              hideFilters={!showVault}
              hideSearch={nav === "settings"}
              onRefresh={() => void refreshAll()}
              refreshing={refreshing}
              lastRefreshAt={db.settings.lastRefreshAt}
              refreshSupported={proxyOk}
              onMenu={() => setNavOpen(true)}
            />
          </div>

          {scopeLabel && (
            <div className="mt-3 flex items-center gap-2 px-1">
              <span className="glass-soft inline-flex items-center gap-2 rounded-full py-1.5 pr-1.5 pl-3 text-[12px] whitespace-nowrap text-ink-400">
                <ListFilter size={12} className="text-[#b9aaff]" />
                正在筛选
                <span className="font-medium text-white">{scopeLabel}</span>
                <button
                  onClick={() => setScope({ level: "all" })}
                  className="grid h-5 w-5 place-items-center rounded-full text-ink-400 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X size={12} strokeWidth={2.6} />
                </button>
              </span>
              <span className="text-[11.5px] text-ink-500">共 {filtered.length} 把密钥</span>
            </div>
          )}

          <div className="no-scrollbar mt-4 flex-1 overflow-y-auto px-1 pb-1">
            {demoCount > 0 && (nav === "overview" || nav === "vault") && (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3">
                <Sparkles size={14} className="flex-none text-amber-300" />
                <span className="flex-1 text-[12.5px] text-amber-100">
                  当前金库包含 <b>{demoCount}</b> 条内置示例数据（仅供演示，查询时会自动跳过）
                </span>
                <button
                  onClick={askClearDemo}
                  className="rounded-lg border border-amber-400/30 bg-amber-400/15 px-3 py-1.5 text-[12px] font-medium text-amber-100 transition-colors hover:bg-amber-400/25"
                >
                  一键删除示例数据
                </button>
              </div>
            )}

            {nav === "overview" ? (
              <Overview
                onPick={(k) => setSelectedId(k.id)}
                onAdd={() => setKeyModal({ open: true, editing: null, presetAccountId: null })}
                query={query}
                onClearQuery={() => setQuery("")}
              />
            ) : nav === "vault" ? (
              db.apiKeys.length === 0 ? (
                <EmptyVault onAdd={() => setKeyModal({ open: true, editing: null, presetAccountId: null })} />
              ) : (
                <div className="space-y-4">
                  <StatCards
                    total={db.apiKeys.length}
                    active={activeCount}
                    expiring={expiringCount}
                    balanceCNY={balanceCNY}
                    vendorCount={visibleVendors.length}
                    accountCount={db.accounts.length}
                    balanceSpark={balanceSpark}
                  />
                  {filtered.length === 0 ? (
                    query.trim() ? (
                      <NoMatch query={query.trim()} onClear={() => setQuery("")} />
                    ) : (
                      <EmptyState />
                    )
                  ) : view === "grid" ? (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                      {filtered.map((k, i) => (
                        <KeyCard key={k.id} index={i} apiKey={k} selected={selectedId === k.id} onSelect={() => setSelectedId(k.id)} />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map((k, i) => (
                        <KeyRow key={k.id} index={i} apiKey={k} selected={selectedId === k.id} onSelect={() => setSelectedId(k.id)} />
                      ))}
                    </div>
                  )}
                </div>
              )
            ) : nav === "projects" ? (
              <SoftwareView
                query={query}
                onClearQuery={() => setQuery("")}
                onPick={(k) => {
                  setSelectedId(k.id);
                }}
                onAddSoftware={() => setSoftwareModal({ open: true, editing: null })}
                onEditSoftware={(s) => setSoftwareModal({ open: true, editing: s })}
                onDeleteSoftware={(s) =>
                  setConfirm({
                    open: true,
                    title: `删除软件「${s.name}」？`,
                    message: "该软件及其下的所有项目、以及相关绑定都会被删除（密钥本身保留）。",
                    onConfirm: () => {
                      deleteSoftware(s.id);
                      setConfirm((c) => ({ ...c, open: false }));
                    },
                  })
                }
                onAddProject={(softwareId) => setProjectModal({ open: true, editing: null, presetSoftwareId: softwareId })}
                onEditProject={(p) => setProjectModal({ open: true, editing: p, presetSoftwareId: null })}
                onDeleteProject={(p) =>
                  setConfirm({
                    open: true,
                    title: `删除项目「${p.name}」？`,
                    message: "只删除项目本身及其绑定关系，密钥不会被删除。",
                    onConfirm: () => {
                      deleteProject(p.id);
                      setConfirm((c) => ({ ...c, open: false }));
                    },
                  })
                }
              />
            ) : (
              <SettingsView
                updatedAt={updatedAt}
                onExport={handleExport}
                onSaveAs={handleSaveAs}
                desktopMode={desktop() !== null}
                activeFilePath={vaults.find((v) => v.id === activeId)?.path ?? null}
                usdToCny={db.settings.usdToCny}
                rateUpdatedAt={db.settings.rateUpdatedAt}
                autoRefreshOnOpen={db.settings.autoRefreshOnOpen}
                autoRateOnOpen={db.settings.autoRateOnOpen}
                balanceIntervalMin={db.settings.balanceIntervalMin}
                rateIntervalMin={db.settings.rateIntervalMin}
                proxyOk={proxyOk}
                lastRefreshAt={db.settings.lastRefreshAt}
                onSetSettings={(patch) => setSettings(patch)}
                onRefreshNow={() => void refreshAll()}
                onRefreshRate={() => void refreshRate()}
                qianwenState={qianwenState}
                onCheckQianwen={() => void checkQianwen()}
                qwBusy={qwBusy}
                qwAuthUrl={qwAuthUrl}
                onInstallQianwen={() => void doInstallQianwen()}
                onLoginQianwen={() => void doLoginQianwen()}
                storageBackend={storageBackend}
                demoCount={demoCount}
                onClearDemo={askClearDemo}
                onChangePassword={() => {
                  setCpOld("");
                  setCpNew("");
                  setCpConfirm("");
                  setCpMsg(null);
                  setChangeOpen(true);
                }}
                onWipe={() =>
                  setConfirm({
                    open: true,
                    title: "清空金库内容？",
                    message:
                      "将删除该金库里的所有数据（保留金库本身与金库密码），无法撤销。建议先导出备份。",
                    confirmLabel: "确认清空",
                    onConfirm: () => {
                      clearVaultData();
                      setSelectedId(null);
                      setConfirm((c) => ({ ...c, open: false }));
                    },
                  })
                }
              />
            )}
          </div>
        </main>

        {showDetail && (
          <DetailDrawer
            apiKey={selected}
            onClose={() => setSelectedId(null)}
            onEdit={(k) => setKeyModal({ open: true, editing: k, presetAccountId: null })}
            onCheckValid={refreshOne}
            onEditAccount={(a) => setAccountModal({ open: true, editing: a, presetVendorId: null })}
            onOpenHistory={(a) => setHistoryAccount(a)}
            onDelete={(k) =>
              setConfirm({
                open: true,
                title: `删除密钥「${k.alias}」？`,
                message: "该密钥及其所有绑定关系将被永久删除。",
                onConfirm: () => {
                  deleteKey(k.id);
                  if (selectedId === k.id) setSelectedId(null);
                  setConfirm((c) => ({ ...c, open: false }));
                },
              })
            }
          />
        )}
      </div>

      {/* 弹窗 */}
      {keyModal.open && (
        <KeyForm
          open
          onClose={() => setKeyModal({ open: false, editing: null, presetAccountId: null })}
          editing={keyModal.editing}
          presetAccountId={keyModal.presetAccountId}
        />
      )}
      {accountModal.open && (
        <AccountForm
          open
          onClose={() => setAccountModal({ open: false, editing: null, presetVendorId: null })}
          editing={accountModal.editing}
          presetVendorId={accountModal.presetVendorId}
        />
      )}
      {softwareModal.open && (
        <SoftwareForm open onClose={() => setSoftwareModal({ open: false, editing: null })} editing={softwareModal.editing} />
      )}
      {projectModal.open && (
        <ProjectForm
          open
          onClose={() => setProjectModal({ open: false, editing: null, presetSoftwareId: null })}
          editing={projectModal.editing}
          presetSoftwareId={projectModal.presetSoftwareId}
        />
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.confirmLabel}
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
      />

      {/* 保存到金库文件失败（如文件被移动/删除）：弹窗，不自动关闭，提供"另存为" */}
      <Modal
        open={Boolean(saveError)}
        onClose={clearSaveError}
        size="sm"
        title="无法保存到金库文件"
        icon={
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-500/15 text-rose-300">
            <AlertTriangle size={17} />
          </span>
        }
        footer={
          <>
            <GhostButton onClick={clearSaveError}>稍后再说</GhostButton>
            <PrimaryButton onClick={() => void handleSaveAs()}>另存为…</PrimaryButton>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-ink-300">{saveError}</p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">
          你的改动仍在内存里、没有丢失。点「另存为…」选一个新位置保存即可继续使用。
        </p>
      </Modal>

      <Modal
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        size="sm"
        title="修改金库密码"
        subtitle="修改后请牢记新密码，忘记将无法恢复数据"
        footer={
          <>
            <GhostButton onClick={() => setChangeOpen(false)}>取消</GhostButton>
            <PrimaryButton onClick={doChangePw}>确认修改</PrimaryButton>
          </>
        }
      >
        <div className="space-y-3">
          <TextField label="原密码" value={cpOld} onChange={setCpOld} type="password" autoFocus />
          <TextField label="新密码" value={cpNew} onChange={setCpNew} type="password" hint="至少 6 位" />
          <TextField label="确认新密码" value={cpConfirm} onChange={setCpConfirm} type="password" />
          {cpMsg && (
            <div className={cn("rounded-xl px-3 py-2 text-[12.5px]", cpMsg.startsWith("✓") ? "bg-emerald-500/12 text-emerald-200" : "bg-rose-500/12 text-rose-200")}>
              {cpMsg}
            </div>
          )}
        </div>
      </Modal>

      <BalanceHistoryDialog account={historyAccount} onClose={() => setHistoryAccount(null)} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        apiKeys={db.apiKeys}
        vendors={allVendors()}
        accounts={db.accounts}
        softwares={db.softwares}
        onSelectKey={(k) => {
          setNav("vault");
          setScope({ level: "all" });
          setSelectedId(k.id);
        }}
        onSelectAccount={(a) => {
          setNav("vault");
          setScope({ level: "account", id: a.id });
          setSelectedId(null);
        }}
        onSelectSoftware={(s) => {
          setNav("projects");
          setScope({ level: "all" });
          setQuery(s.name);
        }}
        onAddKey={() => setKeyModal({ open: true, editing: null, presetAccountId: null })}
        onRefresh={() => void refreshAll()}
        onOpenSettings={() => {
          setNav("settings");
          setScope({ level: "all" });
          setQuery("");
        }}
        onLock={lock}
      />

      {(localMsg || (error && status === "unlocked")) && (
        <button
          onClick={() => {
            setLocalMsg(null);
            clearError();
          }}
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-rose-500/30 bg-rose-500/15 px-4 py-2.5 text-[12.5px] text-rose-100 backdrop-blur-md"
        >
          {localMsg ?? error} · 点击关闭
        </button>
      )}
    </div>
  );
}

/* ------------------------------ 子视图 ------------------------------ */

function Overview({
  onPick,
  onAdd,
  query,
  onClearQuery,
}: {
  onPick: (k: ApiKey) => void;
  onAdd: () => void;
  query: string;
  onClearQuery: () => void;
}) {
  const db = getDB();
  const q = query.trim().toLowerCase();
  const hit = (...parts: (string | null | undefined)[]) =>
    parts.filter(Boolean).join(" ").toLowerCase().includes(q);
  const rate = db.settings.usdToCny;
  const toCny = (v: number, cur: "USD" | "CNY") => (cur === "USD" ? v * rate : v);
  const balanceCNY = db.accounts.reduce(
    (s, a) => (a.balance == null ? s : s + toCny(a.balance, a.currency)),
    0,
  );
  const active = db.apiKeys.filter((k) => k.status === "active").length;
  const expiring = db.apiKeys.filter((k) => k.status === "expiring").length;

  const rank = (k: ApiKey) => (k.status === "invalid" ? 0 : k.status === "expiring" ? 1 : 2);
  const attentionAll = db.apiKeys
    .filter((k) => k.status === "expiring" || k.status === "invalid" || k.status === "unchecked")
    .sort((a, b) => rank(a) - rank(b));
  const attention = q
    ? attentionAll.filter((k) => {
        const v = keyVendor(k);
        const a = keyAccount(k);
        return hit(k.alias, v?.name, a?.label, a?.login);
      })
    : attentionAll;

  const membersAll = expiringMemberships(14);
  const members = q
    ? membersAll.filter((a) => hit(vendorById(a.vendorId)?.name, a.label, a.login))
    : membersAll;
  const attentionCount = attention.length + members.length;

  const accountsWithBalanceAll = [...db.accounts].sort((x, y) => {
    const cx = x.balance == null ? -1 : toCny(x.balance, x.currency);
    const cy = y.balance == null ? -1 : toCny(y.balance, y.currency);
    return cy - cx;
  });
  const accountsWithBalance = q
    ? accountsWithBalanceAll.filter((a) => hit(vendorById(a.vendorId)?.name, a.label, a.login))
    : accountsWithBalanceAll;

  const spark = useMemo(() => balanceSeries(rate), [rate, db.snapshots]);

  if (db.apiKeys.length === 0) return <EmptyVault onAdd={onAdd} />;

  const nothingMatched = Boolean(q) && attentionCount === 0 && accountsWithBalance.length === 0;

  return (
    <div className="space-y-4">
      <StatCards
        total={db.apiKeys.length}
        active={active}
        expiring={expiring}
        balanceCNY={balanceCNY}
        vendorCount={new Set(db.accounts.map((a) => a.vendorId)).size}
        accountCount={db.accounts.length}
        balanceSpark={spark}
      />

      {nothingMatched ? (
        <NoMatch query={query.trim()} onClear={onClearQuery} />
      ) : (
        <>
      {attentionCount > 0 && (
        <section className="glass rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-300" />
            <h2 className="text-[13.5px] font-semibold">需要关注</h2>
            <span className="ml-auto text-[11.5px] text-ink-500">{attentionCount} 项</span>
          </div>

          {members.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {members.map((a) => {
                const v = vendorById(a.vendorId);
                const d = membershipDaysLeft(a);
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/6 px-3 py-2"
                  >
                    {v && <VendorGlyph vendor={v} size={22} radius={7} />}
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-100">
                      会员 / 套餐 · {v?.name ?? ""} · {a.label}
                    </span>
                    <span
                      className={cn(
                        "text-[11px]",
                        d != null && d <= 3 ? "text-rose-300" : "text-amber-300",
                      )}
                    >
                      {d != null ? (d > 0 ? `${d} 天后到期` : "已过期") : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-1.5">
            {attention.map((k) => {
              const v = keyVendor(k);
              return (
                <button
                  key={k.id}
                  onClick={() => onPick(k)}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-white/6 bg-black/20 px-3 py-2 text-left transition-colors hover:bg-white/8"
                >
                  {v && <VendorGlyph vendor={v} size={22} radius={7} />}
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-100">{k.alias}</span>
                  <span className="hidden text-[11px] text-ink-500 sm:block">{v?.name ?? ""}</span>
                  <StatusPill status={k.status} />
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="glass rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wallet size={15} className="text-[#35e6d0]" />
          <h2 className="text-[13.5px] font-semibold">账号余额总览</h2>
          <span className="ml-auto text-[11.5px] text-ink-500">按账号 · 折算 CNY 排序</span>
        </div>
        {db.accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 py-8 text-center text-[12px] text-ink-500">
            还没有账号
          </div>
        ) : (
          <div className="space-y-1.5">
            {accountsWithBalance.map((a) => {
              const v = vendorById(a.vendorId);
              const burn = dailyBurn(a.id);
              const left = daysLeft(a.id, a.balance);
              const keyCount = db.apiKeys.filter((k) => k.accountId === a.id).length;
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-xl border border-white/6 bg-black/20 px-3 py-2.5"
                >
                  {v && <VendorGlyph vendor={v} size={26} radius={8} />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] text-ink-100">
                      {v?.name ?? "—"} · {a.label}
                    </div>
                    <div className="truncate text-[10.5px] text-ink-500">
                      {keyCount} 把 key
                      {a.lastChecked ? ` · 更新于 ${relativeTime(a.lastChecked)}` : " · 尚未查询"}
                    </div>
                  </div>
                  {burn != null && burn > 0 && left != null && (
                    <span className="hidden text-[10.5px] text-ink-500 md:block">
                      日耗 {formatMoney(burn, a.currency)} · 约 {Math.max(0, Math.round(left))} 天
                    </span>
                  )}
                  <span className="w-[92px] text-right font-mono text-[13px] tabular-nums text-ink-100">
                    {a.balance != null
                      ? formatMoney(a.balance, a.currency)
                      : a.spent != null
                        ? `-${formatMoney(a.spent, a.spentCurrency ?? "USD")}`
                        : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
        </>
      )}
    </div>
  );
}

function NoMatch({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="glass flex flex-col items-center gap-3 rounded-2xl py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/5">
        <SearchX size={20} className="text-ink-400" />
      </div>
      <div className="text-[14px] font-medium text-ink-200">
        当前正在筛选「{query}」
      </div>
      <div className="text-[12px] text-ink-500">当前页面没有匹配的内容</div>
      <button
        onClick={onClear}
        className="glass-soft mt-1 rounded-xl px-4 py-2 text-[12.5px] text-ink-200 transition-colors hover:bg-white/8 hover:text-white"
      >
        取消筛选
      </button>
    </div>
  );
}

function StorageWarning() {
  return (
    <div className="fixed top-4 left-1/2 z-[60] max-w-[92vw] -translate-x-1/2 rounded-xl border border-amber-500/30 bg-amber-500/15 px-4 py-2.5 text-center text-[12px] text-amber-100 backdrop-blur-md">
      ⚠ 当前环境禁止本地保存，数据关闭后会丢失。请改用桌面版 AI Vault 打开。
    </div>
  );
}

function EmptyVault({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="glass relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl py-24 text-center">
      <div
        className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: "rgba(124,92,255,0.8)" }}
      />
      <div className="relative grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/5">
        <KeyRound size={24} className="text-[#b9aaff]" />
      </div>
      <div className="relative text-[16px] font-semibold">金库还是空的</div>
      <div className="relative max-w-sm text-[12.5px] leading-relaxed text-ink-400">
        添加第一把密钥吧。先在「软件与项目」里建好软件和项目，就能把密钥绑定到具体使用位置。
      </div>
      <button
        onClick={onAdd}
        className="relative mt-1 flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-[#0a0a12]"
        style={{ background: "linear-gradient(120deg,#c9bdff,#7c5cff 45%,#35e6d0)", boxShadow: "0 14px 34px -14px rgba(124,92,255,1)" }}
      >
        <Plus size={16} strokeWidth={2.6} /> 添加第一把密钥
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass flex flex-col items-center gap-3 rounded-2xl py-20 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/5">
        <KeyRound size={20} className="text-ink-400" />
      </div>
      <div className="text-[14px] font-medium text-ink-200">没有符合条件的密钥</div>
      <div className="text-[12px] text-ink-500">换个筛选条件，或添加一张新的密钥卡</div>
    </div>
  );
}

function SoftwareView({
  onPick,
  onAddSoftware,
  onEditSoftware,
  onDeleteSoftware,
  onAddProject,
  onEditProject,
  onDeleteProject,
  query,
  onClearQuery,
}: {
  onPick: (k: ApiKey) => void;
  onAddSoftware: () => void;
  onEditSoftware: (s: Software) => void;
  onDeleteSoftware: (s: Software) => void;
  onAddProject: (softwareId: string) => void;
  onEditProject: (p: Project) => void;
  onDeleteProject: (p: Project) => void;
  query: string;
  onClearQuery: () => void;
}) {
  const db = getDB();
  const q = query.trim().toLowerCase();
  const softwares = !q
    ? db.softwares
    : db.softwares.filter(
        (sw) =>
          sw.name.toLowerCase().includes(q) ||
          sw.category.toLowerCase().includes(q) ||
          projectsOfSoftware(sw.id).some((p) => p.name.toLowerCase().includes(q)),
      );
  return (
    <div className="space-y-3">
      <button
        onClick={onAddSoftware}
        className="glass-soft glow-ring flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[13px] font-medium text-ink-300 transition-colors hover:bg-white/8 hover:text-white"
      >
        <Plus size={15} /> 添加软件（如 Cursor、客服系统、某个脚本）
      </button>

      {db.softwares.length === 0 ? (
        <div className="glass rounded-2xl py-16 text-center text-[13px] text-ink-500">
          还没有软件，点上面添加一个吧
        </div>
      ) : softwares.length === 0 ? (
        <NoMatch query={query.trim()} onClear={onClearQuery} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {softwares.map((sw, idx) => {
            const projs = projectsOfSoftware(sw.id);
            const keyIds = new Set(projs.flatMap((p) => projectKeys(p.id).map((pk) => pk.key.id)));
            return (
              <motion.div
                key={sw.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                className="glass glow-ring group/sw rounded-2xl p-4"
                style={{ boxShadow: `0 24px 60px -40px ${sw.accent}` }}
              >
                <div className="flex items-center gap-3">
                  <SoftGlyph software={sw} size={40} radius={12} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{sw.name}</div>
                    <div className="truncate text-[11.5px] text-ink-500">{sw.category || "—"}</div>
                  </div>
                  <span className="glass-soft rounded-full px-2 py-0.5 text-[10.5px] text-ink-300">
                    {projs.length} 项目 · {keyIds.size} key
                  </span>
                  <div className="hidden items-center gap-1 group-hover/sw:flex">
                    <button onClick={() => onEditSoftware(sw)} title="编辑软件" className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 hover:bg-white/8 hover:text-white">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => onDeleteSoftware(sw)} title="删除软件" className="grid h-7 w-7 place-items-center rounded-lg text-ink-400 hover:bg-rose-500/15 hover:text-rose-300">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="mt-3.5 space-y-2">
                  <div className="max-h-[248px] space-y-2 overflow-y-auto pr-1">
                  {projs.map((p) => {
                    const pks = projectKeys(p.id);
                    return (
                      <div key={p.id} className="glass-soft group/p rounded-xl p-2.5">
                        <div className="mb-1.5 flex items-center gap-2">
                          <Link2 size={12} className="text-ink-500" />
                          <span className="flex-1 text-[12.5px] font-medium text-ink-100">{p.name}</span>
                          <span className="text-[10px] text-ink-500">{pks.length} key</span>
                          <div className="hidden items-center gap-0.5 group-hover/p:flex">
                            <button onClick={() => onEditProject(p)} title="编辑项目（可添加密钥）" className="grid h-5 w-5 place-items-center rounded-md text-ink-400 hover:bg-white/10 hover:text-white">
                              <Pencil size={11} />
                            </button>
                            <button onClick={() => onDeleteProject(p)} title="删除项目" className="grid h-5 w-5 place-items-center rounded-md text-ink-400 hover:bg-rose-500/15 hover:text-rose-300">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                        {pks.length ? (
                          <div className="max-h-[112px] space-y-1 overflow-y-auto pr-1">
                            {pks.map((pk) => (
                              <button
                                key={`${pk.key.id}-${pk.binding.role}`}
                                onClick={() => onPick(pk.key)}
                                className="flex w-full items-center gap-2 rounded-lg border border-white/6 bg-black/20 px-2 py-1.5 text-left transition-colors hover:bg-white/8"
                              >
                                {pk.vendor && <VendorGlyph vendor={pk.vendor} size={20} radius={6} />}
                                <span className="flex-1 truncate text-[12px] text-ink-100">{pk.key.alias}</span>
                                <span className="hidden text-[10.5px] text-ink-500 sm:block">{pk.account?.label ?? ""}</span>
                                <RoleBadge role={pk.binding.role} />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-white/10 py-2 text-center text-[11px] text-ink-500">暂未绑定密钥</div>
                        )}
                      </div>
                    );
                  })}
                  </div>
                  <button
                    onClick={() => onAddProject(sw.id)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/12 py-2 text-[12px] text-ink-400 transition-colors hover:border-[#7c5cff]/50 hover:text-white"
                  >
                    <Plus size={12} /> 添加项目
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SettingsView({
  updatedAt,
  onExport,
  usdToCny,
  rateUpdatedAt,
  autoRefreshOnOpen,
  autoRateOnOpen,
  balanceIntervalMin,
  rateIntervalMin,
  proxyOk,
  lastRefreshAt,
  onSetSettings,
  onRefreshNow,
  onRefreshRate,
  qianwenState,
  onCheckQianwen,
  qwBusy,
  qwAuthUrl,
  onInstallQianwen,
  onLoginQianwen,
  storageBackend,
  demoCount,
  onClearDemo,
  onChangePassword,
  onWipe,
  onSaveAs,
  desktopMode,
  activeFilePath,
}: {
  updatedAt: string | null;
  onExport: () => void;
  usdToCny: number;
  rateUpdatedAt: string | null;
  autoRefreshOnOpen: boolean;
  autoRateOnOpen: boolean;
  balanceIntervalMin: number;
  rateIntervalMin: number;
  proxyOk: boolean;
  lastRefreshAt: string | null;
  onSetSettings: (patch: {
    usdToCny?: number;
    autoRefreshOnOpen?: boolean;
    autoRateOnOpen?: boolean;
    balanceIntervalMin?: number;
    rateIntervalMin?: number;
  }) => void;
  onRefreshNow: () => void;
  onRefreshRate: () => void;
  qianwenState: { state: string; message?: string; cost?: number } | null;
  onCheckQianwen: () => void;
  qwBusy: null | "installing" | "authorizing";
  qwAuthUrl: string | null;
  onInstallQianwen: () => void;
  onLoginQianwen: () => void;
  storageBackend: StorageBackend;
  demoCount: number;
  onClearDemo: () => void;
  onChangePassword: () => void;
  onWipe: () => void;
  onSaveAs: () => void;
  desktopMode: boolean;
  activeFilePath: string | null;
}) {
  const [rate, setRate] = useState(String(usdToCny));
  useEffect(() => setRate(String(usdToCny)), [usdToCny]);
  const [balInt, setBalInt] = useState(String(balanceIntervalMin));
  useEffect(() => setBalInt(String(balanceIntervalMin)), [balanceIntervalMin]);
  const [rateInt, setRateInt] = useState(String(rateIntervalMin));
  useEffect(() => setRateInt(String(rateIntervalMin)), [rateIntervalMin]);

  // 桌面版运行偏好（托盘常驻 / 开机自启）
  const [prefs, setPrefs] = useState<{ closeToTray: boolean; launchAtLogin: boolean } | null>(null);
  useEffect(() => {
    const api = desktop();
    if (!api?.getPrefs) return;
    let alive = true;
    void api
      .getPrefs()
      .then((p) => alive && setPrefs(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const updatePref = async (patch: { closeToTray?: boolean; launchAtLogin?: boolean }) => {
    const api = desktop();
    if (!api?.setPrefs) return;
    try {
      setPrefs(await api.setPrefs(patch));
    } catch {
      /* ignore */
    }
  };

  // 局域网服务：取可访问地址（供手机/平板打开）
  const [lan, setLan] = useState<{ port?: number; addresses?: { name: string; url: string }[] } | null>(null);
  useEffect(() => {
    if (storageBackend !== "server") return;
    let alive = true;
    fetch("/__aivault/info", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j) setLan(j);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [storageBackend]);

  return (
    <div className="max-w-[680px] space-y-3">
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold">
          <Wallet size={16} className="text-[#35e6d0]" /> 余额查询与消耗统计
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">
          能查余额的厂商（DeepSeek / Moonshot / OpenRouter / 硅基流动）会自动拉取；OpenAI、Anthropic
          只做有效性检测。消耗＝两次余额之差，因此需要多次查询累积采样才能算出日消耗。
        </p>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 text-[12px]">
          <PlugZap size={14} className={proxyOk ? "text-emerald-300" : "text-amber-300"} />
          <span className="flex-1 text-ink-300">
            本地查询服务：{proxyOk ? "已连接（可自动查询）" : "未运行（打开桌面版后可用）"}
          </span>
          <button
            onClick={onRefreshNow}
            disabled={!proxyOk}
            className="flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-1.5 text-[11.5px] font-medium text-ink-100 transition-colors hover:bg-white/14 disabled:opacity-50"
          >
            <RefreshCw size={12} /> 立即刷新
          </button>
        </div>

        <div className="mt-2 text-[11px] text-ink-500">
          上次查询：{lastRefreshAt ? new Date(lastRefreshAt).toLocaleString() : "尚未查询过"}
        </div>

        <div className="mt-4 space-y-2">
          <Checkbox
            checked={autoRefreshOnOpen}
            onChange={(v) => onSetSettings({ autoRefreshOnOpen: v })}
          >
            打开软件后自动查询一次余额
          </Checkbox>
          <Checkbox
            checked={autoRateOnOpen}
            onChange={(v) => onSetSettings({ autoRateOnOpen: v })}
          >
            打开软件后自动查询一次汇率
          </Checkbox>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField
            label="余额自动刷新间隔（分钟）"
            value={balInt}
            onChange={(v) => {
              setBalInt(v);
              const n = parseInt(v, 10);
              if (Number.isFinite(n) && n >= 0) onSetSettings({ balanceIntervalMin: n });
            }}
            min="0"
            hint="0 = 关闭定时刷新"
          />
          <NumberField
            label="汇率自动刷新间隔（分钟）"
            value={rateInt}
            onChange={(v) => {
              setRateInt(v);
              const n = parseInt(v, 10);
              if (Number.isFinite(n) && n >= 0) onSetSettings({ rateIntervalMin: n });
            }}
            min="0"
            hint="0 = 关闭定时刷新"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-[200px]">
            <TextField
              label="美元兑人民币汇率"
              value={rate}
              onChange={(v) => {
                setRate(v);
                const n = parseFloat(v);
                if (Number.isFinite(n) && n > 0) onSetSettings({ usdToCny: n });
              }}
              hint="改动会立即生效，无需保存"
            />
          </div>
          <button
            onClick={onRefreshRate}
            className="glass-soft mb-[26px] flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-[12.5px] font-medium text-ink-200 transition-colors hover:bg-white/8 hover:text-white"
          >
            <RefreshCw size={13} /> 立即获取
          </button>
        </div>
        <div className="mt-1 text-[11px] text-ink-500">
          汇率上次更新：{rateUpdatedAt ? new Date(rateUpdatedAt).toLocaleString() : "尚未获取"}
        </div>
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold">
          <Terminal size={16} className="text-[#b9aaff]" /> 通义千问花费
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">
          千问没有公开的账单接口，需要官方的查询工具。点下面的按钮，软件会
          <b className="text-ink-200">自动帮你装好并登录</b>，之后就能显示千问的
          <b className="text-ink-200">本月花费</b>。
        </p>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 text-[12px]">
          <span
            className={cn(
              "status-dot",
              qianwenState?.state === "ok"
                ? "status-active"
                : qianwenState
                  ? "status-invalid"
                  : "status-unchecked",
            )}
          />
          <span className="flex-1 text-ink-300">
            {qianwenState?.state === "ok"
              ? `已连接${qianwenState.cost != null ? ` · 本月花费 ¥${qianwenState.cost.toFixed(2)}` : ""}`
              : qianwenState?.state === "not-installed"
                ? "还没安装查询工具"
                : qianwenState?.state === "not-logged-in"
                  ? "工具已安装，但还没登录"
                  : qianwenState?.message
                    ? `检测失败：${qianwenState.message}`
                    : "尚未检测"}
          </span>
          {qianwenState?.state === "ok" && (
            <button
              onClick={onCheckQianwen}
              className="flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-1.5 text-[11.5px] font-medium text-ink-100 transition-colors hover:bg-white/14"
            >
              <RefreshCw size={12} /> 刷新
            </button>
          )}
        </div>

        {qianwenState?.state !== "ok" && (
          <button
            onClick={qianwenState?.state === "not-installed" ? onInstallQianwen : onLoginQianwen}
            disabled={Boolean(qwBusy)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[13.5px] font-semibold text-[#0a0a12] transition-transform hover:scale-[1.015] active:scale-[0.99] disabled:opacity-70"
            style={{
              background: "linear-gradient(120deg,#c9bdff,#7c5cff 48%,#35e6d0)",
              boxShadow: "0 14px 34px -16px rgba(124,92,255,1)",
            }}
          >
            {qwBusy === "installing"
              ? "正在安装…（约 20 秒，请稍候）"
              : qwBusy === "authorizing"
                ? "等待你在浏览器里点“授权”…"
                : qianwenState?.state === "not-installed"
                  ? "一键安装"
                  : "一键登录"}
          </button>
        )}

        {qwAuthUrl && (
          <div className="mt-2 text-[11.5px] text-ink-400">
            浏览器没自动弹出？{" "}
            <a
              href={qwAuthUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[#b9aaff] underline"
            >
              点这里手动打开授权页面
            </a>
          </div>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer text-[11.5px] text-ink-500">
            手动方式（进阶，一般用不到）
          </summary>
          <div className="mt-1.5 space-y-1 text-[11.5px] text-ink-400">
            <div>
              安装：<code className="rounded bg-black/30 px-1.5 py-0.5 text-ink-100">npm i -g @qianwenai/qianwen-cli</code>
            </div>
            <div>
              登录：<code className="rounded bg-black/30 px-1.5 py-0.5 text-ink-100">qianwen auth login</code>
            </div>
            <div className="text-ink-500">官方源装不上时可加：--registry=https://registry.npmmirror.com</div>
          </div>
        </details>

        <div className="mt-2 text-[11px] text-ink-500">
          需要本地服务（桌面版已内置），此功能才可用。登录有效期约 48 小时，过期后重新点「一键登录」即可。
        </div>
      </div>

      {desktop() !== null && prefs && (
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold">
            <Power size={16} className="text-[#35e6d0]" /> 桌面版 · 后台运行
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">
            关闭窗口后可继续在右下角托盘运行，手机随时都能连；也可设置开机自动启动。
          </p>
          <div className="mt-3 space-y-2">
            <Checkbox checked={prefs.closeToTray} onChange={(v) => void updatePref({ closeToTray: v })}>
              关闭窗口后最小化到托盘
            </Checkbox>
            <Checkbox checked={prefs.launchAtLogin} onChange={(v) => void updatePref({ launchAtLogin: v })}>
              开机自动启动
            </Checkbox>
          </div>
          {prefs.launchAtLogin && (
            <div className="mt-2 text-[11px] text-ink-500">
              已注册：可在「设置 → 应用 → 启动」或「任务管理器 → 启动」里看到「AI Vault」。
            </div>
          )}
        </div>
      )}

      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold">
          <Database size={16} className="text-[#b9aaff]" /> 本机存储
        </div>
        <div className="mt-2 flex items-center gap-2 text-[12.5px]">
          <span className="text-ink-400">存储方式：</span>
          {storageBackend === "none" ? (
            <span className="text-rose-300">不可用（数据不会保存！）</span>
          ) : storageBackend === "server" ? (
            <span className="text-emerald-300">局域网服务（电脑上 · 多端共用同一份）</span>
          ) : (
            <span className="text-emerald-300">
              {storageBackend === "idb" ? "IndexedDB" : "localStorage"}（仅本机浏览器）
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-baseline gap-1.5 text-[12px]">
          <span className="flex-none text-ink-400">当前金库文件：</span>
          <span className="min-w-0 break-all font-mono text-[11.5px] text-ink-200">
            {activeFilePath || "（内部存储，未绑定 .aivault 文件）"}
          </span>
        </div>
        {storageBackend === "server" && (
          <div className="mt-3 space-y-1.5 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5 text-[11.5px]">
            <div className="text-ink-400">手机 / 平板访问（连同一个 WiFi）：</div>
            {lan?.addresses && lan.addresses.length > 0 ? (
              lan.addresses.map((a) => (
                <div key={a.url} className="font-mono text-[#b9aaff]">
                  {a.url} <span className="text-ink-500">[{a.name}]</span>
                </div>
              ))
            ) : (
              <div className="font-mono text-ink-300">{typeof location !== "undefined" ? location.origin : ""}</div>
            )}
            <div className="text-ink-500">
              手机打开上面地址即可使用；金库数据保存在运行服务的电脑上，电脑与手机共用同一份（密码仍只在浏览器解密）。
            </div>
          </div>
        )}
        {storageBackend === "none" && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-rose-200">
            当前打开方式不允许本地保存，删除和修改会在刷新后丢失。请改用桌面版 AI Vault 打开。
          </p>
        )}
        {demoCount > 0 && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2.5">
            <span className="flex-1 text-[12px] text-amber-100">
              包含 {demoCount} 条内置示例数据
            </span>
            <button
              onClick={onClearDemo}
              className="rounded-lg border border-amber-400/30 bg-amber-400/15 px-3 py-1.5 text-[11.5px] font-medium text-amber-100 transition-colors hover:bg-amber-400/25"
            >
              删除示例数据
            </button>
          </div>
        )}
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold">
          <ShieldCheck size={16} className="text-[#35e6d0]" /> 安全
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">
          密钥以 Argon2id 派生密钥 + AES-256-GCM 加密后保存在本机，明文不会上传。复制密钥 30 秒后自动清空剪贴板；无操作 10 分钟自动锁定。
        </p>
        <button
          onClick={onChangePassword}
          className="glass-soft mt-3 rounded-xl px-4 py-2.5 text-[12.5px] font-medium text-ink-200 transition-colors hover:bg-white/8 hover:text-white"
        >
          修改金库密码
        </button>
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold">
          <Download size={16} className="text-[#b9aaff]" /> {desktopMode ? "另存为" : "导出金库备份"}
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">
          {desktopMode
            ? "把当前金库另存为一个新的 .aivault 文件，并切换过去继续编辑（原文件保留）。平时改动会自动保存到当前文件。"
            : "导出的是一个加密文件（`.aivault`），即使放进网盘也只有密文。换设备或想恢复时，在**登录界面**点「拖入或选择 .aivault 文件」并输入金库密码即可打开。"}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={desktopMode ? onSaveAs : onExport}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12.5px] font-semibold text-[#0a0a12]"
            style={{ background: "linear-gradient(120deg,#c9bdff,#7c5cff 50%,#35e6d0)" }}
          >
            <Download size={14} /> {desktopMode ? "另存为…" : "导出金库备份"}
          </button>
        </div>
        <div className="mt-3 text-[11.5px] text-ink-500">
          上次保存：{updatedAt ? new Date(updatedAt).toLocaleString() : "—"}
        </div>
      </div>

      <div className="glass rounded-2xl border border-rose-500/15 p-5">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-rose-200">
          <AlertTriangle size={16} /> 危险操作
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">
          清空金库会删除本机上的全部数据（不会删除你导出的备份文件）。
        </p>
        <button
          onClick={onWipe}
          className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-[12.5px] font-medium text-rose-200 transition-colors hover:bg-rose-500/18"
        >
          清空金库
        </button>
      </div>

      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 text-[13.5px] font-semibold">
          <Info size={16} className="text-[#b9aaff]" /> 关于
        </div>
        <div className="mt-2 space-y-1 text-[12.5px]">
          <div>
            <span className="font-medium text-ink-100">AI Vault · 密钥金库</span>{" "}
            <span className="font-mono text-ink-300">v{__APP_VERSION__}</span>
          </div>
          <div className="text-[11.5px] text-ink-500">本地优先、端到端加密的 AI API 密钥管理工具。</div>
          <div className="text-[11.5px] text-ink-500">开源许可：Apache License 2.0 · © 2026 kllber</div>
          <div className="pt-1 text-[11.5px]">
            <a
              href="https://github.com/kllber/ai-vault"
              target="_blank"
              rel="noreferrer"
              className="text-[#b9aaff] underline"
            >
              github.com/kllber/ai-vault
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

