"use client";

import { FormEvent, useMemo, useState } from "react";

type Message = { id: number; role: "user" | "assistant"; text: string; time: string };
type ChatAction = { type?: string; payload?: Record<string, unknown> };
type ChatResponse = { message?: string; meta?: { action?: ChatAction } };
type MeetingStatus = "pending" | "confirmed" | "reschedule";
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
  status: Exclude<MeetingStatus, "pending">;
  selectedTime: string;
  requestedTime: string;
  requestedDate: string;
  service: string;
  customerName: string;
  teamNote: string;
};
type MeetingRequest = {
  id: number;
  customerName: string;
  service: string;
  requestedDate: string;
  requestedTime: string;
  createdAt: string;
  status: MeetingStatus;
  teamNote?: string;
  teamChoice?: string;
};

const initialMessages: Message[] = [
  { id: 1, role: "user", text: "Olá, sou Gabriel da Loja Aurora. A empresa fatura cerca de R$ 180 mil por mês e estamos organizando o caixa para expandir no próximo trimestre.", time: "09:41" },
  { id: 2, role: "assistant", text: "Prazer, Gabriel. Entendi o contexto da Loja Aurora. Posso te ajudar a avaliar crédito PJ, empréstimos, seguros empresariais ou organização financeira. O que você quer priorizar agora?", time: "09:42" },
];

const initialProfile: CustomerProfile = {
  name: "Gabriel",
  company: "Loja Aurora",
  channel: "WhatsApp",
  need: "Organizar o caixa para expansão no próximo trimestre",
  summary: "Cliente empresarial já apresentado. Busca apoio financeiro para expansão.",
  updatedAt: "09:42",
};

const archivedConversations = [
  { initials: "MC", name: "Mariana Costa", subject: "Seguro empresarial", time: "4 min", status: "Aguardando", active: false },
  { initials: "RS", name: "Rafael Souza", subject: "Crédito para capital de giro", time: "12 min", status: "Prioridade", active: false },
  { initials: "LN", name: "Loja Nova Era", subject: "Antecipação de recebíveis", time: "28 min", status: "Novo", active: false },
  { initials: "AC", name: "Ana Clara", subject: "Renovação de apólice", time: "1 h", status: "Resolvido", active: false },
];

function Logo() { return <span className="logoMark">M</span>; }

function readPayloadText(payload: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = payload?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizeMeetingTime(value?: string) {
  if (!value) return undefined;
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

function displayName(profile: CustomerProfile) {
  return profile.name || profile.company || "Cliente";
}

function profileInitials(profile: CustomerProfile) {
  const name = displayName(profile);
  if (name === "Cliente") return "CL";
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "C") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "L")).toUpperCase();
}

function cleanValue(value?: string) {
  return value?.replace(/\s+/g, " ").replace(/[.;,]+$/g, "").trim();
}

function extractName(text: string) {
  const explicit = text.match(/\b(?:me chamo|meu nome (?:é|e)|sou)\s+([^,.;]+)/i)?.[1];
  const raw = cleanValue(explicit);
  if (!raw) return undefined;
  const name = raw.split(/\s+(?:da|de|do|dos|das|e)\s+/i)[0];
  if (/^(cliente|atendente|gerente|respons[aá]vel)$/i.test(name)) return undefined;
  return cleanValue(name);
}

function extractCompany(text: string) {
  const match = text.match(/\b(?:empresa|loja|cl[ií]nica|unidade|sou da|sou do|trabalho na|trabalho no|da empresa|do grupo)\s+([^,.;]+)/i)?.[1];
  return cleanValue(match);
}

function extractEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function extractPhone(text: string) {
  return text.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/)?.[0];
}

function extractLocation(text: string) {
  const match = text.match(/\b(?:em|de|sou de|unidade de)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^,.;]{2,40})/);
  return cleanValue(match?.[1]);
}

