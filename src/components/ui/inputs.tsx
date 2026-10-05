import { useState, type ReactNode } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1 mb-2.5 text-[11px] font-semibold tracking-wider text-ink-500 uppercase">
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-[12px] font-medium text-ink-300">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-[13.5px] text-white placeholder:text-ink-500 transition-colors focus:border-[#7c5cff]/70 focus:outline-none";

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = "text",
  mono,
  autoFocus,
  masked,
  suffix,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
  mono?: boolean;
  autoFocus?: boolean;
  /** 视觉上打码，但**不是** password 类型，避免被浏览器密码管理器自动填充 */
  masked?: boolean;
  /** 输入框右侧的固定后缀（只显示，不进入输入值） */
  suffix?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input
          type={masked ? "text" : type}
          value={value}
          autoFocus={autoFocus}
          autoComplete="off"
          name={masked ? "aivault-secret" : undefined}
          data-1p-ignore={masked ? "true" : undefined}
          data-lpignore={masked ? "true" : undefined}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(inputCls, mono && "font-mono text-[12.5px]", suffix && "pr-14")}
          style={masked ? ({ WebkitTextSecurity: "disc" } as React.CSSProperties) : undefined}
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[12px] text-ink-500">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  hint,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={cn(inputCls, "resize-none leading-relaxed")}
      />
    </Field>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputCls, "appearance-none pr-9")}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-[#12121b]">
              {o.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-400">
          ▾
        </span>
      </div>
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  step = "any",
  min,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  step?: string;
  min?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(inputCls, "font-mono")}
      />
    </Field>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <Field label={label}>
      <div className="glass-soft inline-flex w-full rounded-xl p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-[9px] py-2 text-[12.5px] font-medium transition-colors",
              value === o.value ? "bg-white/12 text-white" : "text-ink-400 hover:text-white",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function TagField({
  label,
  value,
  onChange,
  hint,
}: {
  label?: string;
  value: string[];
  onChange: (v: string[]) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (!t || value.includes(t)) return setDraft("");
    onChange([...value, t]);
    setDraft("");
  };
  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-black/25 p-2">
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-lg border border-white/8 bg-white/6 px-2 py-1 text-[11.5px] text-ink-100"
          >
            {t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))}>
              <X size={11} className="text-ink-400 hover:text-white" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder={value.length ? "" : "输入后回车添加，如：生产"}
          className="min-w-[140px] flex-1 bg-transparent px-1 py-1 text-[13px] text-white placeholder:text-ink-500 focus:outline-none"
        />
      </div>
    </Field>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-2.5 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 text-left transition-colors hover:bg-white/6"
    >
      <span
        className={cn(
          "grid h-5 w-5 flex-none place-items-center rounded-md border transition-colors",
          checked ? "border-transparent bg-[#7c5cff]" : "border-white/20 bg-black/30",
        )}
      >
        {checked && <Check size={13} strokeWidth={3} className="text-white" />}
      </span>
      <span className="flex-1 text-[13px] text-ink-200">{children}</span>
    </button>
  );
}

export function InlineAdd({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-2.5 py-1.5 text-[12px] text-ink-300 transition-colors hover:border-[#7c5cff]/60 hover:text-white"
    >
      <Plus size={13} /> {label}
    </button>
  );
}
