import { useRef, useState } from "react";
import { Wallet, TrendingDown, Clock } from "lucide-react";
import { Modal, GhostButton } from "@/components/ui/Modal";
import { VendorGlyph } from "./bits";
import { dailyBurn, daysLeft, snapshotsOf, vendorById } from "@/data/db";
import type { Account } from "@/data/types";
import { cn, formatMoney, relativeTime } from "@/lib/utils";

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 带坐标轴的大图（鼠标悬停显示该点的时间与余额） */
function BigChart({
  points,
  times,
  color,
  currency,
}: {
  points: number[];
  times: string[];
  color: string;
  currency: "USD" | "CNY";
}) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);

  const W = 620;
  const H = 220;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 34;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const min = 0;
  const max = Math.max(...points);
  const range = max - min || 1;
  const x = (i: number) => padL + (i / (points.length - 1)) * iw;
  const y = (v: number) => padT + ih - ((v - min) / range) * ih;
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${padT + ih} L${padL},${padT + ih} Z`;
  const gridVals = [max, min + range / 2, min];

  const onMove = (e: React.MouseEvent) => {
    const svg = ref.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(((relX - padL) / iw) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, idx)));
  };

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="bh-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
            <text x={padL - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.45)">
              {formatMoney(v, currency)}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#bh-grad)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p)} r={points.length > 40 ? 1.5 : 3} fill={color} />
        ))}

        {hover != null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={padT}
              y2={padT + ih}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle cx={x(hover)} cy={y(points[hover])} r={4.5} fill={color} stroke="#fff" strokeWidth="1.5" />
          </g>
        )}

        <text x={padL} y={H - 8} fontSize="10" fill="rgba(255,255,255,0.45)">
          {fmtTime(times[0])}
        </text>
        <text x={W - padR} y={H - 8} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.45)">
          {fmtTime(times[times.length - 1])}
        </text>
      </svg>

      {hover != null && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-white/12 bg-[#12121b]/95 px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
          style={{ left: `${Math.min(92, Math.max(8, (x(hover) / W) * 100))}%`, top: 6 }}
        >
          <div className="text-ink-400">{fmtTime(times[hover])}</div>
          <div className="font-mono font-semibold text-white">{formatMoney(points[hover], currency)}</div>
        </div>
      )}
    </div>
  );
}

export function BalanceHistoryDialog({
  account,
  onClose,
}: {
  account: Account | null;
  onClose: () => void;
}) {
  if (!account) return null;
  const vendor = vendorById(account.vendorId);
  const snaps = snapshotsOf(account.id);
  const values = snaps.map((s) => s.balance);
  const burn = dailyBurn(account.id);
  const left = daysLeft(account.id, account.balance);
  const color = vendor?.ring ?? "#7c5cff";

  const rows = [...snaps].reverse();

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={
        vendor ? (
          <VendorGlyph vendor={vendor} size={34} radius={11} />
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/8">
            <Wallet size={17} />
          </span>
        )
      }
      title={`${vendor?.name ?? "账号"} · ${account.label} 余额变化`}
      subtitle={`共 ${snaps.length} 次有效采样（余额未变化时不再记录，只更新时间）`}
      footer={<GhostButton onClick={onClose}>关闭</GhostButton>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-soft rounded-xl p-3">
            <div className="text-[11px] text-ink-400">当前余额</div>
            <div className="mt-1 font-mono text-[18px] font-semibold">
              {account.balance != null ? formatMoney(account.balance, account.currency) : "—"}
            </div>
          </div>
          <div className="glass-soft rounded-xl p-3">
            <div className="flex items-center gap-1 text-[11px] text-ink-400">
              <TrendingDown size={11} /> 日消耗
            </div>
            <div className="mt-1 font-mono text-[18px] font-semibold">
              {burn != null && burn > 0 ? formatMoney(burn, account.currency) : "—"}
            </div>
          </div>
          <div className="glass-soft rounded-xl p-3">
            <div className="flex items-center gap-1 text-[11px] text-ink-400">
              <Clock size={11} /> 预计可用
            </div>
            <div className="mt-1 font-mono text-[18px] font-semibold">
              {left != null ? `${Math.max(0, Math.round(left))} 天` : "—"}
            </div>
          </div>
        </div>

        {snaps.length < 2 ? (
          <div className="glass-soft flex h-40 flex-col items-center justify-center gap-1.5 rounded-xl text-center">
            <span className="text-[13px] text-ink-300">采样不足，暂无法画图</span>
            <span className="text-[11.5px] text-ink-500">
              余额发生第 2 次变化后即可看到趋势（每 3 分钟自动查询）
            </span>
          </div>
        ) : (
          <>
            <div className="glass-soft rounded-xl p-3">
              <BigChart
                points={values}
                times={snaps.map((s) => s.at)}
                color={color}
                currency={account.currency}
              />
            </div>

            <div>
              <div className="mb-2 text-[12px] font-semibold text-ink-200">采样明细</div>
              <div className="no-scrollbar max-h-[220px] overflow-y-auto rounded-xl border border-white/8">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-[#12121b] text-ink-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">时间</th>
                      <th className="px-3 py-2 text-right font-medium">余额</th>
                      <th className="px-3 py-2 text-right font-medium">变化</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s, i) => {
                      const prev = rows[i + 1];
                      const diff = prev ? s.balance - prev.balance : null;
                      return (
                        <tr key={s.id} className="border-t border-white/5">
                          <td className="px-3 py-2 font-mono text-ink-200">{fmtTime(s.at)}</td>
                          <td className="px-3 py-2 text-right font-mono text-ink-100">
                            {formatMoney(s.balance, account.currency)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right font-mono",
                              diff == null
                                ? "text-ink-500"
                                : diff < 0
                                  ? "text-rose-300"
                                  : "text-emerald-300",
                            )}
                          >
                            {diff == null ? "—" : (diff > 0 ? "+" : "") + diff.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <div className="flex items-center justify-between text-[11.5px] text-ink-500">
          <span>余额来源：{vendor ? "自动查询" : "手动填写"}</span>
          <span>
            最近一次：{account.lastChecked ? relativeTime(account.lastChecked) : "—"}
          </span>
        </div>
      </div>
    </Modal>
  );
}