function hasNeedSignal(text: string) {
  return /agend|reuni|consult|cr[eé]dito|emprest|seguro|ap[oó]lice|finan|caixa|capital de giro|antecipa|receb[ií]veis|cobertura|or[çc]amento|pre[çc]o|preciso|quero|gostaria|d[úu]vida/i.test(text);
}

function extractNeed(text: string) {
  const match = text.match(/\b(?:quero|preciso|gostaria|tenho|estou com|busco|queria)\b[^.]+/i)?.[0];
  return cleanValue(match) ?? text;
}

function inferServiceName(text: string, fallback?: string) {
  const source = `${text} ${fallback ?? ""}`;
  if (/capital de giro/i.test(source)) return "Crédito para capital de giro";
  if (/antecipa|receb[ií]veis/i.test(source)) return "Antecipação de recebíveis";
  if (/seguro|ap[oó]lice|cobertura/i.test(source)) return "Seguro empresarial";
  if (/emprest/i.test(source)) return "Empréstimo empresarial";
  if (/cr[eé]dito/i.test(source)) return "Crédito PJ";
  if (/caixa|finan|expans[aã]o/i.test(source)) return "Consultoria financeira";
  return fallback && fallback.length < 64 ? fallback : "Consultoria financeira";
}

function deriveCustomerUpdate(text: string, profile: CustomerProfile): Partial<CustomerProfile> {
  const update: Partial<CustomerProfile> = {};
  const name = !profile.name ? extractName(text) : undefined;
  const email = !profile.email ? extractEmail(text) : undefined;
  const phone = !profile.phone ? extractPhone(text) : undefined;
  const company = !profile.company ? extractCompany(text) : undefined;
  const location = !profile.location ? extractLocation(text) : undefined;

  if (name) update.name = name;
  if (email) update.email = email;
  if (phone) update.phone = phone;
  if (company) update.company = company;
  if (location) update.location = location;
  if (hasNeedSignal(text) && text.length > 8) update.need = extractNeed(text);
  return update;
}

function createProfileSummary(profile: CustomerProfile) {
  if (!profile.need && !profile.name && !profile.company) return "Cliente empresarial em atendimento.";
  const who = profile.name ? `${profile.name}${profile.company ? `, ${profile.company}` : ""}` : profile.company ?? "Cliente";
  return `${who}. ${profile.need ? `Necessidade informada: ${profile.need}` : "Dados de contexto em acompanhamento."}`;
}

function createMeetingRequest(text: string, action: ChatAction | undefined, createdAt: string, profile: CustomerProfile): MeetingRequest | null {
  const payload = action?.payload;
  const actionSchedulesVisit = action?.type === "SCHEDULE_VISIT";
  const looksLikeSchedule = /agend|reuni|consult|cr[eé]dito|emprest|seguro|hor[aá]rio|dispon|confirm|amanh/i.test(text);
  if (!actionSchedulesVisit && !looksLikeSchedule) return null;

  const payloadTime = readPayloadText(payload, ["requestedTime", "requested_time", "time", "hora", "horario"]);
  const requestedTime = normalizeMeetingTime(payloadTime) ?? normalizeMeetingTime(text);
  if (!requestedTime && !actionSchedulesVisit) return null;

  return {
    id: Date.now(),
    customerName: displayName(profile),
    service: readPayloadText(payload, ["service", "servico", "subject"]) ?? inferServiceName(text, profile.need),
    requestedDate: readPayloadText(payload, ["requestedDate", "requested_date", "date", "data"]) ?? (/amanh/i.test(text) ? "Amanhã" : "Data a confirmar"),
    requestedTime: requestedTime ?? "a confirmar",
    createdAt,
    status: "pending",
  };
}

function mergeMeetingRequest(current: MeetingRequest | null, next: MeetingRequest) {
  if (!current || current.status !== "pending") return next;
  return { ...current, ...next, id: current.id, status: current.status };
}

function meetingStatusText(status: MeetingStatus) {
  if (status === "confirmed") return "Equipe disponível";
  if (status === "reschedule") return "Novo horário solicitado";
  return "Aguardando equipe";
}

