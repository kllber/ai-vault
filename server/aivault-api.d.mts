import type { IncomingMessage, ServerResponse } from "node:http";

/** 允许代理访问的厂商域名白名单 */
export const ALLOWED_HOSTS: Set<string>;

export interface AivaultApiOptions {
  /** 是否启用金库 KV 读写（仅独立局域网服务需要） */
  enableKv?: boolean;
  /** KV 落盘目录（enableKv 为 true 时必填） */
  dataDir?: string;
}

export interface AivaultApi {
  /** 处理一个 /__aivault 下的子路径请求（subpath 已去掉 /__aivault 前缀） */
  handle(req: IncomingMessage, res: ServerResponse, subpath: string): Promise<void>;
}

export function createAivaultApi(options?: AivaultApiOptions): AivaultApi;
