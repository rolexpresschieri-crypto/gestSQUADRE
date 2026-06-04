import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "gestSQUADRE TOC",
  description: "Tactical Operations Center — gestSQUADRE",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