function createTeamAvailabilityEvent(request: MeetingRequest, status: Exclude<MeetingStatus, "pending">, selectedTime: string): TeamAvailabilityEvent {
  const teamNote = status === "confirmed"
    ? `Carla confirmou disponibilidade para ${request.requestedDate.toLowerCase()} às ${selectedTime}.`
    : `A equipe escolheu ${selectedTime} como próximo horário disponível para responder ao cliente.`;

  return {
    type: "TEAM_AVAILABILITY_SELECTED",
    status,
    selectedTime,
    requestedTime: request.requestedTime,
    requestedDate: request.requestedDate,
    service: request.service,
    customerName: request.customerName,
    teamNote,
  };
}

function fallbackTeamAvailabilityMessage(event: TeamAvailabilityEvent) {
  const firstName = event.customerName.split(" ")[0] || event.customerName;
  if (event.status === "confirmed") {
    return `Tudo certo, ${firstName}! A equipe confirmou disponibilidade para ${event.requestedDate.toLowerCase()} às ${event.selectedTime}. Vou deixar esse horário encaminhado por aqui.`;
  }
  return `${firstName}, conferi com a equipe e o horário disponível escolhido foi ${event.selectedTime}. Esse horário funciona para você?`;
}

function createLiveConversation(profile: CustomerProfile, messages: Message[]) {
  return {
    initials: profileInitials(profile),
    name: displayName(profile),
    subject: profile.need || (messages.length ? "Atendimento financeiro" : "Conversa empresarial"),
    time: messages.length ? "Agora" : "Novo",
    status: "Em atendimento",
    active: true,
  };
}

export function AtendimentoApp() {
  const [view, setView] = useState<"customer" | "admin">("customer");
  const [messages, setMessages] = useState(initialMessages);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile>(initialProfile);
  const [customerId] = useState(() => `lead-${Date.now()}`);
  const [meetingRequest, setMeetingRequest] = useState<MeetingRequest | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  function saveCustomerUpdate(profile: CustomerProfile, latestMessage?: string) {
    const event: CustomerProfileEvent = { type: "CUSTOMER_PROFILE_UPDATED", profile, latestMessage };
    void fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, event }),
    }).catch(() => {});
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || loading) return;

    const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const next = [...messages, { id: Date.now(), role: "user" as const, text: value, time: now }];
    const profileUpdate = deriveCustomerUpdate(value, customerProfile);
    const updatedProfile = { ...customerProfile, ...profileUpdate, updatedAt: now };
    const localMeetingRequest = createMeetingRequest(value, undefined, now, updatedProfile);

    setMessages(next);
    setCustomerProfile(updatedProfile);
    setText("");
    setLoading(true);
    if (localMeetingRequest) setMeetingRequest(current => mergeMeetingRequest(current, localMeetingRequest));
    saveCustomerUpdate(updatedProfile, value);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          customerProfile: updatedProfile,
          messages: next.map(m => ({ role: m.role, content: m.text })),
        }),
      });
      const data = await response.json() as ChatResponse;
      const apiMeetingRequest = createMeetingRequest(value, data.meta?.action, now, updatedProfile);
      if (apiMeetingRequest) setMeetingRequest(current => mergeMeetingRequest(current, apiMeetingRequest));
      setMessages(items => [...items, { id: Date.now() + 1, role: "assistant", text: data.message ?? "Vou verificar isso com a equipe da Monetera.", time: now }]);
    } catch {
      setMessages(items => [...items, { id: Date.now() + 1, role: "assistant", text: "Tive um imprevisto por aqui. Pode me mandar sua mensagem mais uma vez?", time: now }]);
    } finally { setLoading(false); }
  }

  async function sendTeamAvailabilityEvent(event: TeamAvailabilityEvent) {
    const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    setMeetingRequest(current => current ? { ...current, status: event.status, teamNote: event.teamNote, teamChoice: event.selectedTime } : current);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          customerProfile,
          event,
          messages: messages.map(m => ({ role: m.role, content: m.text })),
        }),
      });
      const data = await response.json() as ChatResponse;
      setMessages(items => [...items, { id: Date.now() + 1, role: "assistant", text: data.message ?? fallbackTeamAvailabilityMessage(event), time: now }]);
    } catch {
      setMessages(items => [...items, { id: Date.now() + 1, role: "assistant", text: fallbackTeamAvailabilityMessage(event), time: now }]);
    }
  }

  return <main className={`app ${view}`}>
    <div className="viewSwitch" role="group" aria-label="Alternar interface">
      <button className={view === "customer" ? "selected" : ""} onClick={() => setView("customer")}>Visão do cliente</button>
      <button className={view === "admin" ? "selected" : ""} onClick={() => setView("admin")}>Painel da equipe</button>
    </div>
    {view === "customer" ? <CustomerPhone messages={messages} text={text} setText={setText} send={send} loading={loading} /> : <AdminPanel messages={messages} customerProfile={customerProfile} meetingRequest={meetingRequest} onTeamAvailability={sendTeamAvailabilityEvent} />}
  </main>;
}

