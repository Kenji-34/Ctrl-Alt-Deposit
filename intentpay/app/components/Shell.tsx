import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./ui";

const TABS = [
  { href: "/", label: "Home", icon: "house" },
  { href: "/agent", label: "Cards", icon: "credit-card" },
  { href: "/agent/new", label: "Payments", icon: "dollar-sign" },
  { href: "/more", label: "More", icon: "more-horiz" },
];

function TabBar({ active }: { active: string }) {
  return (
    <nav className="fixed bottom-0 left-1/2 flex w-full max-w-[430px] -translate-x-1/2 justify-around border-t border-gray-200 bg-white pb-3 pt-2">
      {TABS.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className={`flex w-16 flex-col items-center gap-0.5 text-[11px] ${active === t.label ? "text-text-primary" : "text-gray-600"}`}
        >
          <Icon name={t.icon} size={22} />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-white shadow-sm">{children}</div>;
}

/** Inner screen: back arrow, centred Westpac logo, then content. */
export function Shell({ children, back, tab = "Cards" }: { title?: string; back?: string; tab?: string; children: ReactNode }) {
  return (
    <Frame>
      <header className="relative flex items-center justify-center bg-white px-4 py-4">
        {back && (
          <Link href={back} aria-label="Back" className="absolute left-4 text-gray-900">
            <Icon name="arrow-left" size={22} />
          </Link>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/wbc-logo.svg" alt="Westpac" className="h-7 w-auto" />
      </header>
      <main className="flex-1 space-y-4 bg-white px-4 pb-28 pt-2">{children}</main>
      <TabBar active={tab} />
    </Frame>
  );
}

/** Home screen: red banner with greeting and search, then content on a rounded sheet. */
export function HomeShell({ children }: { children: ReactNode }) {
  return (
    <Frame>
      <header
        className="px-4 pb-12 pt-4 text-white"
        style={{ background: "url(/brand/banner.svg) left top / cover no-repeat, #da1710" }}
      >
        <div className="flex justify-end gap-2">
          <span className="flex items-center gap-1 rounded-full border border-white/70 px-3 py-1 text-xs">
            <Icon name="headset" size={14} /> Contact us
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/70">
            <Icon name="person" size={14} />
          </span>
        </div>
        <h1 className="mt-10 max-w-[300px] text-lg font-bold uppercase leading-snug">How can we help you this afternoon?</h1>
        <div className="mt-4 flex items-center gap-2 rounded-md bg-white px-3 py-3 text-sm text-gray-500">
          <Icon name="search" size={18} /> Search
        </div>
      </header>
      <main className="-mt-6 flex-1 space-y-4 rounded-t-3xl bg-gray-50 px-4 pb-28 pt-5">{children}</main>
      <TabBar active="Home" />
    </Frame>
  );
}
