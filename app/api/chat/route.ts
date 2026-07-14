import { SYSTEM_PROMPT } from "../../lib/system-prompt";

type ChatMessage = { role: "user" | "assistant"; content: string };
type RuntimeEnv = { GROQ_API_KEY?: string; DB?: D1Database };

const knowledge = `A Nexo Serviços realiza instalação, manutenção preventiva e corretiva de equipamentos comerciais. Atendimento: segunda a sexta, 8h às 18h. Visitas são confirmadas após análise de disponibilidade. Orçamentos são personalizados e não há autorização para prometer descontos.`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { messages?: ChatMessage[]; customerId?: string };
    const messages = (body.messages ?? []).slice(-30);
    if (!messages.length) return Response.json({ error: "Mensagem ausente" }, { status: 400 });

    const runtime = ((globalThis as typeof globalThis & { __NEXO_ENV?: RuntimeEnv }).__NEXO_ENV ?? process.env) as RuntimeEnv;
    const customerId = body.customerId ?? "anonymous";
    if (runtime.DB) {
      await runtime.DB.batch([
        runtime.DB.prepare("INSERT OR IGNORE INTO customers (id, preferences, updated_at) VALUES (?, '[]', ?)").bind(customerId, new Date().toISOString()),
        runtime.DB.prepare("INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)").bind(`active-${customerId}`, "user", messages.at(-1)?.content ?? "", new Date().toISOString()),
      ]);
    }
    if (!runtime.GROQ_API_KEY) {
      return Response.json({
        message: "Claro! Me conta um pouquinho do que você precisa e eu te ajudo por aqui.",
        demo: true,
        meta: { intent: "iniciar_atendimento", confidence: 1, handoff: false },
      });
    }

    const customerMemory = "Cliente recorrente: João Almeida, unidade Campinas. Último assunto: manutenção preventiva dos equipamentos. Prefere visitas pela manhã.";
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${runtime.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.72,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: `BASE DE CONHECIMENTO:\n${knowledge}\n\nMEMÓRIA DO CLIENTE:\n${customerMemory}` },
          ...messages,
        ],
      }),
    });
    if (!response.ok) throw new Error(`Groq respondeu ${response.status}`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    if (runtime.DB) {
      await runtime.DB.prepare("INSERT INTO messages (conversation_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(`active-${customerId}`, "assistant", parsed.message ?? "", JSON.stringify({ intent: parsed.intent, handoff: parsed.handoff, action: parsed.action }), new Date().toISOString()).run();
    }
    return Response.json({
      message: parsed.message ?? "Vou verificar isso para você.",
      meta: { intent: parsed.intent, confidence: parsed.confidence, handoff: parsed.handoff, action: parsed.action },
    });
  } catch (error) {
    console.error(error);
    return Response.json({ message: "Tive um imprevisto por aqui. Pode me mandar sua mensagem mais uma vez?" }, { status: 500 });
  }
}
