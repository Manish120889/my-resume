import type { Metadata, Viewport } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const cinzel = Cinzel({ subsets: ["latin"], variable: "--font-cinzel", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://surreyaiautomation.online"),
  title: "Loka-Vidyā — The Fourteen Realms",
  description: "An interactive journey through the fourteen Lokas of Hindu cosmology.",
  openGraph: { title: "Loka-Vidyā", description: "Explore the fourteen cosmic realms.", images: ["/loka-vidya/media/cosmic-map.png"] },
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { themeColor: "#02040d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${inter.variable} ${cinzel.variable}`}><body>{children}</body></html>;
}
