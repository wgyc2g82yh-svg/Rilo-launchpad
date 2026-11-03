import type { Metadata } from "next";
import "./globals.css";
import "./app.css";
import "./integrations.css";
import "./brand.css";
import "./brand-integration.css";

export const metadata: Metadata = {
  title: "RILO — Launch Intelligence",
  description: "RILO launch intelligence. On-chain markets, token launches, and wallet evidence on Solana.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
