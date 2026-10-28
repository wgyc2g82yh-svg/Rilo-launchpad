import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RILO — Coming Soon",
  description: "RILO is coming soon.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
