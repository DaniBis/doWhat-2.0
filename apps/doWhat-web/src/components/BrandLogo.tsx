export default function BrandLogo() {
  return (
    <a href="/" className="flex items-center gap-2 text-white">
      {/* If public/logo.png exists it will render; otherwise the box still reserves space */}
      <img
        src="/logo.png"
        alt="doWhat"
        className="h-8 w-8 rounded-full object-cover bg-amber-400"
        onError={(e) => {
          // fallback: render an emoji over brand yellow background
          const el = e.currentTarget as HTMLImageElement;
          el.style.display = 'none';
          const span = document.createElement('span');
          span.className = 'inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-400';
          span.textContent = '📍';
          el.parentElement?.insertBefore(span, el);
        }}
      />
      <span className="font-extrabold tracking-tight">doWhat</span>
    </a>
  );
}
