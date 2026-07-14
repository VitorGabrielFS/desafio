import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexo Atendimento | Conversas que conectam",
  description: "Atendimento comercial humanizado com inteligência generativa e memória de clientes.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
