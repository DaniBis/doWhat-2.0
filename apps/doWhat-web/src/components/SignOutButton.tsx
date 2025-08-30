// e.g. src/components/SignOutButton.tsx
"use client";

export default function SignOutButton() {
  return (
    <button
      onClick={async () => {
        await fetch("/auth/signout", { method: "POST" });
        window.location.reload(); // or Router refresh
      }}
    >
      Sign out
    </button>
  );
}
