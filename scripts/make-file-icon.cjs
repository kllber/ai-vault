/**
 * 生成 AI Vault 图标资源：
 *   - electron/assets/aivault.ico        多尺寸 ICO（16/24/32/48/64/128/256，圆角透明），随程序附带
 *   - build/aivault-file-preview.png      256 预览图（仅看效果）
 *
 * 图形：文件（带折角）+ 钥匙孔，紫→青极光底（方案 E）。
 * 手动运行：electron scripts/make-file-icon.cjs
 */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("force-device-scale-factor", "1");

const SIZES = [16, 24, 32, 48, 64, 128, 256];

/** full=true：满幅方形（给 iOS/安卓自己切圆角）；false：圆角透明（给 Windows ico） */
const svg = (size, full) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8b6bff"/>
      <stop offset="0.5" stop-color="#4d6bfe"/>
      <stop offset="1" stop-color="#35e6d0"/>
    </linearGradient>
    <linearGradient id="doc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#d5daf2"/>
    </linearGradient>
  </defs>
  ${full ? `<rect x="0" y="0" width="256" height="256" fill="url(#bg)"/>` : `<rect x="8" y="8" width="240" height="240" rx="56" fill="url(#bg)"/>`}
  <path d="M80 46 H156 L192 82 V206 a14 14 0 0 1 -14 14 H80 a14 14 0 0 1 -14 -14 V60 a14 14 0 0 1 14 -14 Z" fill="url(#doc)"/>
  <path d="M156 46 L192 82 H156 Z" fill="#c4cbe6"/>
  <circle cx="129" cy="130" r="22" fill="#3a3f66"/>
  <path d="M120 150 h18 l-5 34 h-8 z" fill="#3a3f66"/>
</svg>`;

const html = (size, full) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}svg{display:block}</style></head><body>${svg(
    size,
    full,
  )}</body></html>`;

/** 把多张 PNG 打包成 ICO（Vista+ 支持 PNG 压缩条目） */
function packIco(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = 6 + count * 16;
  const dir = [];
  const datas = [];
  for (const e of entries) {
    const d = Buffer.alloc(16);
    d.writeUInt8(e.size >= 256 ? 0 : e.size, 0);
    d.writeUInt8(e.size >= 256 ? 0 : e.size, 1);
    d.writeUInt8(0, 2);
    d.writeUInt8(0, 3);
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(e.png.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += e.png.length;
    dir.push(d);
    datas.push(e.png);
  }
  return Buffer.concat([header, ...dir, ...datas]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 256,
    height: 256,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  win.webContents.setZoomFactor(1);

  const render = async (size, full) => {
    win.setContentSize(size, size);
    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html(size, full)));
    await new Promise((r) => setTimeout(r, 220));
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

  // 1) Windows ICO（圆角透明）
  const entries = [];
  for (const size of SIZES) entries.push({ size, png: await render(size, false) });
  write(path.join("electron", "assets", "aivault.ico"), packIco(entries));

  // 2) 预览图
  write(path.join("build", "aivault-file-preview.png"), await render(256, false));

  app.quit();
});
