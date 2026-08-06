import type { Metadata } from "next";
import { ThemeInit } from "@/components/ThemeInit";
import "./globals.css";

export const metadata: Metadata = {
  title: "ServiceSync MSP",
  description: "From service agreement to support, billing, and collection.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="servicesync" className="h-full" suppressHydrationWarning>
      <body className="min-h-full bg-base-100 font-sans antialiased text-base-content">
        <ThemeInit />
        {children}
      </body>
    </html>
  );
}
