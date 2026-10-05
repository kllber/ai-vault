<div align="center">

<img src="assets/banner.png" alt="AI Vault" width="100%" />

![version](https://img.shields.io/badge/version-1.0.0-7c5cff)
![license](https://img.shields.io/badge/license-Apache--2.0-blue)
![platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-4d6bfe)
![electron](https://img.shields.io/badge/electron-44-35e6d0)
![downloads](https://img.shields.io/github/downloads/kllber/ai-vault/total)

**简体中文** | [English](README.en.md)

<br />

<a href="https://github.com/kllber/ai-vault/releases/latest">
  <img src="https://img.shields.io/badge/DOWNLOAD-AI%20Vault%20v1.0.0-7c5cff?style=for-the-badge&logo=github" alt="Download" />
</a>

</div>

---

# AI Vault · 密钥金库

一个**本地优先、端到端加密**的 AI API 密钥管理工具。把散落在各处的各家大模型 API Key，收进一个加密的 `.aivault` 文件里统一管理——**哪个项目在用哪把 key、哪把还能用、余额还剩多少**，一目了然。

界面**全中文**，数据**只存本机**（或你自己的金库文件），密码经 **Argon2id + AES-256-GCM** 派生加密，明文密钥永不落盘、绝不上传。

> **English:** AI Vault is a local-first, end-to-end encrypted manager for AI API keys.
> Your keys live in a single encrypted `.aivault` file (Argon2id + AES-256-GCM). It tracks which
> project uses which key, key validity, balances and spend, with a built-in local service so the
> desktop app also serves a mobile-friendly web UI over LAN or Tailscale. Windows 10/11, no runtime
> dependencies required.

---

## ✨ 功能

- **加密保管**：密钥用 AES-256-GCM 加密，密钥由金库密码经 Argon2id（64 MiB / 3 轮）派生；明文只在解锁后的内存里。
- **层级建模**：`厂商 → 账号 → 密钥`，使用侧 `软件 → 项目`，用「主用 / 备用」绑定起来。
- **余额 / 花费**：DeepSeek、Moonshot、OpenRouter、硅基流动直接查；OpenAI / Anthropic 用「管理密钥」查本月花费；通义千问走官方 CLI（可一键安装登录）。
- **有效性检测**：逐把 key 调免费接口判断是否失效。
- **余额快照 / 趋势**：只在余额变化时记录，能看真实曲线、日消耗、预计可用天数。
- **文件即金库**：金库就是一个 `.aivault` 文件（类似 PSD），改动**立即写盘**，关软件前再保存一次。
- **手机可用**：内置本地服务，手机浏览器连同一 WiFi 即可用；配合 Tailscale 可跨网络（异地）访问。
- **后台运行 / 开机自启**：关窗收进右下角托盘继续跑；可在设置里开关开机自启。
- **`.aivault` 文件图标**：双击即可用本软件打开。
- **便携**：免安装文件夹版，拷到任意 Windows 电脑即可运行。

## ⬇️ 下载

到 [**Releases**](https://github.com/kllber/ai-vault/releases/latest) 下载 `AI-Vault-v1.0.0-win-x64.zip`：

1. 解压到任意**可写**目录（别放 `C:\Program Files`）。
2. 双击 `AI Vault.exe`。
3. 首次运行若提示「未知发布者」，点「更多信息 → 仍要运行」（未做代码签名）。

> 无需安装 .NET / Node / Python —— Electron 运行时已打包在内。

## 🔐 安全

- Argon2id 派生密钥 + AES-256-GCM 加密；明文密钥永不落盘。
- 复制密钥 30 秒后自动清空剪贴板；无操作 10 分钟自动锁定。
- 金库密码只在本机使用，不上传、无遥测。

## 🛠 开发

```bash
npm install
npm run dev          # 开发服务（热更新）
npm run build        # 类型检查 + 打包到 dist/
npm run app:build    # 打桌面版文件夹版 → release/win-unpacked
npm run app          # 直接跑 Electron（开发）
node cli/aivault.mjs selftest   # 命令行端到端自测
```

技术栈：React 19 + TypeScript + Vite、Tailwind CSS v4、Zustand、Electron。

## 📄 许可

本项目基于 **Apache License 2.0** 开源，详见 [LICENSE](LICENSE)。第三方组件声明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
