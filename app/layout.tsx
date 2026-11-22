import type { Metadata } from "next";
import "./globals.css";
import "./app.css";
import "./integrations.css";
import "./brand.css";
import "./brand-integration.css";
import "./launch-polish.css";

export const metadata: Metadata = {
  title: "RILO — Launch Intelligence",
  description: "Explore Solana tokens and analyze any contract address with RILO. Inspect token controls, supply distribution, and public wallet evidence.",
  metadataBase: new URL("https://riloprotocol.xyz"),
  applicationName: "RILO Protocol",
  openGraph: {
    title: "RILO — Launch Intelligence",
    description: "Paste a Solana CA. Explore the market. Inspect the evidence.",
    siteName: "RILO Protocol",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "RILO — Launch Intelligence",
    description: "Explore Solana tokens, wallet connections, and on-chain signals.",
    creator: "@RiloProtocol",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
