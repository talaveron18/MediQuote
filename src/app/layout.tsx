import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "MediQuote Pro — Presupuestos Sanitarios",
  description: "Herramienta interna de presupuestación sanitaria. Instancia GASI bajo licencia habilitada de MediQuote Pro.",
  icons: {
    icon: "/branding/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className="antialiased bg-background text-foreground"
      >
        {children}
        <Toaster />
        <SonnerToaster />
      </body>
    </html>
  );
}
