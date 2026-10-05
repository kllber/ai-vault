import { useCallback, useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Trash2, ZoomIn } from "lucide-react";
import { Modal, GhostButton, PrimaryButton } from "./Modal";
import { cn } from "@/lib/utils";

const VIEW = 240; // 裁切视窗边长
const OUT = 128; // 输出尺寸

/** 裁切弹窗：拖拽移动 + 缩放，导出方形 PNG data URL */
function CropModal({
  src,
  onCancel,
  onApply,
}: {
  src: string;
  onCancel: () => void;
  onApply: (dataUrl: string) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setLoaded(true);
    };
    img.src = src;
  }, [src]);

  const dims = useCallback(() => {
    const img = imgRef.current;
    if (!img) return { dw: VIEW, dh: VIEW };
    const base = Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight);
    const s = base * zoom;
    return { dw: img.naturalWidth * s, dh: img.naturalHeight * s };
  }, [zoom]);

  const clamp = useCallback(
    (o: { x: number; y: number }, z = zoom) => {
      const img = imgRef.current;
      if (!img) return o;
      const base = Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight);
      const s = base * z;
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      const maxX = Math.max(0, (dw - VIEW) / 2);
      const maxY = Math.max(0, (dh - VIEW) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, o.x)),
        y: Math.max(-maxY, Math.min(maxY, o.y)),
      };
    },
    [zoom],
  );

  // 滚轮缩放（非被动监听，才能 preventDefault 阻止页面滚动）
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const img = imgRef.current;
      if (!img) return;
      const nz = Math.min(3, Math.max(1, zoomRef.current - e.deltaY * 0.0015));
      zoomRef.current = nz;
      setZoom(nz);
      const base = Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight);
      const s = base * nz;
      const dw = img.naturalWidth * s;
      const dh = img.naturalHeight * s;
      const maxX = Math.max(0, (dw - VIEW) / 2);
      const maxY = Math.max(0, (dh - VIEW) / 2);
      setOffset((o) => ({
        x: Math.min(maxX, Math.max(-maxX, o.x)),
        y: Math.min(maxY, Math.max(-maxY, o.y)),
      }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const apply = () => {
    const img = imgRef.current;
    if (!img) return;
    const { dw, dh } = dims();
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const f = OUT / VIEW;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      ((VIEW - dw) / 2 + offset.x) * f,
      ((VIEW - dh) / 2 + offset.y) * f,
      dw * f,
      dh * f,
    );
    onApply(canvas.toDataURL("image/png"));
  };

  const { dw, dh } = dims();

  return (
    <Modal
      open
      onClose={onCancel}
      size="sm"
      title="调整图片"
      subtitle="拖动图片调整位置，滑块缩放，确认后用于图标"
      footer={
        <>
          <GhostButton onClick={onCancel}>取消</GhostButton>
          <PrimaryButton onClick={apply} disabled={!loaded}>
            确认使用
          </PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div
          ref={boxRef}
          className="relative cursor-move overflow-hidden rounded-2xl border border-white/12 bg-black/40"
          style={{ width: VIEW, height: VIEW, touchAction: "none" }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const nx = drag.current.ox + (e.clientX - drag.current.x);
            const ny = drag.current.oy + (e.clientY - drag.current.y);
            setOffset(clamp({ x: nx, y: ny }));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => (drag.current = null)}
        >
          {!loaded && (
            <span className="absolute inset-0 grid place-items-center text-[12px] text-ink-500">
              加载中…
            </span>
          )}
          <img
            src={src}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: dw,
              height: dh,
              maxWidth: "none",
              maxHeight: "none",
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
          {/* 圆形预览参考线 */}
          <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/15 ring-inset" />
        </div>

        <div className="flex w-full items-center gap-3">
          <ZoomIn size={14} className="flex-none text-ink-400" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => {
              const z = Number(e.target.value);
              setZoom(z);
              setOffset((o) => clamp(o, z));
            }}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/12 accent-[#7c5cff]"
          />
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
            className="glass-soft rounded-lg px-2.5 py-1.5 text-[11.5px] text-ink-300 hover:bg-white/8 hover:text-white"
          >
            重置
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** 图片选择 + 裁切字段 */
export function ImagePickField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropping, setCropping] = useState<string | null>(null);

  return (
    <div>
      <span className="mb-1.5 block text-[12px] font-medium text-ink-300">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={cn(
            "glass-soft flex items-center gap-2 rounded-xl px-3 py-2.5 text-[12.5px] text-ink-200 transition-colors hover:bg-white/8 hover:text-white",
          )}
        >
          <ImageIcon size={14} /> {value ? "更换图片" : "选择图片"}
        </button>
        {value && (
          <>
            <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-white/10">
              <img src={value} alt="" className="h-full w-full object-cover" />
            </span>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="glass-soft grid h-9 w-9 place-items-center rounded-xl text-ink-400 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
              title="移除图片"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
        <span className="text-[11px] text-ink-500">
          {hint ?? "支持 PNG / JPG，可拖动裁切"}
        </span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const reader = new FileReader();
          reader.onload = () => setCropping(String(reader.result));
          reader.readAsDataURL(f);
        }}
      />
      {cropping && (
        <CropModal
          src={cropping}
          onCancel={() => setCropping(null)}
          onApply={(d) => {
            onChange(d);
            setCropping(null);
          }}
        />
      )}
    </div>
  );
}
