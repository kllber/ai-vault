/**
 * 金库加密：Argon2id 派生密钥 + AES-256-GCM 加密。
 * 明文密钥永不落盘，只有金库密码派生的密钥能解开密文。
 *
 * 关于 AES-GCM 的两条路径：
 * - 安全上下文（https / localhost）优先用浏览器原生 WebCrypto（crypto.subtle）。
 * - 非安全上下文（例如手机通过局域网 http://192.168.x.x 访问）没有 crypto.subtle，
 *   则退回纯 JS 实现的 AES-GCM（@noble/ciphers）。两者输出格式一致（密文‖16字节标签），
 *   可互相解密，因此已有金库不受影响。
 */
import { argon2id } from "hash-wasm";
import { gcm } from "@noble/ciphers/aes.js";

export interface KdfParams {
  algo: "argon2id";
  salt: string; // base64
  iterations: number;
  memorySize: number; // KiB
  parallelism: number;
  hashLength: number;
}

export interface VaultFile {
  v: 1;
  kdf: KdfParams;
  iv: string; // base64
  data: string; // base64 ciphertext
  meta: { createdAt: string; updatedAt: string };
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ---------------- base64 ---------------- */
export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const bs = (u: Uint8Array) => u as unknown as BufferSource;

/* ---------------- KDF ---------------- */
export function newKdfParams(): KdfParams {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    algo: "argon2id",
    salt: toB64(salt),
    iterations: 3,
    memorySize: 65536, // 64 MiB
    parallelism: 1,
    hashLength: 32,
  };
}

/** 由金库密码派生 32 字节原始密钥（不导入为 CryptoKey，便于两条 AES 路径共用） */
export async function deriveKey(password: string, params: KdfParams): Promise<Uint8Array> {
  const raw = await argon2id({
    password,
    salt: fromB64(params.salt),
    iterations: params.iterations,
    memorySize: params.memorySize,
    parallelism: params.parallelism,
    hashLength: params.hashLength,
    outputType: "binary",
  });
  return raw;
}

/* ---------------- AES-GCM（原生优先，纯 JS 兜底） ---------------- */
const hasSubtle = () =>
  typeof crypto !== "undefined" && !!crypto.subtle;

async function aesEncrypt(key: Uint8Array, iv: Uint8Array, plain: Uint8Array): Promise<Uint8Array> {
  if (hasSubtle()) {
    const ck = await crypto.subtle.importKey("raw", bs(key), { name: "AES-GCM" }, false, ["encrypt"]);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv) }, ck, bs(plain));
    return new Uint8Array(ct);
  }
  return gcm(key, iv).encrypt(plain);
}

async function aesDecrypt(key: Uint8Array, iv: Uint8Array, ct: Uint8Array): Promise<Uint8Array> {
  if (hasSubtle()) {
    const ck = await crypto.subtle.importKey("raw", bs(key), { name: "AES-GCM" }, false, ["decrypt"]);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(iv) }, ck, bs(ct));
    return new Uint8Array(pt);
  }
  return gcm(key, iv).decrypt(ct);
}

export async function encryptJSON(
  key: Uint8Array,
  obj: unknown,
): Promise<{ iv: string; data: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = enc.encode(JSON.stringify(obj));
  const ct = await aesEncrypt(key, iv, plain);
  return { iv: toB64(iv), data: toB64(ct) };
}

export async function decryptJSON<T = unknown>(
  key: Uint8Array,
  ivB64: string,
  dataB64: string,
): Promise<T> {
  const iv = fromB64(ivB64);
  const ct = fromB64(dataB64);
  const pt = await aesDecrypt(key, iv, ct);
  return JSON.parse(dec.decode(pt)) as T;
}
