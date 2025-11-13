import Link from "next/link";

export default function AdminNav({ current }: { current?: string }) {
  const links = [
    { href: "/admin/new", label: "New Session" },
    { href: "/admin/sessions", label: "Sessions" },
    { href: "/admin/activities", label: "Activities" },
    { href: "/admin/venues", label: "Venues" },
  ];

  return (
    <nav className="mb-4 flex gap-3 border-b pb-2 text-sm">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={
            current === link.href
              ? "font-semibold text-brand-teal"
              : "text-gray-600 hover:text-brand-teal"
          }
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