function CustomerPhone({ messages, text, setText, send, loading }: { messages: Message[]; text: string; setText: (s:string)=>void; send:(e:FormEvent)=>void; loading:boolean }) {
  return <section className="customerStage">
    <div className="phoneShadow" />
    <div className="phone">
      <div className="notch" />
      <div className="statusBar"><span>9:41</span><span className="statusIcons">● ◔ ▰</span></div>
      <header className="chatHeader">
        <button className="iconButton" aria-label="Voltar">‹</button>
        <div className="brandAvatar"><Logo /><i /></div>
        <div className="contact"><strong>Monetera</strong><span>online agora</span></div>
        <button className="iconButton dots" aria-label="Mais opções">•••</button>
      </header>
      <div className="secureNotice"><span>◆</span> Suas informações estão protegidas</div>
      <div className="messages">
        {messages.length > 0 && <div className="dayPill">Hoje</div>}
        {messages.map(message => <div key={message.id} className={`bubbleRow ${message.role}`}>
          <div className="bubble">{message.text}<span className="messageTime">{message.time}{message.role === "user" && "  ✓✓"}</span></div>
        </div>)}
        {loading && <div className="bubbleRow assistant"><div className="bubble typing"><i/><i/><i/></div></div>}
      </div>
      <form className="composer" onSubmit={send}>
        <button type="button" className="attach" aria-label="Anexar">＋</button>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Digite uma mensagem..." aria-label="Mensagem" />
        <button className="send" aria-label="Enviar mensagem" disabled={!text.trim() || loading}>➤</button>
      </form>
      <div className="homeIndicator" />
    </div>
    <div className="customerCopy"><span className="eyebrow">MONETERA EMPRESARIAL</span><h1>Finanças mais claras.<br/><em>Decisões mais seguras.</em></h1><p>Atendimento consultivo para empresas que buscam crédito, empréstimos, seguros e organização financeira.</p><div className="features"><span>● Crédito PJ</span><span>● Seguros empresariais</span><span>● Fluxo de caixa</span></div></div>
  </section>;
}

