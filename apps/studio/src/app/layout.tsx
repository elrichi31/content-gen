import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Archivo, Geist, Geist_Mono, Inter, Playfair_Display, Space_Grotesk, Sora } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Interfaz en Inter, como BethaSpend. Geist y las demás quedan para el contenido de los carruseles.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space" });
const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });
// Solo para el contenido de los anuncios (titular condensado, eje de ancho); no para la interfaz.
const archivo = Archivo({ subsets: ["latin", "latin-ext"], axes: ["wdth"], variable: "--font-ad" });

export const metadata: Metadata = {
  title: "Content Gen",
  description: "Estudio unificado para contenido generado con IA.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${geist.variable} ${geistMono.variable} ${playfair.variable} ${spaceGrotesk.variable} ${sora.variable} ${archivo.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        {/* Aplica el sidebar colapsado antes de hidratar: sin esto, el contenido salta al cargar. */}
        <Script id="sidebar-state" strategy="beforeInteractive">{`try{if(localStorage.getItem("sidebar-collapsed")==="1")document.documentElement.classList.add("sidebar-collapsed")}catch(e){}`}</Script>
        <ThemeProvider>
          {children}
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
