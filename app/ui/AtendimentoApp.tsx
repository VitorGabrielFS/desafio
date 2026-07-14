"use client";

import { FormEvent, useMemo, useState } from "react";

type Message = { id: number; role: "user" | "assistant"; text: string; time: string };
type ChatAction = { type?: string; payload?: Record<string, unknown> };
type ChatResponse = { message?: string; meta?: { action?: ChatAction } };
type MeetingStatus = "pending" | "confirmed" | "reschedule";
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

const conversations = [
  { initials: "JA", name: "João Almeida", subject: "Agendamento de manutenção", time: "Agora", status: "Em atendimento", active: true },
  { initials: "MC", name: "Mariana Costa", subject: "Dúvida sobre orçamento", time: "4 min", status: "Aguardando", active: false },
  { initials: "RS", name: "Rafael Souza", subject: "Equipamento com falha", time: "12 min", status: "Prioridade", active: false },
  { initials: "LN", name: "Loja Nova Era", subject: "Proposta comercial", time: "28 min", status: "Novo", active: false },
  { initials: "AC", name: "Ana Clara", subject: "Alteração de visita", time: "1 h", status: "Resolvido", active: false },
];

const initialMessages: Message[] = [
  { id: 1, role: "assistant", text: "Olá, João! Que bom falar com você novamente. Vi que da última vez conversamos sobre a manutenção dos equipamentos da unidade de Campinas. Como posso ajudar hoje?", time: "09:41" },
  { id: 2, role: "user", text: "Oi! Queria agendar a manutenção para amanhã de manhã.", time: "09:42" },
  { id: 3, role: "assistant", text: "Claro! Amanhã de manhã funciona bem para você entre 9h e 11h? Assim já verifico essa janela com a equipe técnica.", time: "09:42" },
];

function Logo() { return <span className="logoMark">N</span>; }

function readPayloadText(payload: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = payload?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizeMeetingTime(value?: string) {
  if (!value) return undefined;
  const match = value.match(/(?:\b(?:as|às|a|para)\s*)?(\d{1,2})(?:[:h]\s*(\d{2}))?\s*(?:h|horas)?\b/i);
  if (!match) return undefined;
  const hour = Number(match[1]);
  if (!Number.isFinite(hour) || hour < 6 || hour > 22) return undefined;
  const minute = match[2] ? Number(match[2]) : 0;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function createMeetingRequest(text: string, action: ChatAction | undefined, createdAt: string): MeetingRequest | null {
  const payload = action?.payload;
  const actionSchedulesVisit = action?.type === "SCHEDULE_VISIT";
  const looksLikeSchedule = /agend|reuni|visita|manuten|hor[aá]rio|dispon|confirm|amanh/i.test(text);
  if (!actionSchedulesVisit && !looksLikeSchedule) return null;

  const payloadTime = readPayloadText(payload, ["requestedTime", "requested_time", "time", "hora", "horario"]);
  const requestedTime = normalizeMeetingTime(payloadTime) ?? normalizeMeetingTime(text);
  if (!requestedTime && !actionSchedulesVisit) return null;

  return {
    id: Date.now(),
    customerName: "João Almeida",
    service: readPayloadText(payload, ["service", "servico", "subject"]) ?? "Manutenção preventiva",
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
  const customerFirstName = event.customerName.split(" ")[0] || event.customerName;
  if (event.status === "confirmed") {
    return `Tudo certo, ${customerFirstName}! A equipe confirmou disponibilidade para ${event.requestedDate.toLowerCase()} às ${event.selectedTime}. Vou deixar esse horário encaminhado por aqui.`;
  }
  return `${customerFirstName}, conferi com a equipe e o horário disponível escolhido foi ${event.selectedTime}. Esse horário funciona para você?`;
}

export function AtendimentoApp() {
  const [view, setView] = useState<"customer" | "admin">("customer");
  const [messages, setMessages] = useState(initialMessages);
  const [meetingRequest, setMeetingRequest] = useState<MeetingRequest | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || loading) return;
    const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const next = [...messages, { id: Date.now(), role: "user" as const, text: value, time: now }];
    setMessages(next); setText(""); setLoading(true);
    const localMeetingRequest = createMeetingRequest(value, undefined, now);
    if (localMeetingRequest) setMeetingRequest(current => mergeMeetingRequest(current, localMeetingRequest));
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: "joao-almeida", messages: next.map(m => ({ role: m.role, content: m.text })) }) });
      const data = await response.json() as ChatResponse;
      const apiMeetingRequest = createMeetingRequest(value, data.meta?.action, now);
      if (apiMeetingRequest) setMeetingRequest(current => mergeMeetingRequest(current, apiMeetingRequest));
      setMessages(items => [...items, { id: Date.now() + 1, role: "assistant", text: data.message ?? "Vou verificar isso para você.", time: now }]);
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
          customerId: "joao-almeida",
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
    {view === "customer" ? <CustomerPhone messages={messages} text={text} setText={setText} send={send} loading={loading} /> : <AdminPanel messages={messages} meetingRequest={meetingRequest} onTeamAvailability={sendTeamAvailabilityEvent} />}
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
        <div className="contact"><strong>Nexo Serviços</strong><span>online agora</span></div>
        <button className="iconButton dots" aria-label="Mais opções">•••</button>
      </header>
      <div className="secureNotice"><span>◆</span> Suas informações estão protegidas</div>
      <div className="messages">
        <div className="dayPill">Hoje</div>
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
    <div className="customerCopy"><span className="eyebrow">ATENDIMENTO QUE CONECTA</span><h1>Conversas mais humanas.<br/><em>Relações mais fortes.</em></h1><p>Uma experiência fluida e personalizada, com memória do que realmente importa para cada cliente.</p><div className="features"><span>● Contexto preservado</span><span>● Disponível 24 horas</span><span>● Transição inteligente</span></div></div>
  </section>;
}

