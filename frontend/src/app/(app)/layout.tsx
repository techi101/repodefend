"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

import { FlowSteps, Icon, Loading, Logo, type IconName } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";

const UserContext = createContext<User | null>(null);
export const useUser = () => useContext(UserContext);

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Repos", icon: "repo" },
  { href: "/progress", label: "Progress", icon: "chart" },
];

const stepFor = (path: string): 1 | 2 | 3 | 4 =>
  path.startsWith("/repos") ? 2 : path.startsWith("/interview") ? 3 : path.startsWith("/progress") ? 4 : 1;

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
      <div className="grid flex-1 place-items-center">
        <Loading label="Checking your session" />
      </div>
    );

  return (
    <UserContext.Provider value={user}>
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link href="/dashboard" aria-label="RepoDefend home"><Logo compact /></Link>
          <nav className="flex gap-0.5 text-sm">
            {NAV.map((n) => {
              const on = pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}
                  className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 sm:px-2.5 ${on ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink"}`}>
                  <Icon name={n.icon} className="h-3.5 w-3.5" /> {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 text-sm sm:gap-3">
            {user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar_url} alt="" className="h-6 w-6 rounded-full border border-line" />
            ) : (
              <span className="grid h-6 w-6 place-items-center rounded-full border border-line bg-surface-2 font-mono text-[11px] uppercase">{user.login.replace("dev-", "")[0]}</span>
            )}
            <span className="hidden font-mono text-xs text-ink-2 sm:inline">{user.login}</span>
            <button onClick={logout} className="whitespace-nowrap text-xs text-muted hover:text-ink">Sign out</button>
          </div>
        </div>
        <div className="border-t border-line bg-surface/40">
          <div className="mx-auto flex h-9 max-w-6xl items-center px-4 sm:px-6">
            <FlowSteps current={stepFor(pathname)} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </UserContext.Provider>
  );
}
