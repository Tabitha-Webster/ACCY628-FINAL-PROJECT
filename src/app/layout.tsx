import type { Metadata } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import { ThemeInit } from "@/components/ThemeInit";
import "./globals.css";

const sans = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
});

const serif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ServiceSync MSP",
  description: "From service agreement to support, billing, and collection.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="corporate" className={`${sans.variable} ${serif.variable} h-full`}>
      <body className="min-h-full bg-base-200 font-sans antialiased">
        <ThemeInit />
        {children}
      </body>
    </html>
  );
}
