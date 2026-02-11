export default function BrandLogo() {
  return (
    <a href="/" className="group flex items-center gap-sm text-ink">
      <div className="relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-teal to-brand-dark shadow-sm">
        <span className="text-base text-white">✦</span>
        <span className="absolute -bottom-2 -right-2 h-6 w-6 rounded-full bg-brand-yellow/60 blur-md" aria-hidden="true" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-lg font-extrabold tracking-tight text-ink-strong group-hover:text-brand-teal">doWhat</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ink-muted">Discover</span>
      </div>
    </a>
  );
}
