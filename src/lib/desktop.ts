/**
 * 桌面版（Electron）能力封装。
 * 在浏览器里 `desktop()` 返回 null，相关功能会自动降级（用文件输入 / 下载）。
 */
export interface DesktopApi {
  isDesktop: true;
  /** 冷启动时命令行传入的金库文件路径（双击 .aivault 打开）；没有则 null */
  initialFile?: string | null;
  /** 运行中的实例收到"打开文件"请求（再次双击 .aivault） */
  onOpenFile(cb: (path: string) => void): void;
  /** 读取运行偏好（托盘常驻 / 开机自启） */
  getPrefs(): Promise<{ closeToTray: boolean; launchAtLogin: boolean }>;
  /** 修改运行偏好 */
  setPrefs(
    patch: Partial<{ closeToTray: boolean; launchAtLogin: boolean }>,
  ): Promise<{ closeToTray: boolean; launchAtLogin: boolean }>;
  /** 取本地文件真实路径（拖入/选择时用），取不到返回 "" */
  getPathForFile(file: File): string;
  /** 弹「另存为」，返回文件路径或 null（取消） */
  chooseSavePath(defaultName?: string): Promise<string | null>;
  /** 弹「打开」，返回文件路径或 null（取消） */
  chooseOpenPath(): Promise<string | null>;
  /** 主进程请求"退出前保存"时回调 */
  onFlushRequest(cb: () => void): void;
  /** 通知主进程：已保存完，可以退出 */
  notifyFlushed(): void;
}

export function desktop(): DesktopApi | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { aivaultDesktop?: DesktopApi };
  return w.aivaultDesktop ?? null;
}

export const isDesktop = () => desktop() !== null;

/** 从绝对路径取显示名（去掉目录与 .aivault 后缀） */
export function baseName(p: string): string {
  const name = p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;
  return name.replace(/\.aivault$/i, "") || "我的金库";
}
