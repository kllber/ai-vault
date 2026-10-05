/**
 * AI Vault 桌面版（Electron 主进程）。
 *
 * 做的事：
 *   1) 在进程内起一台 AI Vault 服务（复用 server/create-server.mjs：前端 + 代理 + 金库 KV）
 *   2) 打开一个原生窗口加载它 —— 不依赖系统浏览器、没有命令行黑窗口
 *   3) 服务同时监听局域网，手机/平板照旧可用
 *
 * 数据目录（便携化）：
 *   - 打包后：exe 同级的 data/vault（跟着文件夹走，换机/换盘都能用）
 *   - 开发模式：%APPDATA%/ai-vault/vault
 *   首次启动会自动从旧位置（%APPDATA%/ai-vault/data、仓库 server/.data）迁移一次。
 */
const { app, BrowserWindow, Menu, shell, ipcMain, dialog, Tray } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { pathToFileURL } = require("node:url");

// 便携化：打包后把用户数据（金库 + 缓存）放到 exe 同级的 data 目录，跟着文件夹走
if (app.isPackaged) {
  try {
    const dataRoot = path.join(path.dirname(app.getPath("exe")), "data");
    fs.mkdirSync(dataRoot, { recursive: true });
    app.setPath("userData", dataRoot);
  } catch (e) {
    console.warn("[aivault] 设置便携数据目录失败，改用默认目录：", e);
  }
}

/* ------------------------------------------------------------------ */
/* `.aivault` 文件关联（写当前用户注册表，免管理员）                    */
/*   HKCU\Software\Classes\.aivault → ProgID → DefaultIcon / 打开命令   */
/*   软件每次启动都注册一遍（便携版换盘/换目录后自动指向新路径）。       */
/*   AIVAULT_NO_ASSOC=1 可跳过（开发/测试）。                           */
/* ------------------------------------------------------------------ */
const PROGID = "AIVault.File";

function regAdd(key, value, type = "REG_SZ") {
  return new Promise((resolve) => {
    execFile("reg.exe", ["add", key, "/ve", "/t", type, "/d", value, "/f"], { windowsHide: true }, (err) =>
      resolve(!err),
    );
  });
}

/** 让资源管理器立刻刷新文件图标（SHCNE_ASSOCCHANGED） */
function notifyShellRefresh() {
  const ps =
    "Add-Type -Namespace AivaultShell -Name Api -MemberDefinition '[DllImport(\"shell32.dll\")] public static extern void SHChangeNotify(int a, uint b, IntPtr c, IntPtr d);'; [AivaultShell.Api]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)";
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { windowsHide: true, timeout: 15000 },
      () => resolve(),
    );
  });
}

async function registerFileAssociation() {
  if (process.env.AIVAULT_NO_ASSOC) return;
  const ico = path.join(__dirname, "assets", "aivault.ico");
  if (!fs.existsSync(ico)) return;
  const exe = process.execPath;
  const base = "HKCU\\Software\\Classes";
  await regAdd(`${base}\\.aivault`, PROGID);
  await regAdd(`${base}\\${PROGID}`, "AI Vault 金库文件");
  await regAdd(`${base}\\${PROGID}\\DefaultIcon`, ico);
  await regAdd(`${base}\\${PROGID}\\shell\\open\\command`, `"${exe}" "%1"`);
  // 只在"图标路径或内容"变化时通知刷新（避免每次启动都刷）
  let signature = ico;
  try {
    signature = `${ico}|${fs.statSync(ico).mtimeMs}`;
  } catch {
    /* ignore */
  }
  const marker = path.join(app.getPath("userData"), ".assoc-ico");
  let last = "";
  try {
    last = fs.readFileSync(marker, "utf8");
  } catch {
    /* 首次 */
  }
  if (last !== signature) {
    try {
      fs.mkdirSync(app.getPath("userData"), { recursive: true });
      fs.writeFileSync(marker, signature, "utf8");
    } catch {
      /* ignore */
    }
    void notifyShellRefresh();
  }
}

