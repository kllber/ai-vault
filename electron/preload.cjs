/**
 * Electron 预加载脚本：用最小接口把「系统文件对话框」和「退出前保存」暴露给界面。
 * 只暴露这几种能力，不开放 Node/文件系统给页面。
 */
const { contextBridge, ipcRenderer, webUtils } = require("electron");

/** 冷启动时命令行传入的 .aivault 文件路径（双击文件打开） */
const initialFile = (() => {
  const a = process.argv.find((x) => x.startsWith("--aivault-file="));
  if (!a) return null;
  try {
    return decodeURIComponent(a.slice("--aivault-file=".length)) || null;
  } catch {
    return null;
  }
})();

contextBridge.exposeInMainWorld("aivaultDesktop", {
  isDesktop: true,
  /** 冷启动时命令行传入的金库文件（双击 .aivault 打开），没有则 null */
  initialFile,
  /** 运行中的实例收到"打开文件"请求（再次双击 .aivault） */
  onOpenFile: (cb) => {
    ipcRenderer.on("aivault:open-file", (_e, p) => cb(p));
  },
  /** 取拖入/选择的本地文件的真实路径（Electron 32+ 用 webUtils；旧版回退 file.path） */
  getPathForFile: (file) => {
    try {
      if (webUtils && typeof webUtils.getPathForFile === "function") {
        const p = webUtils.getPathForFile(file);
        if (p) return p;
      }
    } catch {
      /* fallthrough */
    }
    try {
      return (file && file.path) || "";
    } catch {
      return "";
    }
  },
  /** 弹「另存为」，返回选择的文件路径或 null（取消） */
  chooseSavePath: (defaultName) => ipcRenderer.invoke("aivault:choose-save", defaultName),
  /** 弹「打开」，返回选择的文件路径或 null（取消） */
  chooseOpenPath: () => ipcRenderer.invoke("aivault:choose-open"),
  /** 主进程在关闭前请求保存：注册回调 */
  onFlushRequest: (cb) => {
    ipcRenderer.on("aivault:flush", () => cb());
  },
  /** 保存完成，通知主进程可以退出 */
  notifyFlushed: () => ipcRenderer.send("aivault:flushed"),
  /** 读取运行偏好（托盘常驻 / 开机自启） */
  getPrefs: () => ipcRenderer.invoke("aivault:prefs-get"),
  /** 修改运行偏好 */
  setPrefs: (patch) => ipcRenderer.invoke("aivault:prefs-set", patch),
});
