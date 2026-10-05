import type { BindRole, KeyStatus, Software, Vendor } from "@/data/types";
import { BrandIcon } from "./BrandIcon";
import { cn } from "@/lib/utils";

export function RolePicker({
  value,
  onChange,
}: {
  value: BindRole | undefined;
  onChange: (v: BindRole | undefined) => void;
}) {
  const opts: { v: BindRole | undefined; label: string }[] = [
    { v: undefined, label: "不绑定" },
    { v: "primary", label: "主用" },
    { v: "backup", label: "备用" },
  ];
  return (
    <div className="glass-soft inline-flex flex-none rounded-lg p-0.5">
      {opts.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition-colors",
            value === o.v
              ? o.v === "primary"
                ? "bg-[#7c5cff]/30 text-[#c3b8ff]"
                : o.v === "backup"
                  ? "bg-white/14 text-ink-100"
                  : "bg-white/10 text-ink-200"
              : "text-ink-500 hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function RoleBadge({ role }: { role: BindRole }) {
  return role === "primary" ? (
    <span className="rounded-[5px] bg-[#7c5cff]/25 px-1.5 py-0.5 text-[9.5px] font-semibold text-[#c3b8ff]">
      主用
    </span>
  ) : (
    <span className="rounded-[5px] bg-white/8 px-1.5 py-0.5 text-[9.5px] font-semibold text-ink-400">
      备用
    </span>
  );
}

export function SoftGlyph({
  software,
  size = 22,
  radius = 7,
}: {
  software: Software;
  size?: number;
  radius?: number;
}) {
  return (
    <BrandIcon
      icon={software.icon}
      logoData={software.logoData}
      glyph={software.glyph}
      size={size}
      radius={radius}
      color={software.accent}
      title={software.name}
    />
  );
}

export function VendorGlyph({
  vendor,
  size = 44,
  radius = 14,
}: {
  vendor: Vendor;
  size?: number;
  radius?: number;
}) {
  return (
    <BrandIcon
      icon={vendor.icon}
      logoData={vendor.logoData}
      glyph={vendor.glyph}
      size={size}
      radius={radius}
      gradient={vendor.gradient}
      color={vendor.ring}
      title={vendor.name}
    />
  );
}

const statusMeta: Record<
  KeyStatus,
  { dot: string; label: string; text: string }
> = {
  active: { dot: "status-active", label: "有效", text: "text-emerald-300" },
  expiring: { dot: "status-expiring", label: "即将过期", text: "text-amber-300" },
  invalid: { dot: "status-invalid", label: "已失效", text: "text-rose-300" },
  unchecked: { dot: "status-unchecked", label: "待检测", text: "text-ink-300" },
};

export function StatusPill({ status }: { status: KeyStatus }) {
  const m = statusMeta[status];
  return (
    <span className="glass-soft inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium">
      <span className={cn("status-dot", m.dot)} />
      <span className={m.text}>{m.label}</span>
    </span>
  );
}

export function statusLabel(status: KeyStatus) {
  return statusMeta[status].label;
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-white/8 bg-white/4 px-1.5 py-0.5 text-[10.5px] font-medium text-ink-300">
      {children}
    </span>
  );
}

export function Meter({
  value,
  accent = "#7c5cff",
}: {
  value: number;
  accent?: string;
}) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/6">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          background: `linear-gradient(90deg, ${accent}, #35e6d0)`,
          boxShadow: `0 0 12px ${accent}80`,
        }}
      />
    </div>
  );
}
