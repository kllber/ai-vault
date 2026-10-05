import { useEffect, useState } from "react";

/**
 * Simple Icons 的双版本回退。
 * 不同品牌在不同大版本里存在与否不一样（例如 openai 在 v16 被移除、cursor 在 v11 还没有），
 * 所以依次尝试 v16 → v11，取第一个能加载的。
 */
const VERSIONS = ["16", "11"];
const cdn = (v: string, slug: string) =>
  `https://cdn.jsdelivr.net/npm/simple-icons@${v}/icons/${slug}.svg`;

/** slug -> 可用的图标 URL（null 表示两个版本都没有） */
const urlCache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function loadOne(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function resolveIcon(slug: string): Promise<string | null> {
  if (urlCache.has(slug)) return Promise.resolve(urlCache.get(slug) ?? null);
  const p = pending.get(slug);
  if (p) return p;
  const job = (async () => {
    for (const v of VERSIONS) {
      const url = cdn(v, slug);
      if (await loadOne(url)) {
        urlCache.set(slug, url);
        pending.delete(slug);
        return url;
      }
    }
    urlCache.set(slug, null);
    pending.delete(slug);
    return null;
  })();
  pending.set(slug, job);
  return job;
}

function useIconUrl(slug?: string | null) {
  const [url, setUrl] = useState<string | null>(() =>
    slug ? (urlCache.get(slug) ?? null) : null,
  );
  useEffect(() => {
    if (!slug) {
      setUrl(null);
      return;
    }
    let alive = true;
    void resolveIcon(slug).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [slug]);
  return url;
}

export function BrandIcon({
  icon,
  logoData,
  glyph,
  size = 40,
  radius = 13,
  gradient,
  color,
  title,
}: {
  /** Simple Icons slug */
  icon?: string | null;
  /** 用户上传的图片（data URL），优先级最高 */
  logoData?: string | null;
  glyph: string;
  size?: number;
  radius?: number;
  gradient?: string;
  color?: string;
  title?: string;
}) {
  const iconUrl = useIconUrl(logoData ? null : icon);
  const box: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    flex: "none",
    overflow: "hidden",
    position: "relative",
    display: "grid",
    placeItems: "center",
    background: gradient ?? `${color ?? "#7c5cff"}22`,
    boxShadow: gradient
      ? `0 8px 26px -12px ${color ?? "rgba(124,92,255,0.6)"}, inset 0 1px 0 rgba(255,255,255,0.25)`
      : `inset 0 0 0 1px ${color ?? "#7c5cff"}55`,
  };

  // 1) 用户上传的图片
  if (logoData) {
    return (
      <span style={box} title={title}>
        <img
          src={logoData}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </span>
    );
  }

  // 2) 真实品牌图标（用 mask 上色）
  if (iconUrl) {
    const mask = {
      WebkitMaskImage: `url(${iconUrl})`,
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskPosition: "center",
      WebkitMaskSize: "contain",
      maskImage: `url(${iconUrl})`,
      maskRepeat: "no-repeat",
      maskPosition: "center",
      maskSize: "contain",
    } as React.CSSProperties;
    return (
      <span style={box} title={title}>
        <span
          style={{
            width: size * 0.58,
            height: size * 0.58,
            backgroundColor: gradient ? "#ffffff" : (color ?? "#ffffff"),
            ...mask,
          }}
        />
      </span>
    );
  }

  // 3) 字母图标（兜底）
  return (
    <span style={box} title={title}>
      <span
        style={{
          fontSize: size * 0.42,
          fontWeight: 600,
          color: gradient ? "#fff" : (color ?? "#fff"),
          textShadow: gradient ? "0 1px 3px rgba(0,0,0,0.35)" : "none",
          lineHeight: 1,
        }}
      >
        {glyph}
      </span>
    </span>
  );
}
