import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const width = size === "sm" ? "max-w-[420px]" : size === "lg" ? "max-w-[720px]" : "max-w-[580px]";
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 py-[8vh] backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className={cn("glass-panel flex max-h-[84vh] w-full flex-col overflow-hidden rounded-[26px]", width)}
            style={{ boxShadow: "0 40px 130px -30px rgba(124,92,255,0.55)" }}
          >
            <div className="flex items-start gap-3 border-b border-white/8 px-5 py-4">
              {icon && <div className="mt-0.5 flex-none">{icon}</div>}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[16px] font-semibold tracking-tight">{title}</h2>
                {subtitle && <p className="mt-0.5 text-[12px] text-ink-400">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="grid h-8 w-8 flex-none place-items-center rounded-lg text-ink-400 transition-colors hover:bg-white/8 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="no-scrollbar flex-1 overflow-y-auto px-5 py-4">{children}</div>

            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-white/8 px-5 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "删除",
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button
            onClick={onCancel}
            className="glass-soft rounded-xl px-4 py-2.5 text-[13px] font-medium text-ink-200 transition-colors hover:bg-white/8"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              "rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition-colors",
              danger ? "bg-rose-500/85 hover:bg-rose-500" : "bg-[#7c5cff] hover:bg-[#6a4bee]",
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-ink-300">{message}</p>
    </Modal>
  );
}

export function GhostButton({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "glass-soft rounded-xl px-4 py-2.5 text-[13px] font-medium text-ink-200 transition-colors hover:bg-white/8 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-xl px-4 py-2.5 text-[13px] font-semibold text-[#0a0a12] transition-transform hover:scale-[1.015] active:scale-[0.99] disabled:opacity-50",
        className,
      )}
      style={{
        background: "linear-gradient(120deg,#c9bdff,#7c5cff 50%,#35e6d0)",
        boxShadow: "0 14px 34px -16px rgba(124,92,255,1)",
      }}
    >
      {children}
    </button>
  );
}