/** 命令行里是否带着一个 .aivault 文件（双击文件关联时由系统传入） */
function fileFromArgv(argv) {
  for (const a of argv || []) {
    if (typeof a === "string" && /\.aivault$/i.test(a) && fs.existsSync(a)) return a;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 运行偏好（托盘常驻 / 开机自启）—— 存 data/prefs.json，按机器生效     */
/*   closeToTray：关闭窗口后隐藏到托盘继续运行（默认开）               */
/*   launchAtLogin：开机自启（写 HKCU\...\Run，会出现在 Windows 启动项）*/
/* ------------------------------------------------------------------ */
const DEFAULT_PREFS = { closeToTray: true, launchAtLogin: false };
let prefs = { ...DEFAULT_PREFS };
let tray = null;
let quitting = false;

function prefsFile() {
  return path.join(app.getPath("userData"), "prefs.json");
}
function loadPrefs() {
  try {
    const j = JSON.parse(fs.readFileSync(prefsFile(), "utf8"));
    prefs = { ...DEFAULT_PREFS, ...(j && typeof j === "object" ? j : {}) };
  } catch {
    /* 首次 */
  }
}
function savePrefs() {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(prefsFile(), JSON.stringify(prefs), "utf8");
  } catch (e) {
    console.warn("[aivault] 保存偏好失败：", e);
  }
}
function applyLaunchAtLogin() {
  if (!app.isPackaged) return; // 开发模式不碰系统启动项
  try {
    // Windows：写 HKCU\Software\Microsoft\Windows\CurrentVersion\Run
    // → 会出现在「设置 → 应用 → 启动」与「任务管理器 → 启动」
    app.setLoginItemSettings({
      openAtLogin: !!prefs.launchAtLogin,
      path: process.execPath,
      args: ["--tray"],
      name: "AI Vault",
    });
  } catch (e) {
    console.warn("[aivault] 设置开机自启失败：", e);
  }
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function requestFlushThenClose() {
  if (!mainWindow) {
    app.quit();
    return;
  }
  try {
    mainWindow.webContents.send("aivault:flush");
  } catch {
    allowClose = true;
    app.quit();
    return;
  }
  setTimeout(() => {
    if (!allowClose) {
      allowClose = true;
      app.quit();
    }
  }, 2500);
}

/** 托盘右键"退出"：真正退出（先保存） */
function requestQuit() {
  quitting = true;
  requestFlushThenClose();
}

function ensureTray() {
  if (tray) return;
  try {
    const png = path.join(__dirname, "assets", "tray.png");
    const ico = path.join(__dirname, "assets", "aivault.ico");
    tray = new Tray(fs.existsSync(png) ? png : ico);
    tray.setToolTip("AI Vault · 密钥金库");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "显示主界面", click: () => showMainWindow() },
        { type: "separator" },
        { label: "退出 AI Vault", click: () => requestQuit() },
      ]),
    );
    tray.on("click", () => showMainWindow());
    tray.on("double-click", () => showMainWindow());
  } catch (e) {
    console.warn("[aivault] 创建托盘失败：", e);
  }
}

let server = null;
let mainWindow = null;
let allowClose = false;

// 系统文件对话框（新建时"另存为"、打开时"选择文件"）
ipcMain.handle("aivault:choose-save", async (_e, defaultName) => {
  const r = await dialog.showSaveDialog(mainWindow, {
    title: "保存金库文件",
    defaultPath: defaultName || "我的金库.aivault",
    filters: [{ name: "AI Vault 金库", extensions: ["aivault"] }],
  });
  return r.canceled || !r.filePath ? null : r.filePath;
});

ipcMain.handle("aivault:choose-open", async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: "打开金库文件",
    properties: ["openFile"],
    filters: [{ name: "AI Vault 金库", extensions: ["aivault", "json"] }],
  });
  return r.canceled || !r.filePaths || !r.filePaths[0] ? null : r.filePaths[0];
});

// 运行偏好（托盘常驻 / 开机自启）
ipcMain.handle("aivault:prefs-get", () => ({ ...prefs }));
ipcMain.handle("aivault:prefs-set", (_e, patch) => {
  const p = patch && typeof patch === "object" ? patch : {};
  prefs = { ...prefs, ...p };
  savePrefs();
  if ("launchAtLogin" in p) applyLaunchAtLogin();
  if ("closeToTray" in p && prefs.closeToTray) ensureTray();
  return { ...prefs };
});

// 界面保存完成后，才真正退出
ipcMain.on("aivault:flushed", () => {
  allowClose = true;
  if (mainWindow) mainWindow.close();
});

