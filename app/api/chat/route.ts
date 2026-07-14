import { SYSTEM_PROMPT } from "../../lib/system-prompt";

type ChatMessage = { role: "user" | "assistant"; content: string };
type TeamAvailabilityEvent = {
  type: "TEAM_AVAILABILITY_SELECTED";
  status: "confirmed" | "reschedule";
  selectedTime: string;
  requestedTime: string;
  requestedDate: string;
  service: string;
  customerName: string;
  teamNote: string;
};
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

function textFromEvent(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readTeamAvailabilityEvent(event: unknown): TeamAvailabilityEvent | null {
  if (!event || typeof event !== "object") return null;
  const record = event as Record<string, unknown>;
  const status = record.status === "confirmed" || record.status === "reschedule" ? record.status : null;
  const selectedTime = textFromEvent(record.selectedTime);
  const requestedTime = textFromEvent(record.requestedTime);
  const requestedDate = textFromEvent(record.requestedDate);
  const service = textFromEvent(record.service);
  const customerName = textFromEvent(record.customerName);
  const teamNote = textFromEvent(record.teamNote);

  if (record.type !== "TEAM_AVAILABILITY_SELECTED" || !status || !selectedTime || !requestedTime || !requestedDate || !service || !customerName || !teamNote) {
    return null;
  }

  return { type: "TEAM_AVAILABILITY_SELECTED", status, selectedTime, requestedTime, requestedDate, service, customerName, teamNote };
}

function buildTeamAvailabilityMessage(event: TeamAvailabilityEvent) {
  const customerFirstName = event.customerName.split(/\s+/)[0] || event.customerName;
  const date = event.requestedDate.toLowerCase();

  if (event.status === "confirmed") {
    return `Tudo certo, ${customerFirstName}! A equipe confirmou disponibilidade para ${date} às ${event.selectedTime}. Vou deixar esse horário encaminhado por aqui.`;
  }

  return `${customerFirstName}, conferi com a equipe e o horário disponível escolhido foi ${event.selectedTime}. Esse horário funciona para você?`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { messages?: ChatMessage[]; customerId?: string; event?: unknown };
    const messages = (body.messages ?? []).slice(-30);
    const teamAvailabilityEvent = readTeamAvailabilityEvent(body.event);
    if (!messages.length && !teamAvailabilityEvent) return Response.json({ error: "Mensagem ausente" }, { status: 400 });

    const runtime = ((globalThis as typeof globalThis & { __NEXO_ENV?: RuntimeEnv }).__NEXO_ENV ?? process.env) as RuntimeEnv;
    const customerId = body.customerId ?? "anonymous";
    if (runtime.DB) {
      const createdAt = new Date().toISOString();
      await runtime.DB.prepare("INSERT OR IGNORE INTO customers (id, preferences, updated_at) VALUES (?, '[]', ?)").bind(customerId, createdAt).run();
      if (messages.length) {
        await runtime.DB.prepare("INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)").bind(`active-${customerId}`, "user", messages.at(-1)?.content ?? "", createdAt).run();
      }
    }

    if (teamAvailabilityEvent) {
      const message = buildTeamAvailabilityMessage(teamAvailabilityEvent);
      if (runtime.DB) {
        await runtime.DB.prepare("INSERT INTO messages (conversation_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)")
          .bind(`active-${customerId}`, "assistant", message, JSON.stringify({ intent: "confirmar_horario_equipe", event: teamAvailabilityEvent }), new Date().toISOString()).run();
      }
      return Response.json({
        message,
        meta: {
          intent: "confirmar_horario_equipe",
          confidence: 1,
          handoff: false,
          action: { type: "SCHEDULE_VISIT", payload: { selected_time: teamAvailabilityEvent.selectedTime, requested_time: teamAvailabilityEvent.requestedTime, requested_date: teamAvailabilityEvent.requestedDate, status: teamAvailabilityEvent.status } },
        },
      });
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
