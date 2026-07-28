import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LeadFlow · Vende con impulso",
    template: "%s · LeadFlow",
  },
  description: "Captura prospectos en segundos, prioriza oportunidades y llega a cada seguimiento con contexto.",
  applicationName: "LeadFlow",
  keywords: ["ventas", "leads", "automotriz", "CRM", "prospectos"],
  manifest: "/manifest.json",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full"><AppShell>{children}</AppShell></body>
    </html>
  );
}
