import type { Metadata } from "next";
import Script from "next/script";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
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
    <html
      lang="en"
      data-theme="corporate"
      className={`${sans.variable} ${serif.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-base-200 font-sans antialiased">
        {children}
        <Script id="servicesync-theme" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("servicesync-theme");document.documentElement.setAttribute("data-theme",t||"corporate");}catch(e){}`}
        </Script>
      </body>
    </html>
  );
}