function AdminPanel({ messages, customerProfile, meetingRequest, onTeamAvailability }: { messages: Message[]; customerProfile: CustomerProfile; meetingRequest: MeetingRequest | null; onTeamAvailability: (event: TeamAvailabilityEvent) => void }) {
  const score = useMemo(() => Math.min(98, 58 + messages.length * 5 + Object.values(customerProfile).filter(Boolean).length * 6), [messages.length, customerProfile]);
  const pendingMeeting = meetingRequest?.status === "pending";
  const liveConversation = createLiveConversation(customerProfile, messages);
  const conversations = [liveConversation, ...archivedConversations];
  const initials = profileInitials(customerProfile);
  const name = displayName(customerProfile);
  const onlineLabel = customerProfile.location ? `Online agora · ${customerProfile.location}` : "Online agora · contexto empresarial";

  return <section className="adminShell">
    {meetingRequest && <AvailabilityPopup request={meetingRequest} onConfirm={() => onTeamAvailability(createTeamAvailabilityEvent(meetingRequest, "confirmed", meetingRequest.requestedTime))} onReschedule={() => onTeamAvailability(createTeamAvailabilityEvent(meetingRequest, "reschedule", "10:00"))} />}
    <aside className="sidebar">
      <div className="sidebarBrand"><Logo/><strong>Monetera</strong></div>
      <nav><span className="navTitle">ESPAÇO DE TRABALHO</span><button>⌂ <span>Visão geral</span></button><button className="active">◉ <span>Atendimentos</span><b>12</b></button><button>♙ <span>Clientes</span></button><button>▣ <span>Base financeira</span></button><span className="navTitle">GESTÃO</span><button>◫ <span>Relatórios</span></button><button>⚙ <span>Configurações</span></button></nav>
      <div className="agentCard"><div className="agentAvatar">CM<i/></div><div><strong>Carla Mendes</strong><span>Consultora</span></div><button>⋮</button></div>
    </aside>
    <div className="adminMain">
      <header className="topbar"><div><h2>Atendimentos</h2><p>Acompanhe conversas financeiras e oportunidades empresariais</p></div><div className="topActions"><button className="searchBtn">⌕ <span>Buscar...</span><kbd>⌘ K</kbd></button><button className={pendingMeeting ? "notification hasMeeting" : "notification"}>♢<i>{pendingMeeting ? 4 : 3}</i></button><button className="newBtn">＋ Novo atendimento</button></div></header>
      <div className="metrics">
        <Metric label="Créditos em análise" value="12" hint="↑ 8% desde ontem" tone="teal" />
        <Metric label="Pendências" value="7" hint="3 aguardam documentos" tone="orange" />
        <Metric label="Propostas hoje" value="48" hint="↑ 12% desde ontem" tone="purple" />
        <Metric label="NPS médio" value="4,8" hint="de 5,0 · 127 avaliações" tone="blue" />
      </div>
      <div className="workspace">
        <div className="inbox">
          <div className="inboxHead"><div className="tabs"><button className="active">Todos <span>24</span></button><button>Meus <span>5</span></button><button>Não atribuídos <span>7</span></button></div><div className="filters"><button>≡ Filtrar</button><button>↕ Mais recentes</button></div></div>
          <div className="conversationList">{conversations.map((c,i)=><article className={c.active?"conversation active":"conversation"} key={`${c.name}-${i}`}><div className={`avatar a${Math.min(i,4)}`}>{c.initials}{i<4&&<i/>}</div><div className="conversationText"><div><strong>{c.name}</strong><time>{c.time}</time></div><p>{c.subject}</p><span className={`tag t${Math.min(i,4)}`}>{c.status}</span></div></article>)}</div>
        </div>
        <div className="conversationDetail">
          <header><div className="avatar a0">{initials}<i/></div><div><strong>{name}</strong><span>{onlineLabel}</span></div><div className="detailActions"><button>☆</button><button>⋮</button><button className="assign">Atribuir a mim</button></div></header>
          <div className="timeline">{messages.length === 0 ? <div className="emptyTimeline">A conversa ainda não começou. As mensagens do cliente aparecerão aqui em tempo real.</div> : <><div className="dayPill">Hoje</div>{messages.map(m=><div key={m.id} className={`detailMessage ${m.role}`}><div className="miniAvatar">{m.role === "assistant" ? "M" : initials}</div><div><span>{m.role === "assistant" ? "Monetera Consultora" : name} · {m.time}</span><p>{m.text}</p></div></div>)}</>}</div>
          <div className="reply"><div><button className="active">Responder</button><button>Nota interna</button></div><textarea placeholder="Digite sua resposta..."/><footer><span>＋　⌕　☺</span><button>Enviar　➤</button></footer></div>
        </div>
        <aside className="customerPanel">
          <div className="profile"><div className="profileAvatar">{initials}</div><h3>{name}</h3><p>{customerProfile.email ?? "E-mail em contexto"}</p><span>{customerProfile.updatedAt ? `Atualizado às ${customerProfile.updatedAt}` : "Cliente empresarial"}</span></div>
          <div className="aiSummary"><div><strong>✦ Resumo inteligente</strong><span>{score}% confiança</span></div><p>{createProfileSummary(customerProfile)}</p><button>Ver histórico completo →</button></div>
          {meetingRequest && <Info title="SOLICITAÇÃO DE AGENDA"><div className="scheduleStatus"><span>{meetingStatusText(meetingRequest.status)}</span><strong>{meetingRequest.requestedDate} · {meetingRequest.teamChoice ?? meetingRequest.requestedTime}</strong><p>{meetingRequest.teamNote ?? "IA aguardando a equipe confirmar disponibilidade."}</p></div></Info>}
          <Info title="INFORMAÇÕES"><p><span>Telefone</span><b>{customerProfile.phone ?? "Em contexto"}</b></p><p><span>Empresa</span><b>{customerProfile.company ?? "Em contexto"}</b></p><p><span>Localização</span><b>{customerProfile.location ?? "Em contexto"}</b></p></Info>
          <Info title="INTERESSES"><div className="chips"><span>{customerProfile.channel ?? "WhatsApp"}</span>{customerProfile.need && <span>{customerProfile.need.slice(0, 28)}</span>}</div></Info>
          <Info title="ATENDIMENTOS ANTERIORES"><div className="history"><i/><p><b>Análise financeira</b><span>Contexto empresarial já informado</span></p></div></Info>
        </aside>
      </div>
    </div>
  </section>;
}

