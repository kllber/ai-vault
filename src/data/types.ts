export type KeyStatus = "active" | "expiring" | "invalid" | "unchecked";
export type BindRole = "primary" | "backup";

export interface Vendor {
  id: string;
  name: string;
  short: string;
  glyph: string;
  /** Simple Icons 的图标 slug（如 "openai"），有则显示真实图标 */
  icon?: string | null;
  gradient: string;
  ring: string;
  region: "海外" | "国内";
  /** 用户上传的自定义图标（data URL，优先于 icon/glyph） */
  logoData?: string | null;
}

/** 同一厂商下的登录账号（手机号 / 邮箱），账号下可挂多把密钥 */
export interface Account {
  id: string;
  vendorId: string;
  label: string;
  login: string;
  note: string;
  createdAt: string;
  /** 账号余额：该账号下所有密钥共享同一个余额 */
  balance: number | null;
  currency: "USD" | "CNY";
  /** 余额上次更新/查询时间 */
  lastChecked: string | null;
  /** 会员 / 套餐到期日（如 ChatGPT Plus、编程套餐），非 API key 的到期 */
  membershipExpiresAt: string | null;
  /**
   * 可选的「管理密钥（Admin Key）」。仅 OpenAI / Anthropic 用得上：
   * 这两家没有余额接口，但如果你填了组织管理密钥，就能查询本期花费。
   */
  adminKey?: string | null;
  /** 本期花费（有管理密钥时自动查询） */
  spent?: number | null;
  spentCurrency?: "USD" | "CNY";
  spentUpdatedAt?: string | null;
}

/** 调用方：软件 / 工具 */
export interface Software {
  id: string;
  name: string;
  glyph: string;
  /** Simple Icons 的图标 slug */
  icon?: string | null;
  /** 用户上传的自定义图标（data URL，优先） */
  logoData?: string | null;
  accent: string;
  category: string;
}

/** 软件下的具体项目 / 工作区 */
export interface Project {
  id: string;
  softwareId: string;
  name: string;
}

/** 密钥 ↔ 项目 的多对多绑定，带主/备角色 */
export interface Binding {
  keyId: string;
  projectId: string;
  role: BindRole;
}

export interface ApiKey {
  id: string;
  accountId: string;
  alias: string;
  /** 真实密钥明文（加密后落盘；仅在解锁状态下存在于内存） */
  secret: string;
  cipherHint: string;
  status: KeyStatus;
  tags: string[];
  baseUrl: string;
  note: string;
  createdAt: string;
  lastChecked: string;
  /** 示例数据标记：自动/手动查询都会跳过，避免假密钥被误判为失效 */
  demo?: boolean;
}

/** 余额快照：用于由差值推算"消耗"（按账号记录） */
export interface BalanceSnapshot {
  id: string;
  accountId: string;
  at: string;
  balance: number;
}

export interface Settings {
  /** 美元兑人民币汇率，用于折算 */
  usdToCny: number;
  /** 汇率上次自动更新时间 */
  rateUpdatedAt: string | null;
  /** 打开软件后是否自动查询一次余额 */
  autoRefreshOnOpen: boolean;
  /** 打开软件后是否自动获取一次汇率 */
  autoRateOnOpen: boolean;
  /** 上次成功查询余额的时间 */
  lastRefreshAt: string | null;
  /** 余额自动刷新间隔（分钟），0 = 关闭 */
  balanceIntervalMin: number;
  /** 汇率自动刷新间隔（分钟），0 = 关闭 */
  rateIntervalMin: number;
}

/** 整个金库的数据集 */
export interface DB {
  vendors: Vendor[];
  accounts: Account[];
  apiKeys: ApiKey[];
  softwares: Software[];
  projects: Project[];
  bindings: Binding[];
  snapshots: BalanceSnapshot[];
  settings: Settings;
}
