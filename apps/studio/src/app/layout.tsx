import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Archivo, Geist, Geist_Mono, Playfair_Display, Space_Grotesk, Sora } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

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
      className={`${geist.variable} ${geistMono.variable} ${playfair.variable} ${spaceGrotesk.variable} ${sora.variable} ${archivo.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
