/**
 * 软件预设：新建软件时可直接点选，自动填好名称 / 图标 / 主题色 / 类型。
 * icon 是 Simple Icons 的 slug，能取到就显示真实品牌图标，取不到则退回字母图标。
 * 仍可手动输入自定义名称与图标，也可上传自己的图片。
 */
export interface SoftwarePreset {
  name: string;
  glyph: string;
  /** Simple Icons slug（真实品牌图标） */
  icon?: string;
  accent: string;
  category: string;
  group: string;
}

export const SOFTWARE_GROUPS = ["Agent", "AI 编程", "客户端", "平台", "自研"];

export const SOFTWARE_PRESETS: SoftwarePreset[] = [
  // —— Agent 智能体（放最前面）——
  { name: "OpenClaw", glyph: "OC", accent: "#a855f7", category: "Agent 智能体", group: "Agent" },
  { name: "Hermes Agent", glyph: "HA", icon: "hermes", accent: "#f59e0b", category: "Agent 智能体", group: "Agent" },
  { name: "WorkBuddy", glyph: "WB", accent: "#22c55e", category: "Agent 智能体", group: "Agent" },
  { name: "AutoGPT", glyph: "AG", accent: "#ef4444", category: "Agent 智能体", group: "Agent" },
  { name: "Manus", glyph: "Ms", accent: "#6366f1", category: "Agent 智能体", group: "Agent" },
  { name: "Coze 扣子", glyph: "扣", icon: "coze", accent: "#7c3aed", category: "Agent 智能体", group: "Agent" },

  // —— AI 编程助手 ——
  { name: "Cursor", glyph: "Cu", icon: "cursor", accent: "#7c5cff", category: "AI 编程助手", group: "AI 编程" },
  { name: "Claude Code", glyph: "CD", icon: "claudecode", accent: "#d97757", category: "AI 编程助手", group: "AI 编程" },
  { name: "OpenAI Codex", glyph: "Cx", icon: "openai", accent: "#10a37f", category: "AI 编程助手", group: "AI 编程" },
  { name: "GitHub Copilot", glyph: "Co", icon: "githubcopilot", accent: "#8b949e", category: "AI 编程助手", group: "AI 编程" },
  { name: "Windsurf", glyph: "Ws", icon: "windsurf", accent: "#0ea5e9", category: "AI 编程助手", group: "AI 编程" },
  { name: "Cline", glyph: "Cl", icon: "cline", accent: "#22c55e", category: "AI 编程助手", group: "AI 编程" },
  { name: "OpenCode", glyph: "OC", icon: "opencode", accent: "#7c5cff", category: "AI 编程助手", group: "AI 编程" },
  { name: "Continue", glyph: "Cn", accent: "#6366f1", category: "AI 编程助手", group: "AI 编程" },
  { name: "Aider", glyph: "Ad", accent: "#f59e0b", category: "AI 编程助手", group: "AI 编程" },

  // —— 桌面 / 聊天客户端 ——
  { name: "ChatGPT Desktop", glyph: "GP", icon: "openai", accent: "#10a37f", category: "桌面客户端", group: "客户端" },
  { name: "Claude Desktop", glyph: "Ct", icon: "claude", accent: "#d97757", category: "桌面客户端", group: "客户端" },
  { name: "DeepSeek Harness", glyph: "DH", icon: "deepseek", accent: "#4d6bfe", category: "桌面客户端", group: "客户端" },
  { name: "Cherry Studio", glyph: "Ch", accent: "#ec4899", category: "桌面客户端", group: "客户端" },
  { name: "ChatBox", glyph: "CB", accent: "#06b6d4", category: "桌面客户端", group: "客户端" },
  { name: "LobeChat", glyph: "Lo", accent: "#6366f1", category: "桌面客户端", group: "客户端" },
  { name: "Open WebUI", glyph: "OW", accent: "#14b8a6", category: "桌面客户端", group: "客户端" },
  { name: "Ollama", glyph: "Ol", icon: "ollama", accent: "#cbd5e1", category: "本地模型运行时", group: "客户端" },
  { name: "LM Studio", glyph: "LM", icon: "lmstudio", accent: "#a78bfa", category: "本地模型运行时", group: "客户端" },

  // —— 工作流 / 应用平台 ——
  { name: "Dify", glyph: "Df", icon: "dify", accent: "#3b82f6", category: "工作流平台", group: "平台" },
  { name: "n8n", glyph: "n8", icon: "n8n", accent: "#ea4b71", category: "工作流平台", group: "平台" },
  { name: "LangChain", glyph: "LC", icon: "langchain", accent: "#1c3c3c", category: "工作流平台", group: "平台" },
  { name: "FastGPT", glyph: "FG", accent: "#10b981", category: "工作流平台", group: "平台" },
  { name: "RAGFlow", glyph: "RF", accent: "#0ea5e9", category: "工作流平台", group: "平台" },

  // —— 自研 / 杂项 ——
  { name: "客服系统", glyph: "客", accent: "#35e6d0", category: "自研 · Web 服务", group: "自研" },
  { name: "自动化脚本集", glyph: "脚", accent: "#4d6bfe", category: "自研 · Python", group: "自研" },
  { name: "论文助手", glyph: "研", accent: "#a855f7", category: "自研 · Web 应用", group: "自研" },
  { name: "个人工具", glyph: "个", accent: "#ff5c9d", category: "个人杂项", group: "自研" },
];
