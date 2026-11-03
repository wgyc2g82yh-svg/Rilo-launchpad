import type { Metadata } from "next";
import { RiloApp } from "@/components/rilo-app";

export const metadata: Metadata = { title: "RILO — Launch Intelligence", description: "Inspect token authorities and supply distribution with transparent coverage on Solana." };

export default function AppPage() { return <RiloApp />; }
