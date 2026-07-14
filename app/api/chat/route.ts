import { SYSTEM_PROMPT } from "../../lib/system-prompt";

type ChatMessage = { role: "user" | "assistant"; content: string };
type RuntimeEnv = { GROQ_API_KEY?: string; DB?: D1Database };

const knowledge = `A Nexo Serviços realiza instalação, manutenção preventiva e corretiva de equipamentos comerciais. Atendimento: segunda a sexta, 8h às 18h. Visitas são confirmadas após análise de disponibilidade. Orçamentos são personalizados e não há autorização para prometer descontos.`;

function normalizeMeetingTime(value: string) {
  const match = value.match(/(?:\b(?:as|às|a|para)\s*)?(\d{1,2})(?:[:h]\s*(\d{2}))?\s*(?:h|horas)?\b/i);
  if (!match) return undefined;
  const hour = Number(match[1]);
  if (!Number.isFinite(hour) || hour < 6 || hour > 22) return undefined;
  const minute = match[2] ? Number(match[2]) : 0;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function createDemoScheduleAction(content: string) {
  const looksLikeSchedule = /agend|reuni|visita|manuten|hor[aá]rio|dispon|confirm|amanh/i.test(content);
  const requestedTime = normalizeMeetingTime(content);
  if (!looksLikeSchedule || !requestedTime) return null;

  return {
    type: "SCHEDULE_VISIT",
    payload: {
      requested_time: requestedTime,
      requested_date: /amanh/i.test(content) ? "Amanhã" : "Data a confirmar",
      service: "Manutenção preventiva",
    },
  };
}

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
      const demoAction = createDemoScheduleAction(messages.at(-1)?.content ?? "");
      if (demoAction) {
        return Response.json({
          message: `Perfeito, vou consultar a disponibilidade da equipe para ${demoAction.payload.requested_date.toLowerCase()} às ${demoAction.payload.requested_time} e já te retorno com a confirmação.`,
          demo: true,
          meta: { intent: "agendar_visita", confidence: 0.95, handoff: false, action: demoAction },
        });
      }

      return Response.json({
        message: "Claro! Me conta um pouquinho do que você precisa e eu te ajudo por aqui.",
        demo: true,
        meta: { intent: "iniciar_atendimento", confidence: 1, handoff: false, action: { type: "NONE", payload: {} } },
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