function AvailabilityPopup({ request, onConfirm, onReschedule }: { request: MeetingRequest; onConfirm: () => void; onReschedule: () => void }) {
  const answered = request.status !== "pending";
  const timePhrase = request.requestedTime === "a confirmar" ? "com horário a confirmar" : `às ${request.requestedTime}`;
  const teamChoice = request.teamChoice ?? request.requestedTime;

  return <div className={`availabilityPopup ${request.status}`} role={answered ? "status" : "dialog"} aria-live="polite" aria-label="Notificação de disponibilidade da equipe">
    <div className="availabilityHeader"><span className="aiBadge">IA</span><div><strong>{answered ? meetingStatusText(request.status) : "IA solicitando disponibilidade"}</strong><p>{request.customerName} · {request.createdAt}</p></div></div>
    {answered ? <p>{request.teamNote}</p> : <p>{request.customerName} quer marcar {request.service} para {request.requestedDate.toLowerCase()} {timePhrase}. Quem da equipe está disponível nesse horário?</p>}
    <div className="availabilityMeta"><span>Horário pedido <b>{request.requestedTime}</b></span><span>{answered ? "Escolha da equipe" : "Status"} <b>{answered ? teamChoice : meetingStatusText(request.status)}</b></span></div>
    {!answered && <div className="teamAvailability"><span><b>CM</b> Carla Mendes</span><em>Disponível</em><span><b>RO</b> Renato Oliveira</span><em>Em reunião</em><span><b>LF</b> Luiza Freitas</span><em>Disponível 10:00</em></div>}
    {!answered && <footer><button onClick={onConfirm}>Disponível às {request.requestedTime}</button><button onClick={onReschedule}>Sugerir 10:00</button></footer>}
  </div>;
}

function Metric({label,value,hint,tone}:{label:string;value:string;hint:string;tone:string}) { return <article className="metric"><div className={`metricIcon ${tone}`}>✦</div><div><p>{label}</p><strong>{value}</strong><span>{hint}</span></div></article> }
function Info({title,children}:{title:string;children:React.ReactNode}) { return <section className="info"><h4>{title}</h4>{children}</section> }
