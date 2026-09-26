"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

import { Logo, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";

const UserContext = createContext<User | null>(null);
export const useUser = () => useContext(UserContext);

const NAV = [
  { href: "/dashboard", label: "Repos" },
  { href: "/progress", label: "Progress" },
];

// Every page in this group needs a signed-in user. Checking once here keeps
// each page free of auth code; the backend still enforces it on every request.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    api<User>("/me")
      .then(setUser)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/");
      });
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/");
  }

  if (!user)
    return (
      <div className="grid flex-1 place-items-center text-muted">
        <Spinner />
      </div>
    );

  return (
    <UserContext.Provider value={user}>
      <header className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:gap-6">
          <Link href="/dashboard" aria-label="RepoDefend home"><Logo compact /></Link>
          <nav className="flex gap-0.5 text-sm sm:gap-1">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href}
                className={`rounded-md px-2 py-1.5 sm:px-3 ${pathname.startsWith(n.href) ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 text-sm sm:gap-3">
            {user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full" />
            ) : (
              <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-xs uppercase">{user.login.replace("dev-", "")[0]}</span>
            )}
            <span className="hidden text-ink-2 sm:inline">{user.login}</span>
            <button onClick={logout} className="whitespace-nowrap text-muted hover:text-ink">Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </UserContext.Provider>
  );
}
