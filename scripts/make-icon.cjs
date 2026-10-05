/**
 * 生成**软件自身**的图标（盾牌 + 对勾 Logo，源自 public/vault.svg）：
 *   - build/icon.png                   256，桌面版应用图标（圆角）
 *   - public/apple-touch-icon.png      180，iOS「添加到主屏幕」（满幅方形，iOS 自己切圆角）
 *   - public/icon-192.png / icon-512.png  安卓 PWA / manifest
 * 运行：electron scripts/make-icon.cjs
 */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("force-device-scale-factor", "1");

/** full=true：满幅方形（交给 iOS/安卓切圆角）；false：圆角（直接当应用图标） */
const logo = (size, full) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c5cff"/>
      <stop offset=".55" stop-color="#4d6bfe"/>
      <stop offset="1" stop-color="#35e6d0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="32" height="32" ${full ? "" : 'rx="8"'} fill="url(#g)"/>
  <path d="M16 6.5l7.5 3.4v5.7c0 4.7-3.1 8.8-7.5 10.2-4.4-1.4-7.5-5.5-7.5-10.2V9.9L16 6.5z" fill="none" stroke="white" stroke-width="1.9" stroke-linejoin="round"/>
  <path d="M12.3 15.9l2.8 2.8 5-5.4" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const html = (size, full) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}svg{display:block}</style></head><body>${logo(
    size,
    full,
  )}</body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  win.webContents.setZoomFactor(1);

  const render = async (size, full) => {
    win.setContentSize(size, size);
    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html(size, full)));
    await new Promise((r) => setTimeout(r, 250));
    let img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
    const s = img.getSize();
    if (s.width !== size || s.height !== size) img = img.resize({ width: size, height: size, quality: "best" });
    return img.toPNG();
  };

  const root = path.join(__dirname, "..");
  const write = (rel, buf) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, buf);
    // eslint-disable-next-line no-console
    console.log("written:", rel, buf.length, "bytes");
  };

  write(path.join("build", "icon.png"), await render(256, false));
  write(path.join("electron", "assets", "tray.png"), await render(32, false));
  write(path.join("public", "apple-touch-icon.png"), await render(180, true));
  write(path.join("public", "icon-192.png"), await render(192, true));
  write(path.join("public", "icon-512.png"), await render(512, true));

  app.quit();
});
