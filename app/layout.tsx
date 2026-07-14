import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monetera Atendimento | Finanças empresariais",
  description: "Atendimento consultivo para empresas com memória de cliente, agenda da equipe e apoio financeiro.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
