import { SYSTEM_PROMPT } from "../../lib/system-prompt";

type ChatMessage = { role: "user" | "assistant"; content: string };
type CustomerProfile = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  location?: string;
  need?: string;
  channel?: string;
  summary?: string;
  updatedAt?: string;
};
type CustomerProfileEvent = {
  type: "CUSTOMER_PROFILE_UPDATED";
  profile: CustomerProfile;
  latestMessage?: string;
};
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
  const matches = value.matchAll(/\b(?:as|às|a|para)\s*(\d{1,2})(?:[:h]\s*(\d{2}))?\s*(?:h|horas)?\b|\b(\d{1,2})(?:[:h]\s*(\d{2}))\s*(?:h|horas)?\b|\b(\d{1,2})\s*(?:h|horas)\b/gi);

  for (const match of matches) {
    const hour = Number(match[1] ?? match[3] ?? match[5]);
    const minuteText = match[2] ?? match[4];
    const minute = minuteText ? Number(minuteText) : 0;
    if (!Number.isFinite(hour) || hour < 6 || hour > 22) continue;
    if (!Number.isFinite(minute) || minute < 0 || minute > 59) continue;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  return undefined;
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

function readCustomerProfileEvent(event: unknown): CustomerProfileEvent | null {
  if (!event || typeof event !== "object") return null;
  const record = event as Record<string, unknown>;
  if (record.type !== "CUSTOMER_PROFILE_UPDATED" || !record.profile || typeof record.profile !== "object") return null;

  const rawProfile = record.profile as Record<string, unknown>;
  const profile: CustomerProfile = {};
  for (const key of ["name", "email", "phone", "company", "location", "need", "channel", "summary", "updatedAt"] as const) {
    const value = rawProfile[key];
    if (typeof value === "string" && value.trim()) profile[key] = value.trim();
  }

  return { type: "CUSTOMER_PROFILE_UPDATED", profile, latestMessage: textFromEvent(record.latestMessage) ?? undefined };
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

function createCustomerSummary(profile?: CustomerProfile) {
  if (!profile) return "Cliente novo em atendimento.";
  const who = profile.name ? `${profile.name}${profile.company ? `, ${profile.company}` : ""}` : profile.company ?? "Cliente novo";
  return `${who}. ${profile.need ? `Necessidade: ${profile.need}` : "Dados iniciais em coleta."}`;
}

function createCustomerMemory(profile?: CustomerProfile) {
  if (!profile) return "Cliente novo. Colete nome, empresa, contato e necessidade antes de avançar ações.";
  return [
    profile.name ? `Nome: ${profile.name}` : "Nome ainda não informado",
    profile.company ? `Empresa: ${profile.company}` : null,
    profile.phone ? `Telefone: ${profile.phone}` : null,
    profile.email ? `Email: ${profile.email}` : null,
    profile.location ? `Localização: ${profile.location}` : null,
    profile.need ? `Necessidade atual: ${profile.need}` : "Necessidade ainda em descoberta",
  ].filter(Boolean).join(". ");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { messages?: ChatMessage[]; customerId?: string; customerProfile?: CustomerProfile; event?: unknown };
    const messages = (body.messages ?? []).slice(-30);
    const customerProfileEvent = readCustomerProfileEvent(body.event);
    const teamAvailabilityEvent = readTeamAvailabilityEvent(body.event);
    if (!messages.length && !teamAvailabilityEvent && !customerProfileEvent) return Response.json({ error: "Mensagem ausente" }, { status: 400 });

    const runtime = ((globalThis as typeof globalThis & { __NEXO_ENV?: RuntimeEnv }).__NEXO_ENV ?? process.env) as RuntimeEnv;
    const customerId = body.customerId ?? "anonymous";
    if (runtime.DB) {
      const createdAt = new Date().toISOString();
      await runtime.DB.prepare("INSERT OR IGNORE INTO customers (id, preferences, updated_at) VALUES (?, '[]', ?)").bind(customerId, createdAt).run();
      if (messages.length) {
        await runtime.DB.prepare("INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)").bind(`active-${customerId}`, "user", messages.at(-1)?.content ?? "", createdAt).run();
      }
    }

    if (customerProfileEvent) {
      const profile = customerProfileEvent.profile;
      const summary = createCustomerSummary(profile);
      if (runtime.DB) {
        const updatedAt = new Date().toISOString();
        await runtime.DB.batch([
          runtime.DB.prepare("INSERT OR IGNORE INTO conversations (id, customer_id, status, created_at, updated_at) VALUES (?, ?, 'open', ?, ?)")
            .bind(`active-${customerId}`, customerId, updatedAt, updatedAt),
          runtime.DB.prepare(`
            INSERT INTO customers (id, name, email, phone, preferences, summary, last_service, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              email = excluded.email,
              phone = excluded.phone,
              preferences = excluded.preferences,
              summary = excluded.summary,
              last_service = excluded.last_service,
              updated_at = excluded.updated_at
          `).bind(
            customerId,
            profile.name ?? null,
            profile.email ?? null,
            profile.phone ?? null,
            JSON.stringify({ company: profile.company, location: profile.location, channel: profile.channel }),
            summary,
            profile.need ?? null,
            updatedAt,
          ),
          runtime.DB.prepare("INSERT INTO messages (conversation_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)")
            .bind(`active-${customerId}`, "system", customerProfileEvent.latestMessage ?? "Atualização do perfil do cliente", JSON.stringify({ event: customerProfileEvent.type, profile }), updatedAt),
        ]);
      }
      return Response.json({
        ok: true,
        meta: { intent: "atualizar_perfil_cliente", confidence: 1, handoff: false, customer_updates: profile },
      });
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

    const customerMemory = createCustomerMemory(body.customerProfile);
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
