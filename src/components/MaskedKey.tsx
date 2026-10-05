import { cn } from "@/lib/utils";

export function MaskedKey({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "truncate font-mono text-ink-200 [letter-spacing:0.02em] select-all",
        className,
      )}
      title="点击复制后 30 秒自动清空剪贴板"
    >
      {value}
    </span>
  );
}
