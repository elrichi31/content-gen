import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono, Playfair_Display, Space_Grotesk, Sora } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });

export const metadata: Metadata = {
  title: "Content Gen",
  description: "Estudio unificado para contenido generado con IA.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${geist.variable} ${geistMono.variable} ${playfair.variable} ${spaceGrotesk.variable} ${sora.variable}`}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
