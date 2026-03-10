import Image from 'next/image';

export default function BrandLogo() {
  return (
    <a href="/" className="group flex items-center gap-sm text-ink">
      <span className="relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-2xl border border-white/60 bg-white shadow-sm">
        <Image
          src="/logo.png"
          alt="doWhat logo"
          width={36}
          height={36}
          className="h-full w-full object-cover"
          priority
        />
      </span>
      <div className="flex flex-col leading-none">
        <span className="text-lg font-extrabold tracking-tight text-ink-strong group-hover:text-brand-teal">doWhat</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-ink-muted">Discover</span>
      </div>
    </a>
  );
}
