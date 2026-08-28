"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CarFront, Globe2, LayoutDashboard, LogOut, MessageCircle, Plus, QrCode, Sparkles, UserRound, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { logoutAction } from "@/app/login/actions";

const navigation = [
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
  { href: "/nuevo", label: "Nuevo lead", icon: Plus },
  { href: "/qr", label: "Mi QR", icon: QrCode },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(true);
  const [userMenu, setUserMenu] = useState({ pathname: "", open: false });
  const userMenuRef = useRef<HTMLDivElement>(null);
  const isUserMenuOpen = userMenu.pathname === pathname && userMenu.open;
  const closeUserMenu = () => setUserMenu({ pathname, open: false });

  useEffect(() => {
    const updateOnlineState = () => setIsOnline(window.navigator.onLine);
    updateOnlineState();
    window.addEventListener("online", updateOnlineState);
    window.addEventListener("offline", updateOnlineState);
    return () => {
      window.removeEventListener("online", updateOnlineState);
      window.removeEventListener("offline", updateOnlineState);
    };
  }, []);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !userMenuRef.current?.contains(event.target)) setUserMenu({ pathname, open: false });
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setUserMenu({ pathname, open: false });
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isUserMenuOpen, pathname]);

  return (
    <div className="min-h-[100dvh] bg-[var(--surface)] text-[var(--ink)]">
      <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-[var(--surface)]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/dashboard" className="flex items-center gap-3" aria-label="LeadFlow, ir al resumen">
            <span className="grid size-10 place-items-center rounded-2xl bg-[var(--ink)] text-[var(--lime)] shadow-[0_8px_20px_rgba(16,24,40,0.15)]">
              <Sparkles size={20} strokeWidth={2.4} />
            </span>
            <span>
              <span className="block text-[17px] font-black tracking-[-0.04em]">LeadFlow</span>
              <span className="hidden text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)] sm:block">Vende con impulso</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex" aria-label="Navegación de escritorio">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || (item.href === "/dashboard" && pathname === "/");
              return <Link key={item.href} href={item.href} className={active ? "flex items-center gap-1.5 rounded-xl bg-[var(--ink)] px-2.5 py-2 text-xs font-black text-[var(--lime)]" : "flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-black text-[var(--muted)] transition hover:bg-black/[0.04]"}><Icon size={15} />{item.label}</Link>;
            })}
          </nav>

          <div className="flex items-center gap-3">
            <div title={isOnline ? "Internet disponible, ya sea por Wi-Fi o por cable" : "El navegador no detecta conexión a internet"} className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold ${isOnline ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
              {isOnline ? <Globe2 size={14} /> : <WifiOff size={14} />}
              <span className="hidden sm:inline">{isOnline ? "En línea" : "Modo offline"}</span>
            </div>
            <div ref={userMenuRef} className="relative">
              <button type="button" aria-label="Abrir menú de usuario" title="Menú de usuario" aria-haspopup="menu" aria-expanded={isUserMenuOpen} onClick={() => setUserMenu({ pathname, open: !isUserMenuOpen })} className={`grid size-10 place-items-center rounded-full text-[var(--ink)] transition ${isUserMenuOpen ? "bg-[var(--ink)] text-[var(--lime)]" : "bg-[#e7dfd1] hover:bg-[#dcd0bd]"}`}><UserRound size={17} /></button>
              {isUserMenuOpen ? <div role="menu" aria-label="Menú de usuario" className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-56 rounded-2xl border border-black/[0.08] bg-white p-2 shadow-[0_18px_50px_rgba(16,24,40,0.16)]">
                <Link role="menuitem" href="/catalogo" onClick={closeUserMenu} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-black text-[var(--ink)] transition hover:bg-[#f6f3ed]"><CarFront size={16} />Catálogo de autos</Link>
                <Link role="menuitem" href="/push-diagnostics" onClick={closeUserMenu} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-black text-[var(--ink)] transition hover:bg-[#f6f3ed]"><Activity size={16} />Push Diagnostics</Link>
                <div className="my-1 border-t border-black/[0.06]" />
                <form action={logoutAction}>
                  <button role="menuitem" type="submit" onClick={closeUserMenu} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-black text-[var(--ink)] transition hover:bg-[#f6f3ed]"><LogOut size={16} />Cerrar sesión</button>
                </form>
                <button type="button" aria-label="Cerrar menú de usuario" onClick={closeUserMenu} className="absolute right-2 top-2 grid size-7 place-items-center rounded-lg text-[var(--muted)] hover:bg-[#f6f3ed] sm:hidden"><X size={14} /></button>
              </div> : null}
            </div>
          </div>
        </div>
      </header>

      <main className="mobile-app-main mx-auto min-h-[calc(100dvh-73px)] max-w-7xl px-5 pb-28 pt-7 sm:px-8 sm:pb-12 sm:pt-10">
        {children}
      </main>

      <nav className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-black/[0.06] bg-[var(--surface)]/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_32px_rgba(16,24,40,0.06)] backdrop-blur-xl sm:hidden" aria-label="Navegación principal">
        <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href === "/dashboard" && pathname === "/");
            return (
              <Link key={item.href} href={item.href} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-bold transition ${active ? "bg-[var(--ink)] text-[var(--lime)]" : "text-[var(--muted)] hover:bg-black/[0.04]"}`}>
                <Icon size={19} strokeWidth={active ? 2.5 : 2} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <Link href="/nuevo" aria-label="Agregar nuevo lead" title="Agregar nuevo lead" className="fixed bottom-6 right-6 z-30 hidden items-center gap-2 rounded-full bg-[var(--lime)] px-4 py-3 text-xs font-black text-[var(--ink)] shadow-[0_12px_30px_rgba(16,24,40,0.18)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(16,24,40,0.22)] sm:flex">
        <Plus size={17} />Nuevo lead
      </Link>
    </div>
  );
}