/** 把已有的金库数据迁移到目标数据目录（仅当目标为空时） */
function migrateData(targetDir, sourceDirs) {
  try {
    if (fs.existsSync(path.join(targetDir, "kv.json"))) return;
    for (const src of sourceDirs) {
      if (!src) continue;
      const srcKv = path.join(src, "kv.json");
      if (!fs.existsSync(srcKv)) continue;
      fs.mkdirSync(targetDir, { recursive: true });
      for (const f of fs.readdirSync(src)) {
        fs.copyFileSync(path.join(src, f), path.join(targetDir, f));
      }
      console.log("[aivault] 已从", src, "迁移金库数据到", targetDir);
      return;
    }
  } catch (e) {
    console.warn("[aivault] 数据迁移失败：", e);
  }
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onErr = (e) => {
      server.removeListener("listening", onOk);
      reject(e);
    };
    const onOk = () => {
      server.removeListener("error", onErr);
      resolve(server.address().port);
    };
    server.once("error", onErr);
    server.once("listening", onOk);
    server.listen(port, "0.0.0.0");
  });
}

async function startServer() {
  const serverEntry = pathToFileURL(path.join(__dirname, "..", "server", "create-server.mjs")).href;
  const { createAivaultServer } = await import(serverEntry);
  const dataDir = path.join(app.getPath("userData"), "vault");
  migrateData(dataDir, [
    path.join(process.env.APPDATA || "", "ai-vault", "data"), // 旧默认位置
    path.join(__dirname, "..", "server", ".data"), // 开发 / 绿色版
    path.join(process.resourcesPath || "", "data"),
  ]);
  const distDir = path.join(__dirname, "..", "dist");
  server = createAivaultServer({ dataDir, distDir });
  try {
    return await listen(server, 5183);
  } catch {
    // 5183 被占用（例如已有另一个实例在跑）：改用系统分配的端口
    return await listen(server, 0);
  }
}

async function createWindow(port, initialFile, startHidden) {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    show: false,
    title: "AI Vault · 密钥金库",
    backgroundColor: "#07070c",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // 把"双击打开的金库文件"传给界面（preload 读取）
      additionalArguments: ["--aivault-file=" + encodeURIComponent(initialFile || "")],
    },
  });
  Menu.setApplicationMenu(null);
  await mainWindow.loadURL(`http://127.0.0.1:${port}`);
  if (!startHidden) mainWindow.show();
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 关闭窗口：① 开了"托盘常驻"→ 收进托盘继续跑；② 否则保存后退出（冒烟模式不拦）
  mainWindow.on("close", (e) => {
    if (allowClose || process.env.AIVAULT_SMOKE) return;
    e.preventDefault();
    if (prefs.closeToTray && !quitting) {
      ensureTray();
      mainWindow.hide();
      return;
    }
    requestFlushThenClose();
  });

  // 外链用系统浏览器打开，别在应用窗口里跳走
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }
    void shell.openExternal(url);
    return { action: "deny" };
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    if (mainWindow) {
      showMainWindow();
      const f = fileFromArgv(argv);
      if (f) mainWindow.webContents.send("aivault:open-file", f);
    }
  });

  app.whenReady().then(async () => {
    loadPrefs();
    ensureTray();
    applyLaunchAtLogin(); // 便携版换目录后，刷新开机自启里的路径
    if (app.isPackaged) {
      try {
        await registerFileAssociation();
      } catch (e) {
        console.warn("[aivault] 注册 .aivault 文件关联失败：", e);
      }
    }
    const initialFile = fileFromArgv(process.argv.slice(1));
    const startHidden =
      (process.argv.includes("--tray") && prefs.closeToTray) || process.env.AIVAULT_START_TRAY === "1";
    const port = await startServer();
    console.log(`[aivault] 服务已启动：http://localhost:${port}`);
    await createWindow(port, initialFile, startHidden);

    // 冒烟测试：AIVAULT_SMOKE=1 时跑一下并自动退出（供自动化验证）
    if (process.env.AIVAULT_SMOKE) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/__aivault/ping`);
        console.log("[aivault][smoke] ping:", await res.text());
      } catch (e) {
        console.log("[aivault][smoke] ping 失败:", e);
      }
      setTimeout(() => {
        console.log("[aivault][smoke] 退出");
        app.quit();
      }, 1500);
    }
  });

  app.on("window-all-closed", () => {
    // 开了托盘常驻时窗口只是隐藏、不会触发这里；真正退出才走到这
    app.quit();
  });

  app.on("before-quit", () => {
    quitting = true;
    if (tray) {
      try {
        tray.destroy();
      } catch {
        /* ignore */
      }
      tray = null;
    }
    if (server) {
      try {
        server.close();
      } catch {
        /* ignore */
      }
    }
  });
}
