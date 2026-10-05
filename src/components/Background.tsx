export function Background() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-[#07070c]">
      {/* Aurora blobs */}
      <div
        className="animate-drift absolute -top-[22%] -left-[12%] h-[62vw] w-[62vw] rounded-full opacity-[0.55] blur-[120px]"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(124,92,255,0.85), rgba(77,107,254,0.35) 45%, transparent 70%)",
        }}
      />
      <div
        className="animate-float absolute top-[8%] right-[-14%] h-[54vw] w-[54vw] rounded-full opacity-[0.5] blur-[130px]"
        style={{
          background:
            "radial-gradient(circle at 60% 40%, rgba(53,230,208,0.65), rgba(14,165,233,0.3) 45%, transparent 70%)",
        }}
      />
      <div
        className="animate-drift absolute bottom-[-28%] left-[24%] h-[58vw] w-[58vw] rounded-full opacity-[0.4] blur-[140px]"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,92,157,0.55), rgba(168,85,247,0.28) 45%, transparent 72%)",
        }}
      />

      {/* Fine grid */}
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 90% 80% at 50% 30%, #000 20%, transparent 85%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 80% at 50% 30%, #000 20%, transparent 85%)",
        }}
      />

      {/* Vignette + top sheen */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 90% at 50% -10%, rgba(255,255,255,0.06), transparent 55%), radial-gradient(ellipse 100% 100% at 50% 120%, rgba(0,0,0,0.75), transparent 60%)",
        }}
      />
    </div>
  );
}
