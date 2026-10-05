import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { KeyRound, ShieldCheck, Clock, Wallet } from "lucide-react";

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, duration]);
  return value;
}

function Spark({ points, color }: { points: number[]; color: string }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 30 - ((p - min) / range) * 26 - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-20">
      <path
        d={`${d} L100,30 L0,30 Z`}
        fill={color}
        opacity="0.12"
      />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  hint,
  accent,
  spark,
  decimals = 0,
  delay = 0,
}: {
  icon: typeof KeyRound;
  label: string;
  value: number;
  suffix?: string;
  hint: string;
  accent: string;
  spark?: number[];
  decimals?: number;
  delay?: number;
}) {
  const v = useCountUp(value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="glass glow-ring group relative overflow-hidden rounded-2xl p-4"
    >
      <div
        className="pointer-events-none absolute -top-16 -right-12 h-40 w-40 rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-70"
        style={{ background: accent }}
      />
      <div className="relative flex items-start justify-between">
        <div
          className="grid h-9 w-9 place-items-center rounded-xl text-white"
          style={{
            background: `linear-gradient(140deg, ${accent}, rgba(255,255,255,0.12))`,
            boxShadow: `0 10px 24px -12px ${accent}`,
          }}
        >
          <Icon size={17} strokeWidth={2.2} />
        </div>
        {spark && <Spark points={spark} color={accent} />}
      </div>
      <div className="relative mt-3.5 flex items-baseline gap-1">
        <span className="font-mono text-[26px] font-semibold tracking-tight tabular-nums">
          {v.toFixed(decimals)}
        </span>
        {suffix && (
          <span className="text-[13px] font-medium text-ink-400">{suffix}</span>
        )}
      </div>
      <div className="relative mt-0.5 text-[12.5px] font-medium text-ink-300">
        {label}
      </div>
      <div className="relative mt-2 text-[11.5px] text-ink-500">{hint}</div>
    </motion.div>
  );
}

export function StatCards({
  total,
  active,
  expiring,
  balanceCNY,
  vendorCount,
  accountCount,
  balanceSpark,
}: {
  total: number;
  active: number;
  expiring: number;
  balanceCNY: number;
  vendorCount: number;
  accountCount: number;
  balanceSpark?: number[];
}) {
  const health = total ? Math.round((active / total) * 100) : 0;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatCard
        icon={KeyRound}
        label="密钥总数"
        value={total}
        hint={`覆盖 ${vendorCount} 家厂商 · ${accountCount} 个账号`}
        accent="#7c5cff"
        delay={0}
      />
      <StatCard
        icon={ShieldCheck}
        label="有效密钥"
        value={active}
        hint={`健康度 ${health}% · 刚刚检测`}
        accent="#35e6a8"
        delay={0.06}
      />
      <StatCard
        icon={Clock}
        label="即将过期"
        value={expiring}
        hint="7 天内需处理，建议续费"
        accent="#ffb35c"
        delay={0.12}
      />
      <StatCard
        icon={Wallet}
        label="折算余额"
        value={balanceCNY}
        suffix="CNY"
        decimals={2}
        hint={
          balanceSpark
            ? "按账号去重合计 · 曲线为真实采样"
            : "按账号去重合计 · 汇率可调"
        }
        accent="#35e6d0"
        spark={balanceSpark}
        delay={0.18}
      />
    </div>
  );
}