function AdminPanel({ messages, meetingRequest, onTeamAvailability }: { messages: Message[]; meetingRequest: MeetingRequest | null; onTeamAvailability: (event: TeamAvailabilityEvent) => void }) {
  const score = useMemo(() => Math.min(98, 86 + messages.length), [messages]);
  const pendingMeeting = meetingRequest?.status === "pending";
  return <section className="adminShell">
    {meetingRequest && <AvailabilityPopup request={meetingRequest} onConfirm={() => onTeamAvailability(createTeamAvailabilityEvent(meetingRequest, "confirmed", meetingRequest.requestedTime))} onReschedule={() => onTeamAvailability(createTeamAvailabilityEvent(meetingRequest, "reschedule", "10:00"))} />}
    <aside className="sidebar">
      <div className="sidebarBrand"><Logo/><strong>Nexo</strong></div>
      <nav><span className="navTitle">ESPAÇO DE TRABALHO</span><button>⌂ <span>Visão geral</span></button><button className="active">◉ <span>Atendimentos</span><b>12</b></button><button>♙ <span>Clientes</span></button><button>▣ <span>Base de conhecimento</span></button><span className="navTitle">GESTÃO</span><button>◫ <span>Relatórios</span></button><button>⚙ <span>Configurações</span></button></nav>
      <div className="agentCard"><div className="agentAvatar">CM<i/></div><div><strong>Carla Mendes</strong><span>Administradora</span></div><button>⋮</button></div>
    </aside>
    <div className="adminMain">
      <header className="topbar"><div><h2>Atendimentos</h2><p>Acompanhe e gerencie todas as conversas</p></div><div className="topActions"><button className="searchBtn">⌕ <span>Buscar...</span><kbd>⌘ K</kbd></button><button className={pendingMeeting ? "notification hasMeeting" : "notification"}>♢<i>{pendingMeeting ? 4 : 3}</i></button><button className="newBtn">＋ Novo atendimento</button></div></header>
      <div className="metrics">
        <Metric label="Em atendimento" value="12" hint="↑ 8% desde ontem" tone="teal" />
        <Metric label="Aguardando" value="7" hint="3 há mais de 10 min" tone="orange" />
        <Metric label="Resolvidos hoje" value="48" hint="↑ 12% desde ontem" tone="purple" />
        <Metric label="Satisfação média" value="4,8" hint="de 5,0 · 127 avaliações" tone="blue" />
      </div>
      <div className="workspace">
        <div className="inbox">
          <div className="inboxHead"><div className="tabs"><button className="active">Todos <span>24</span></button><button>Meus <span>5</span></button><button>Não atribuídos <span>7</span></button></div><div className="filters"><button>≡ Filtrar</button><button>↕ Mais recentes</button></div></div>
          <div className="conversationList">{conversations.map((c,i)=><article className={c.active?"conversation active":"conversation"} key={c.name}><div className={`avatar a${i}`}>{c.initials}{i<4&&<i/>}</div><div className="conversationText"><div><strong>{c.name}</strong><time>{c.time}</time></div><p>{c.subject}</p><span className={`tag t${i}`}>{c.status}</span></div></article>)}</div>
        </div>
        <div className="conversationDetail">
          <header><div className="avatar a0">JA<i/></div><div><strong>João Almeida</strong><span>Online agora · Campinas, SP</span></div><div className="detailActions"><button>☆</button><button>⋮</button><button className="assign">Atribuir a mim</button></div></header>
          <div className="timeline"><div className="dayPill">Hoje, 09:41</div>{messages.map(m=><div key={m.id} className={`detailMessage ${m.role}`}><div className="miniAvatar">{m.role === "assistant" ? "N" : "JA"}</div><div><span>{m.role === "assistant" ? "Nexo Assistente" : "João Almeida"} · {m.time}</span><p>{m.text}</p></div></div>)}</div>
          <div className="reply"><div><button className="active">Responder</button><button>Nota interna</button></div><textarea placeholder="Digite sua resposta..."/><footer><span>＋　⌕　☺</span><button>Enviar　➤</button></footer></div>
        </div>
        <aside className="customerPanel">
          <div className="profile"><div className="profileAvatar">JA</div><h3>João Almeida</h3><p>joao@almeida.com.br</p><span>Cliente desde mar. 2024</span></div>
          <div className="aiSummary"><div><strong>✦ Resumo inteligente</strong><span>{score}% confiança</span></div><p>Cliente recorrente da unidade de Campinas. Busca agendar manutenção preventiva para amanhã pela manhã.</p><button>Ver histórico completo →</button></div>
          {meetingRequest && <Info title="SOLICITAÇÃO DE AGENDA"><div className="scheduleStatus"><span>{meetingStatusText(meetingRequest.status)}</span><strong>{meetingRequest.requestedDate} · {meetingRequest.teamChoice ?? meetingRequest.requestedTime}</strong><p>{meetingRequest.teamNote ?? "IA aguardando a equipe confirmar disponibilidade."}</p></div></Info>}
          <Info title="INFORMAÇÕES"><p><span>Telefone</span><b>+55 19 99999-1234</b></p><p><span>Empresa</span><b>Almeida Comércio</b></p><p><span>Localização</span><b>Campinas, SP</b></p></Info>
          <Info title="PREFERÊNCIAS"><div className="chips"><span>Manhã</span><span>WhatsApp</span><span>Manutenção preventiva</span></div></Info>
          <Info title="ATENDIMENTOS ANTERIORES"><div className="history"><i/><p><b>Manutenção preventiva</b><span>12 jun. 2026 · Resolvido</span></p></div><div className="history"><i/><p><b>Instalação de equipamento</b><span>03 mar. 2026 · Resolvido</span></p></div></Info>
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
    {!answered && <div className="teamAvailability"><span><b>CM</b> Carla Mendes</span><em>Disponível</em><span><b>RO</b> Renato Oliveira</span><em>Em visita</em><span><b>LF</b> Luiza Freitas</span><em>Disponível 10:00</em></div>}
    {!answered && <footer><button onClick={onConfirm}>Disponível às {request.requestedTime}</button><button onClick={onReschedule}>Sugerir 10:00</button></footer>}
  </div>;
}

function Metric({label,value,hint,tone}:{label:string;value:string;hint:string;tone:string}) { return <article className="metric"><div className={`metricIcon ${tone}`}>✦</div><div><p>{label}</p><strong>{value}</strong><span>{hint}</span></div></article> }
function Info({title,children}:{title:string;children:React.ReactNode}) { return <section className="info"><h4>{title}</h4>{children}</section> }
