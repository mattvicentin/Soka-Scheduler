import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Soka Academic Scheduling",
  description: "Faculty teaching preferences and schedule management",
  icons: {
    icon: "/logos/Soka_symbol.png",
    apple: "/logos/Soka_symbol.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-white font-sans text-base antialiased text-soka-body">
        {children}
      </body>
    </html>
  );
}
