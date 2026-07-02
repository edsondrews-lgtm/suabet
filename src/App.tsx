import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine
} from "recharts";

// ── Types ──
type Resultado = "pendente" | "green" | "red" | "void";
type Tipo = "simples" | "bonus";
type StakeTipo = "unidades" | "valor";
type Aba = "resumo" | "analise" | "todas" | "pendentes" | "simples" | "duplas" | "triplas" | "combinadas" | "bonus" | "programacao" | "telegram" | "usuarios";
type VisaoAnalise = "diario" | "semanal" | "mensal" | "anual";

interface Detalhe {
  id: string; aposta_id: string; esporte: string; campeonato: string;
  jogo: string; mercado: string; selecao: string; odd_parcial: number;
}
interface Aposta {
  id: string; data: string; tipo: Tipo; stake_unidades: number | null; stake_tipo: StakeTipo | null;
  banca_momento: number | null; valor_bonus: number | null; lucro_maximo: number | null;
  casa_aposta: string; odd_total: number; resultado: Resultado;
  lucro_reais: number | null; observacao: string | null; created_at: string;
  user_id: string | null; origem: string | null;
  detalhes?: Detalhe[];
}
interface UserProfile {
  id: string; nome: string | null; banca_inicial: number; moeda: string;
  telegram_chat_id: number | null; created_at: string; role?: string;
  stake_tipo_padrao?: StakeTipo;
}
interface UsuarioRelatorio {
  id: string; nome: string | null; moeda: string; banca_inicial: number; created_at: string;
  totalApostas: number; resolvidas: number; greens: number; reds: number; pendentes: number;
  bancaAtual: number; lucroTotal: number; viaTelegram: number; viaManual: number;
}
interface Programacao {
  id: string; casa: string; dia_semana: string; valor: number;
  observacao: string | null; created_at: string;
}
interface TelegramMessage {
  id: string; chat_id: number; nome: string;
  texto: string | null; foto_file_id: string | null;
  dados_extraidos: DadosBilhete | null;
  status_extracao: string; status: string; created_at: string;
  user_id: string | null;
}
interface DadosBilhete {
  data: string | null; casa_aposta: string | null; stake_unidades: number | null; stake_tipo?: StakeTipo;
  tipo: string; odd_total: number;
  pernas: { esporte: string; campeonato: string; jogo: string; mercado: string; selecao: string; odd_parcial: number }[];
}
interface PernaForm { esporte: string; campeonato: string; jogo: string; mercado: string; selecao: string; odd_parcial: string; }
interface ApostaForm {
  id: string | null; data: string; casa_aposta: string;
  stake_tipo: StakeTipo; stake_unidades: string; odd_total: string;
  resultado: Resultado; observacao: string;
  pernas: PernaForm[];
}
function apostaFormVazio(): ApostaForm {
  return {
    id: null, data: new Date().toISOString().split("T")[0], casa_aposta: "",
    stake_tipo: "unidades", stake_unidades: "1", odd_total: "",
    resultado: "pendente", observacao: "",
    pernas: [{ esporte: "", campeonato: "", jogo: "", mercado: "", selecao: "", odd_parcial: "" }],
  };
}

// ── Constants ──
const BANCA_INICIAL_DEFAULT = 1000;
const CASAS = ['Granawin','BetandYou','BetLabel','WinWin','22Bet','BetSnipe','BET&YOU'];
const DIAS_SEMANA = ['segunda','terca','quarta','quinta','sexta','sabado','domingo'];
const DIAS_LABEL: Record<string,string> = {
  segunda:"Seg",terca:"Ter",quarta:"Qua",quinta:"Qui",sexta:"Sex",sabado:"Sab",domingo:"Dom"
};

// ── Helpers ──
function calcularLucro(a: Aposta, bancaBase?: number): number {
  if (a.resultado === "pendente" || a.resultado === "void") return 0;
  if (a.tipo === "bonus") return a.resultado === "green" ? (a.lucro_maximo ?? 0) : 0;
  const banca = bancaBase ?? BANCA_INICIAL_DEFAULT;
  const stake = a.stake_tipo === "valor"
    ? (a.stake_unidades ?? 0)
    : ((a.stake_unidades ?? 1) / 100) * banca;
  return a.resultado === "green"
    ? parseFloat((stake * (a.odd_total - 1)).toFixed(2))
    : parseFloat((-stake).toFixed(2));
}
const MOEDA_SYMBOLS: Record<string, string> = { BRL: "R$", USD: "$", EUR: "€" };
function fmtBRL(v: number, moeda?: string) {
  const sym = MOEDA_SYMBOLS[moeda || "BRL"] || "R$";
  return sym + " " + Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDataCurta(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function fmtDataLonga(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDiaSemana(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short" }).replace(".","");
}
function labelTipo(nLegs: number): string {
  if (nLegs <= 1) return "Simples";
  if (nLegs === 2) return "Dupla";
  if (nLegs === 3) return "Tripla";
  return "Combinada";
}

// ── Theme tokens ──
const DARK = {
  bg: "#0A0F1E",
  bgCard: "#111827",
  bgHover: "#1a2235",
  border: "#1f2d45",
  text: "#F1F5F9",
  muted: "#64748B",
  subtle: "#334155",
  green: "#10B981",
  red: "#F87171",
  blue: "#3B82F6",
  amber: "#F59E0B",
};
const LIGHT = {
  bg: "#F0F4FF",
  bgCard: "#FFFFFF",
  bgHover: "#F8FAFF",
  border: "#DDE4F0",
  text: "#0F172A",
  muted: "#64748B",
  subtle: "#CBD5E1",
  green: "#059669",
  red: "#DC2626",
  blue: "#2563EB",
  amber: "#D97706",
};

export default function TipsterPainel() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuLogin, setMenuLogin] = useState(false);
  const [menuAdmin, setMenuAdmin] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginErro, setLoginErro] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<Aba>("resumo");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ id: string; resultado: Resultado } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [modalRelatorio, setModalRelatorio] = useState(false);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  const [textoRelatorio, setTextoRelatorio] = useState("");
  const [programacao, setProgramacao] = useState<Programacao[]>([]);
  const [modalProgramacao, setModalProgramacao] = useState(false);
  const [editProgramacao, setEditProgramacao] = useState<Programacao | null>(null);
  const [formProg, setFormProg] = useState({ casa: CASAS[0], dia_semana: DIAS_SEMANA[0], valor: "", observacao: "" });
  const [dark, setDark] = useState(true);
  const [incluirBonus, setIncluirBonus] = useState(true);
  const [telegramMsgs, setTelegramMsgs] = useState<TelegramMessage[]>([]);
  const [modalTelegram, setModalTelegram] = useState(false);
  const [msgSelecionada, setMsgSelecionada] = useState<TelegramMessage | null>(null);
  const [editMsgTexto, setEditMsgTexto] = useState("");
  const [editBilhete, setEditBilhete] = useState<DadosBilhete | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [visaoAnalise, setVisaoAnalise] = useState<VisaoAnalise>("mensal");
  const [mesAnalise, setMesAnalise] = useState(() => new Date());
  const [diaAnalise, setDiaAnalise] = useState(() => new Date().toISOString().split("T")[0]);
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [tooltipDia, setTooltipDia] = useState<{ x:number; y:number; data:string; valor:number; apostas:Aposta[] } | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [formProfile, setFormProfile] = useState({ nome: "", banca: "1000", moeda: "BRL", stake_tipo_padrao: "valor" as StakeTipo });
  const [userLogado, setUserLogado] = useState<any>(null);
  const [telaCadastro, setTelaCadastro] = useState(false);
  const [cadastroPass2, setCadastroPass2] = useState("");
  const [editProfileMode, setEditProfileMode] = useState(false);
  const [telegramVinculado, setTelegramVinculado] = useState(false);
  const [modalAposta, setModalAposta] = useState(false);
  const [formAposta, setFormAposta] = useState<ApostaForm>(apostaFormVazio());
  const [salvandoAposta, setSalvandoAposta] = useState(false);
  const [usuarios, setUsuarios] = useState<UsuarioRelatorio[]>([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [apostasPorUsuario, setApostasPorUsuario] = useState<Record<string, Aposta[]>>({});
  const [clienteSelecionado, setClienteSelecionado] = useState<string | null>(null);
  const [filtroResultado, setFiltroResultado] = useState<string>("todos");
  const [filtroCasaCliente, setFiltroCasaCliente] = useState<string>("todas");
  const [filtroOrigemCliente, setFiltroOrigemCliente] = useState<string>("todas");
  const [filtroMesCliente, setFiltroMesCliente] = useState<string>("");

  const bancaMomentoRef = useRef<Record<string, number>>({});
  const T = dark ? DARK : LIGHT;
  const BANCA_INICIAL = userProfile?.banca_inicial ?? BANCA_INICIAL_DEFAULT;
  const MOEDA = userProfile?.moeda || "BRL";
  const fmt = (v: number) => fmtBRL(v, MOEDA);

  useEffect(() => {
    // onAuthStateChange já dispara uma vez com a sessão atual ao inscrever,
    // então não precisa de um getSession() separado (isso causava busca dupla)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) aoLogar(session.user);
      else { setIsAdmin(false); setUserLogado(null); setUserProfile(null); carregar(); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function aoLogar(user: any) {
    setUserLogado(user);
    let { data: profile } = await supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle();
    if (!profile) {
      const meta = user.user_metadata || {};
      const { data: criado, error: criarErr } = await supabase.from("user_profiles").upsert({
        id: user.id,
        nome: meta.nome || user.email?.split("@")[0] || "",
        banca_inicial: meta.banca_inicial || 1000,
        moeda: meta.moeda || "BRL",
      }).select("*").single();
      if (criarErr) console.error("Erro ao criar perfil:", criarErr);
      profile = criado ?? null;
    }
    const isAdm = profile?.role === "admin";
    if (profile) {
      setUserProfile(profile as UserProfile);
      setIsAdmin(isAdm);
    }
    const { data: vinc } = await supabase.from("telegram_vinculos").select("chat_id").eq("user_id", user.id).maybeSingle();
    setTelegramVinculado(!!vinc?.chat_id);
    await carregar(user.id);
  }

  const ADMIN_EMAIL_MAP: Record<string, string> = { "edsondrews": "edsondrews@hotmail.com" };

  async function fazerLogin() {
    setLoginLoading(true);
    setLoginErro("");
    const email = ADMIN_EMAIL_MAP[loginEmail.trim().toLowerCase()] ?? loginEmail;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: loginPass });
    if (error) setLoginErro(error.message === "Invalid login credentials" ? "Usuário ou senha inválidos" : error.message);
    else {
      setMenuLogin(false); setLoginEmail(""); setLoginPass("");
      if (data?.user) await aoLogar(data.user);
    }
    setLoginLoading(false);
  }

  const fazerCadastro = async () => {
    setLoginLoading(true);
    setLoginErro("");
    if (loginPass !== cadastroPass2) { setLoginErro("As senhas não coincidem"); setLoginLoading(false); return; }
    if (loginPass.length < 6) { setLoginErro("Senha deve ter no mínimo 6 caracteres"); setLoginLoading(false); return; }
    const { data, error } = await supabase.auth.signUp({
      email: loginEmail,
      password: loginPass,
      options: {
        data: {
          nome: formProfile.nome || loginEmail.split("@")[0],
          banca_inicial: parseFloat(formProfile.banca) || 1000,
          moeda: formProfile.moeda,
        },
      },
    });
    if (error) { setLoginErro(error.message); setLoginLoading(false); return; }
    if (data?.session && data?.user) {
      await aoLogar(data.user);
      setMenuLogin(false);
      setTelaCadastro(false);
      setLoginEmail(""); setLoginPass(""); setCadastroPass2("");
      setFormProfile({ nome: "", banca: "1000", moeda: "BRL", stake_tipo_padrao: "valor" });
    } else {
      setTelaCadastro(false);
      setLoginErro("Conta criada! Verifique seu email e confirme antes de entrar.");
    }
    setLoginLoading(false);
  };

  function abrirEditarPerfil() {
    setMenuLogin(false);
    setFormProfile({ nome: userProfile?.nome || "", banca: String(userProfile?.banca_inicial || 1000), moeda: userProfile?.moeda || "BRL", stake_tipo_padrao: userProfile?.stake_tipo_padrao || "valor" });
    setEditProfileMode(true);
  }

  const salvarEditProfile = async () => {
    if (!userLogado) return;
    const { error } = await supabase.from("user_profiles").upsert({
      id: userLogado.id,
      nome: formProfile.nome || userProfile?.nome || "",
      banca_inicial: parseFloat(formProfile.banca) || userProfile?.banca_inicial || 1000,
      moeda: formProfile.moeda || userProfile?.moeda || "BRL",
      stake_tipo_padrao: formProfile.stake_tipo_padrao || "valor",
    });
    if (error) { alert("Erro ao salvar: " + error.message); return; }
    const { data } = await supabase.from("user_profiles").select("*").eq("id", userLogado.id).single();
    setUserProfile(data as UserProfile);
    setEditProfileMode(false);
    carregar(userLogado.id);
  };

  function exportarBackup() {
    const dados = {
      exportado_em: new Date().toISOString(),
      apostas,
      programacao,
    };
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-tipster-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function fazerLogout() {
    await supabase.auth.signOut();
    setIsAdmin(false);
    setMenuLogin(false);
    setUserLogado(null);
    setUserProfile(null);
  }

  async function carregarTelegram(userId?: string) {
    if (!userId) { setTelegramMsgs([]); return; }
    const { data } = await supabase.from("telegram_messages").select("*")
      .eq("status", "pendente").eq("user_id", userId).order("created_at", { ascending: false });
    setTelegramMsgs((data ?? []) as TelegramMessage[]);
  }

  function abrirConfirmacao(msg: TelegramMessage) {
    setMsgSelecionada(msg);
    setEditMsgTexto(msg.texto ?? "");
    setEditMode(false);
    if (msg.dados_extraidos) {
      const clone = JSON.parse(JSON.stringify(msg.dados_extraidos));
      if (!clone.stake_tipo) clone.stake_tipo = userProfile?.stake_tipo_padrao || "valor";
      setEditBilhete(clone);
    } else {
      setEditBilhete(null);
    }
    setModalTelegram(true);
  }

  async function negarMsg() {
    if (!msgSelecionada) return;
    await supabase.from("telegram_messages").delete().eq("id", msgSelecionada.id);
    setModalTelegram(false);
    setMsgSelecionada(null);
    carregarTelegram(userLogado?.id);
  }

  async function excluirAposta(id: string) {
    if (!confirm("Tem certeza que deseja excluir esta aposta?")) return;
    await supabase.from("tipster_apostas_detalhes").delete().eq("aposta_id", id);
    await supabase.from("tipster_apostas").delete().eq("id", id);
    carregar();
  }

  function abrirNovaAposta() {
    setFormAposta({ ...apostaFormVazio(), stake_tipo: userProfile?.stake_tipo_padrao || "valor" });
    setModalAposta(true);
  }

  function abrirEditarAposta(aposta: Aposta) {
    setFormAposta({
      id: aposta.id,
      data: aposta.data,
      casa_aposta: aposta.casa_aposta || "",
      stake_tipo: aposta.stake_tipo || "unidades",
      stake_unidades: aposta.stake_unidades != null ? String(aposta.stake_unidades) : "",
      odd_total: aposta.odd_total != null ? String(aposta.odd_total) : "",
      resultado: aposta.resultado,
      observacao: aposta.observacao || "",
      pernas: (aposta.detalhes && aposta.detalhes.length > 0)
        ? aposta.detalhes.map(d => ({ esporte: d.esporte, campeonato: d.campeonato, jogo: d.jogo, mercado: d.mercado, selecao: d.selecao, odd_parcial: String(d.odd_parcial) }))
        : [{ esporte: "", campeonato: "", jogo: "", mercado: "", selecao: "", odd_parcial: "" }],
    });
    setModalAposta(true);
  }

  function addPernaForm() {
    setFormAposta(f => ({ ...f, pernas: [...f.pernas, { esporte: "", campeonato: "", jogo: "", mercado: "", selecao: "", odd_parcial: "" }] }));
  }
  function removerPernaForm(i: number) {
    setFormAposta(f => ({ ...f, pernas: f.pernas.length > 1 ? f.pernas.filter((_, idx) => idx !== i) : f.pernas }));
  }
  function updatePernaForm(i: number, campo: keyof PernaForm, valor: string) {
    setFormAposta(f => { const n = [...f.pernas]; n[i] = { ...n[i], [campo]: valor }; return { ...f, pernas: n }; });
  }
  function oddCalculada(pernas: PernaForm[]): number {
    return pernas.reduce((acc, p) => acc * (parseFloat(p.odd_parcial) || 1), 1);
  }

  async function salvarAposta() {
    if (!userLogado) return;
    setSalvandoAposta(true);
    const oddTotal = parseFloat(formAposta.odd_total) || parseFloat(oddCalculada(formAposta.pernas).toFixed(3));
    const payload = {
      data: formAposta.data || new Date().toISOString().split("T")[0],
      tipo: formAposta.pernas.length > 1 ? "multipla" : "simples",
      stake_unidades: parseFloat(formAposta.stake_unidades) || 0,
      stake_tipo: formAposta.stake_tipo,
      casa_aposta: formAposta.casa_aposta || "",
      odd_total: oddTotal,
      resultado: formAposta.resultado,
      observacao: formAposta.observacao || null,
    };
    const legsPayload = (aposta_id: string) => formAposta.pernas.map(p => ({
      aposta_id, esporte: p.esporte || "", campeonato: p.campeonato || "",
      jogo: p.jogo || "", mercado: p.mercado || "", selecao: p.selecao || "",
      odd_parcial: parseFloat(p.odd_parcial) || 0,
    }));

    if (formAposta.id) {
      const { error } = await supabase.from("tipster_apostas").update(payload).eq("id", formAposta.id);
      if (error) { alert("Erro ao salvar: " + error.message); setSalvandoAposta(false); return; }
      await supabase.from("tipster_apostas_detalhes").delete().eq("aposta_id", formAposta.id);
      await supabase.from("tipster_apostas_detalhes").insert(legsPayload(formAposta.id));
    } else {
      const { data: ins, error } = await supabase.from("tipster_apostas")
        .insert({ ...payload, origem: "manual", banca_momento: bancaAtual, user_id: userLogado.id }).select("id").single();
      if (error || !ins) { alert("Erro ao salvar: " + (error?.message ?? "desconhecido")); setSalvandoAposta(false); return; }
      await supabase.from("tipster_apostas_detalhes").insert(legsPayload(ins.id));
    }
    setModalAposta(false);
    setSalvandoAposta(false);
    carregar();
  }

  async function salvarEditado() {
    if (!msgSelecionada) return;
    if (!userLogado) { alert("Sua sessão expirou. Faça login novamente antes de confirmar o bilhete."); return; }
    if (editBilhete) {
      const { data: apostaInsert, error: err1 } = await supabase.from("tipster_apostas").insert({
        data: editBilhete.data || new Date().toISOString().split("T")[0],
        tipo: editBilhete.pernas?.length > 1 ? "multipla" : "simples",
        stake_unidades: editBilhete.stake_unidades,
        stake_tipo: editBilhete.stake_tipo || "unidades",
        banca_momento: bancaAtual,
        casa_aposta: editBilhete.casa_aposta || "",
        odd_total: editBilhete.odd_total,
        resultado: "pendente",
        observacao: editMsgTexto || null,
        user_id: userLogado?.id || null,
        origem: "telegram",
      }).select("id").single();
      if (err1 || !apostaInsert) { console.error("Erro ao salvar aposta:", err1); alert("Erro ao salvar: " + (err1?.message ?? "desconhecido")); return; }
      const legs = (editBilhete.pernas || []).map(p => ({
        aposta_id: apostaInsert.id, esporte: p.esporte || "", campeonato: p.campeonato || "",
        jogo: p.jogo || "", mercado: p.mercado || "", selecao: p.selecao || "",
        odd_parcial: p.odd_parcial || 0,
      }));
      if (legs.length > 0) await supabase.from("tipster_apostas_detalhes").insert(legs);
      await supabase.from("telegram_messages").delete().eq("id", msgSelecionada.id);
      setModalTelegram(false);
      setMsgSelecionada(null);
      carregar();
    } else {
      await supabase.from("telegram_messages").update({
        status: "confirmado",
        texto: editMsgTexto || msgSelecionada.texto,
      }).eq("id", msgSelecionada.id);
      setModalTelegram(false);
      setMsgSelecionada(null);
      carregarTelegram(userLogado?.id);
    }
  }

  async function carregar(userId?: string) {
    setLoading(true);
    const effectiveUserId = userId || userLogado?.id || null;
    if (!effectiveUserId) {
      setApostas([]);
      setLoading(false);
      return;
    }
    const { data: ap } = await supabase.from("tipster_apostas").select("*")
      .eq("user_id", effectiveUserId).order("data",{ascending:true}).order("created_at",{ascending:true});
    const apostaIds = (ap ?? []).map((a: Aposta) => a.id);
    const { data: det } = apostaIds.length > 0
      ? await supabase.from("tipster_apostas_detalhes").select("*").in("aposta_id", apostaIds)
      : { data: [] as Detalhe[] };
    const { data: prog } = await supabase.from("tipster_programacao").select("*").order("dia_semana");
    const com = (ap ?? []).map((a: Aposta) => ({ ...a, detalhes: (det ?? []).filter((d: Detalhe) => d.aposta_id === a.id) }));
    setApostas(com);
    setProgramacao((prog ?? []) as Programacao[]);
    await carregarTelegram(effectiveUserId);
    setLoading(false);
  }

  async function carregarUsuarios() {
    setLoadingUsuarios(true);
    const { data: perfis } = await supabase.from("user_profiles").select("*").order("created_at", { ascending: false });
    const { data: todasApostas } = await supabase.from("tipster_apostas").select("*")
      .order("data", { ascending: true }).order("created_at", { ascending: true });
    const apostaIds = (todasApostas ?? []).map((a: Aposta) => a.id);
    const { data: todosDet } = apostaIds.length > 0
      ? await supabase.from("tipster_apostas_detalhes").select("*").in("aposta_id", apostaIds)
      : { data: [] as Detalhe[] };
    const porUsuario: Record<string, Aposta[]> = {};
    (todasApostas ?? []).forEach((a: Aposta) => {
      const uid = a.user_id || "sem_dono";
      const comDetalhes = { ...a, detalhes: (todosDet ?? []).filter((d: Detalhe) => d.aposta_id === a.id) };
      if (!porUsuario[uid]) porUsuario[uid] = [];
      porUsuario[uid].push(comDetalhes);
    });
    setApostasPorUsuario(porUsuario);
    const relatorio: UsuarioRelatorio[] = (perfis ?? []).map((p: UserProfile) => {
      const lista = porUsuario[p.id] ?? [];
      const bancaInicial = p.banca_inicial ?? BANCA_INICIAL_DEFAULT;
      let bancaAcum = bancaInicial;
      let greens = 0, reds = 0, pendentes = 0;
      for (const a of lista) {
        if (a.resultado === "pendente") pendentes++;
        if (a.resultado !== "pendente" && a.resultado !== "void") {
          bancaAcum = parseFloat((bancaAcum + calcularLucro(a, bancaAcum)).toFixed(2));
          if (a.resultado === "green") greens++;
          if (a.resultado === "red") reds++;
        }
      }
      return {
        id: p.id, nome: p.nome, moeda: p.moeda || "BRL", banca_inicial: bancaInicial, created_at: p.created_at,
        totalApostas: lista.length, resolvidas: greens + reds, greens, reds, pendentes,
        bancaAtual: bancaAcum, lucroTotal: parseFloat((bancaAcum - bancaInicial).toFixed(2)),
        viaTelegram: lista.filter(a => a.origem === "telegram").length,
        viaManual: lista.filter(a => a.origem === "manual").length,
      };
    });
    setUsuarios(relatorio);
    setLoadingUsuarios(false);
  }

  useEffect(() => {
    const channel = supabase.channel("telegram-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "telegram_messages" }, (payload) => {
        const nova = payload.new as TelegramMessage;
        setTelegramMsgs(prev => [nova, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function salvarResultado() {
    if (!editando) return;
    setSalvando(true);
    const aposta = apostas.find(a => a.id === editando.id)!;
    const bancaBase = bancaMomentoRef.current[aposta.id] ?? BANCA_INICIAL;
    const lucro = calcularLucro({ ...aposta, resultado: editando.resultado }, bancaBase);
    await supabase.from("tipster_apostas").update({ resultado: editando.resultado, lucro_reais: lucro }).eq("id", editando.id);
    setSalvando(false); setEditando(null); carregar();
  }

  function abrirNovaProgramacao() {
    setEditProgramacao(null);
    setFormProg({ casa: CASAS[0], dia_semana: DIAS_SEMANA[0], valor: "", observacao: "" });
    setModalProgramacao(true);
  }
  function abrirEditarProgramacao(p: Programacao) {
    setEditProgramacao(p);
    setFormProg({ casa: p.casa, dia_semana: p.dia_semana, valor: String(p.valor), observacao: p.observacao ?? "" });
    setModalProgramacao(true);
  }
  async function salvarProgramacao() {
    if (!formProg.valor) return;
    const payload = { casa: formProg.casa, dia_semana: formProg.dia_semana, valor: parseFloat(formProg.valor), observacao: formProg.observacao || null };
    if (editProgramacao) await supabase.from("tipster_programacao").update(payload).eq("id", editProgramacao.id);
    else await supabase.from("tipster_programacao").insert(payload);
    setModalProgramacao(false); carregar();
  }
  async function excluirProgramacao(id: string) {
    await supabase.from("tipster_programacao").delete().eq("id", id); carregar();
  }

  // ── Derived data ──
  const simples = apostas.filter(a => a.tipo === "simples");
  const bonus = apostas.filter(a => a.tipo === "bonus");
  const simplesUm = simples.filter(a => (a.detalhes?.length ?? 0) <= 1);
  const simplesDupla = simples.filter(a => (a.detalhes?.length ?? 0) === 2);
  const simplesTripla = simples.filter(a => (a.detalhes?.length ?? 0) === 3);
  const simplesCombinada = simples.filter(a => (a.detalhes?.length ?? 0) >= 4);

  const apostasFiltro = incluirBonus ? apostas : apostas.filter(a => a.tipo === "simples");
  const todasOrdenadas = [...apostasFiltro].sort((a, b) => a.data.localeCompare(b.data) || a.created_at.localeCompare(b.created_at));
  const bancaMomentoCalc: Record<string, number> = {};
  let bancaAcum = BANCA_INICIAL;
  for (const a of todasOrdenadas) {
    bancaMomentoCalc[a.id] = bancaAcum;
    if (a.resultado !== "pendente" && a.resultado !== "void") {
      bancaAcum = parseFloat((bancaAcum + calcularLucro(a, bancaAcum)).toFixed(2));
    }
  }
  const bancaAtual = bancaAcum;
  bancaMomentoRef.current = bancaMomentoCalc;

  function lucroCalc(a: Aposta) { return calcularLucro(a, bancaMomentoCalc[a.id]); }

  const resolvidasSimples = simples.filter(a => a.resultado !== "pendente" && a.resultado !== "void");
  const todasResolvidas = apostasFiltro.filter(a => a.resultado !== "pendente" && a.resultado !== "void");
  const greens = resolvidasSimples.filter(a => a.resultado === "green");
  const reds = resolvidasSimples.filter(a => a.resultado === "red");
  const pendentes = apostas.filter(a => a.resultado === "pendente");
  const taxaAcerto = resolvidasSimples.length > 0 ? (greens.length / resolvidasSimples.length * 100) : 0;
  const lucroSimples = resolvidasSimples.reduce((s, a) => s + lucroCalc(a), 0);
  const yieldPct = ((bancaAtual - BANCA_INICIAL) / BANCA_INICIAL * 100);
  const oddMedia = simples.length > 0 ? simples.reduce((s, a) => s + a.odd_total, 0) / simples.length : 0;
  const unidadesInvestidas = resolvidasSimples.reduce((s, a) => s + (a.stake_unidades ?? 0), 0);
  const unidadesLucro = resolvidasSimples.reduce((s, a) => {
    const stake = a.stake_unidades ?? 1;
    return a.resultado === "green" ? s + stake * (a.odd_total - 1) : s - stake;
  }, 0);
  const roiUnidades = unidadesInvestidas > 0 ? (unidadesLucro / unidadesInvestidas * 100) : 0;

  let sequencia = 0, tipoSeq: "green" | "red" | null = null;
  for (const a of [...todasOrdenadas].reverse()) {
    if (a.resultado === "pendente" || a.resultado === "void") continue;
    if (tipoSeq === null) tipoSeq = a.resultado as "green" | "red";
    if (a.resultado === tipoSeq) sequencia++; else break;
  }
  let melhorSeq = 0, seqTemp = 0;
  for (const a of todasOrdenadas) {
    if (a.resultado === "green") { seqTemp++; melhorSeq = Math.max(melhorSeq, seqTemp); }
    else if (a.resultado === "red") seqTemp = 0;
  }
  let peakBanca = BANCA_INICIAL, maxDrawdown = 0, acumDD = BANCA_INICIAL;
  for (const a of todasResolvidas) {
    acumDD = parseFloat((acumDD + lucroCalc(a)).toFixed(2));
    if (acumDD > peakBanca) peakBanca = acumDD;
    const dd = ((peakBanca - acumDD) / peakBanca) * 100;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  const lucroPorCasa: Record<string, { lucro: number; count: number; greens: number }> = {};
  resolvidasSimples.forEach(a => {
    const casa = a.casa_aposta;
    if (!lucroPorCasa[casa]) lucroPorCasa[casa] = { lucro: 0, count: 0, greens: 0 };
    lucroPorCasa[casa].lucro += lucroCalc(a);
    lucroPorCasa[casa].count++;
    if (a.resultado === "green") lucroPorCasa[casa].greens++;
  });
  const topCasas = Object.entries(lucroPorCasa).sort((a, b) => b[1].lucro - a[1].lucro).slice(0, 4);

  const dadosGrafico = (() => {
    if (todasOrdenadas.length === 0) return [];
    const resolvidas = todasOrdenadas.filter(a => a.resultado !== "pendente" && a.resultado !== "void");
    const porData: Record<string, number> = {};
    resolvidas.forEach(a => { porData[a.data] = (porData[a.data] ?? 0) + lucroCalc(a); });
    const resultado: { data: string; banca: number }[] = [];
    let acum = BANCA_INICIAL;
    resultado.push({ data: fmtDataCurta(todasOrdenadas[0].data), banca: acum });
    for (const d of Object.keys(porData).sort()) {
      acum = parseFloat((acum + porData[d]).toFixed(2));
      resultado.push({ data: fmtDataCurta(d), banca: acum });
    }
    return resultado;
  })();

  const lucroBonus = bonus.filter(a => a.resultado === "green").reduce((s, a) => s + (a.lucro_maximo ?? 0), 0);
  const pendBonus = bonus.filter(a => a.resultado === "pendente").length;
  const greenBonus = bonus.filter(a => a.resultado === "green").length;
  const redBonus = bonus.filter(a => a.resultado === "red").length;
  const isLucroPos = bancaAtual >= BANCA_INICIAL;
  const listaSimples = [...todasOrdenadas].reverse();
  const listaBonus = [...bonus].reverse();

  // ── Cálculos da Análise ──
  const mesAtual = mesAnalise.getMonth();
  const anoAtual = mesAnalise.getFullYear();
  const apostasMes = apostasFiltro.filter(a => {
    const d = new Date(a.data);
    return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  });
  const apostasMesResolvidas = apostasMes.filter(a => a.resultado !== "pendente" && a.resultado !== "void");
  const lucroMes = apostasMesResolvidas.reduce((s, a) => s + lucroCalc(a), 0);
  const lucroPorDiaMes: Record<string, number> = {};
  apostasMesResolvidas.forEach(a => { lucroPorDiaMes[a.data] = (lucroPorDiaMes[a.data] ?? 0) + lucroCalc(a); });
  const diasLucro = Object.entries(lucroPorDiaMes);
  let streakDias = 0, streakTipoCalc: "green" | "red" | null = null;
  const hoje = new Date().toISOString().split("T")[0];
  const datasOrdenadas = [...new Set(apostasFiltro.filter(a => a.resultado !== "pendente" && a.resultado !== "void").map(a => a.data))].sort();
  for (let i = datasOrdenadas.length - 1; i >= 0; i--) {
    const diaLucro = apostasFiltro.filter(a => a.data === datasOrdenadas[i] && a.resultado !== "pendente" && a.resultado !== "void").reduce((s, a) => s + lucroCalc(a), 0);
    const tipo = diaLucro >= 0 ? "green" : "red";
    if (streakTipoCalc === null) streakTipoCalc = tipo;
    if (tipo === streakTipoCalc) streakDias++; else break;
  }
  const dadosGraficoMes = (() => {
    const arr: { data: string; banca: number }[] = [];
    let acum = BANCA_INICIAL;
    const diasMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
    for (let d = 1; d <= diasMes; d++) {
      const chave = `${anoAtual}-${String(mesAtual+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      if (lucroPorDiaMes[chave] !== undefined) acum = parseFloat((acum + lucroPorDiaMes[chave]).toFixed(2));
      arr.push({ data: `${String(d).padStart(2,"0")}/${String(mesAtual+1).padStart(2,"0")}`, banca: acum });
    }
    return arr;
  })();

  // ── Gerar Relatório ──
  async function gerarRelatorio() {
    setGerandoRelatorio(true); setTextoRelatorio(""); setModalRelatorio(true);
    const dadosParaAPI = {
      dataInicio: todasOrdenadas[0]?.data ?? null,
      dataAtual: new Date().toISOString().split("T")[0],
      bancaInicial: BANCA_INICIAL, bancaAtual,
      yieldPct: yieldPct.toFixed(2), roiUnidades: roiUnidades.toFixed(1),
      totalApostas: apostas.length, totalSimples: simples.length,
      resolvidasSimples: resolvidasSimples.length,
      greens: greens.length, reds: reds.length, pendentes: pendentes.length,
      taxaAcerto: taxaAcerto.toFixed(1), oddMedia: oddMedia.toFixed(2),
      melhorSequencia: melhorSeq, sequenciaAtual: sequencia, tipoSequenciaAtual: tipoSeq,
      maxDrawdown: maxDrawdown.toFixed(1),
      totalBonus: bonus.length, greenBonus, redBonus, pendBonus,
      lucroBonus: lucroBonus.toFixed(2),
      lucroPorCasa: topCasas.map(([casa, d]) => ({
        casa, lucro: d.lucro.toFixed(2), apostas: d.count, greens: d.greens,
        acerto: d.count > 0 ? ((d.greens / d.count) * 100).toFixed(1) : "0"
      })),
    };
    const prompt = `Você é um analista especializado em apostas esportivas. Gere um relatório narrativo profissional em português brasileiro sobre o desempenho do tipster Master com base nos dados abaixo.\n\nDADOS:\n${JSON.stringify(dadosParaAPI, null, 2)}\n\nESTRUTURA:\nINÍCIO DO ACOMPANHAMENTO: Quando foi iniciado, banca inicial, período coberto.\nDESEMPENHO GERAL: Total de apostas, taxa de acerto, yield%, ROI, lucro na banca.\nGESTÃO DE RISCO: Drawdown máximo, sequência atual, melhor sequência.\nBÔNUS CAPTURADOS: Quantos tentados, convertidos vs perdidos, valor capturado.\nPERFORMANCE POR CASA: Qual casa performou melhor.\nCONCLUSÃO: Avaliação geral.\n\nREGRAS: Sem asteriscos, sem markdown, texto corrido com parágrafos. Cada bloco começa com título em MAIÚSCULAS seguido de dois pontos. Tom profissional mas acessível.`;
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) { setTextoRelatorio("Chave Gemini não configurada no .env"); setGerandoRelatorio(false); return; }
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `Erro ${res.status}`);
      setTextoRelatorio(data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta.");
    } catch (err: any) { setTextoRelatorio(`Erro: ${err.message}`); }
    finally { setGerandoRelatorio(false); }
  }
  const globalCSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: ${T.bg}; color: ${T.text}; font-family: 'Inter', system-ui, sans-serif; transition: background 0.3s, color 0.3s; }
    @keyframes spin { to { transform: rotate(360deg) } }
    @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
    ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: ${T.bg}; } ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }
    select, input { background: ${T.bgCard}; color: ${T.text}; border: 1px solid ${T.border}; border-radius: 10px; padding: 10px 12px; font-size: 14px; outline: none; width: 100%; }
    select:focus, input:focus { border-color: ${T.blue}; }
    .cal-cell { transition: transform 0.15s, box-shadow 0.15s; cursor: pointer; }
    .cal-cell:hover { transform: scale(1.15); z-index:2; }
    .pill-active { background: ${T.blue} !important; color: white !important; }
    @media(max-width:600px) { .analise-cards { grid-template-columns: 1fr 1fr !important; } .analise-layout { flex-direction: column !important; } .analise-side { width:100% !important; max-height:40vh; overflow-y:auto; } }
  `;

  if (loading) return (
    <>
      <style>{globalCSS}</style>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", flexDirection:"column", gap:16 }}>
        <div style={{ width:40, height:40, border:`3px solid ${T.border}`, borderTopColor:T.blue, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
        <p style={{ color:T.muted, fontSize:14 }}>Carregando apostas...</p>
      </div>
    </>
  );

  const abasMapa: { key: Aba; label: string; count?: number }[] = [
    { key:"resumo", label:"Resumo" },
    { key:"analise", label:"Análise" },
    { key:"todas", label:"Todas", count:apostas.length },
    { key:"pendentes", label:"Pendentes", count:pendentes.length },
    { key:"simples", label:"Simples", count:simplesUm.length },
    { key:"duplas", label:"Duplas", count:simplesDupla.length },
    { key:"triplas", label:"Triplas", count:simplesTripla.length },
    { key:"combinadas", label:"Combinadas", count:simplesCombinada.length },
    { key:"bonus", label:"Bônus", count:bonus.length },
    { key:"programacao", label:"Programação" },
  ];

  return (
    <>
      <style>{globalCSS}</style>
      <div style={{ minHeight:"100vh", background:T.bg, paddingBottom:40 }}>

        {/* ── NAV ── */}
        <nav className="nav-bar" style={{ background:T.bgCard, borderBottom:`1px solid ${T.border}`, position:"sticky", top:0, zIndex:100, backdropFilter:"blur(12px)" }}>
          <div className="nav-inner" style={{ maxWidth:1200, margin:"0 auto", padding:"0 16px", display:"flex", alignItems:"center", justifyContent:"space-between", height:56 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:`linear-gradient(135deg, ${T.blue}, #8B5CF6)`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontSize:16 }}>⚡</span>
              </div>
              {userLogado ? (
                userProfile?.nome
                  ? <span style={{ fontWeight:800, fontSize:15, color:T.text, letterSpacing:-0.5 }}>Olá, {userProfile.nome}</span>
                  : <span onClick={abrirEditarPerfil} style={{ fontWeight:800, fontSize:15, color:T.blue, letterSpacing:-0.5, cursor:"pointer", textDecoration:"underline" }}>+ Adicionar seu nome</span>
              ) : (
                <span style={{ fontWeight:800, fontSize:15, color:T.text, letterSpacing:-0.5 }}>Master Tipster</span>
              )}
            </div>
            <div className="nav-actions" style={{ display:"flex", gap:8, alignItems:"center" }}>
              <button className="nav-btn-text" onClick={() => carregar()} style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.muted, fontSize:12, fontWeight:600, cursor:"pointer" }}>↻ Atualizar</button>
              {userLogado && <button onClick={abrirNovaAposta} style={{ padding:"6px 14px", borderRadius:8, border:"none", background:T.blue, color:"white", fontSize:12, fontWeight:700, cursor:"pointer" }}>+ Nova Aposta</button>}
              {telegramMsgs.filter(m => m.status === "pendente").length > 0 && (
                <button onClick={() => { setAba("telegram"); }} style={{ position:"relative", padding:"6px 14px", borderRadius:8, border:"none", background:T.green, color:"white", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white" style={{marginRight:4, verticalAlign:"middle"}}><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.95 7.47l-1.97 9.28c-.15.67-.54.83-1.09.52l-3.02-2.22-1.46 1.4c-.16.16-.3.3-.61.3l.22-3.06 5.56-5.02c.24-.22-.05-.33-.37-.14L8.68 13.3l-2.97-.93c-.65-.2-.66-.65.14-.96l11.6-4.47c.54-.2 1.01.13.83.96l-.16-.12z"/></svg> Telegram
                  <span style={{ position:"absolute", top:-6, right:-6, width:18, height:18, borderRadius:"50%", background:T.red, color:"white", fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    {telegramMsgs.filter(m => m.status === "pendente").length}
                  </span>
                </button>
              )}
              {isAdmin && (
                <div style={{ position:"relative" }}>
                  <button onClick={() => setMenuAdmin(!menuAdmin)} style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.text, fontSize:12, fontWeight:700, cursor:"pointer" }}>⚙️ Admin</button>
                  {menuAdmin && (
                    <div style={{ position:"absolute", right:0, top:44, background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:12, padding:8, width:200, zIndex:100, boxShadow:"0 8px 32px rgba(0,0,0,0.4)", display:"flex", flexDirection:"column", gap:4 }}>
                      <button onClick={() => { setMenuAdmin(false); exportarBackup(); }} style={{ width:"100%", textAlign:"left", padding:10, borderRadius:8, border:"none", background:"transparent", color:T.text, fontSize:13, fontWeight:600, cursor:"pointer" }}>💾 Backup</button>
                      <button onClick={() => { setMenuAdmin(false); gerarRelatorio(); }} style={{ width:"100%", textAlign:"left", padding:10, borderRadius:8, border:"none", background:"transparent", color:T.text, fontSize:13, fontWeight:600, cursor:"pointer" }}>📊 Relatório</button>
                      <button onClick={() => { setMenuAdmin(false); setClienteSelecionado(null); setAba("usuarios"); carregarUsuarios(); }} style={{ width:"100%", textAlign:"left", padding:10, borderRadius:8, border:"none", background:"transparent", color:T.text, fontSize:13, fontWeight:600, cursor:"pointer" }}>👥 Usuários</button>
                    </div>
                  )}
                </div>
              )}
              <button onClick={() => setDark(!dark)} style={{ width:36, height:36, borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.muted, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {dark ? "☀️" : "🌙"}
              </button>
              <div style={{ position:"relative" }}>
                <button onClick={() => setMenuLogin(!menuLogin)} style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${T.border}`, background: isAdmin ? T.green+"20" : userLogado ? T.blue+"20" : "transparent", color: isAdmin ? T.green : userLogado ? T.blue : T.muted, fontSize:12, fontWeight:600, cursor:"pointer", maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {isAdmin ? "● Admin" : userLogado ? `👤 ${userProfile?.nome || "Definir nome"}` : "🔑 Login"}
                </button>
                {menuLogin && (
                  <div style={{ position:"absolute", right:0, top:44, background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:12, padding:16, width:280, zIndex:100, boxShadow:"0 8px 32px rgba(0,0,0,0.4)" }}>
                    {userLogado ? (
                      <div>
                        <p style={{ color:T.text, fontSize:13, marginBottom:4 }}>Logado como</p>
                        <p style={{ color:T.text, fontSize:15, marginBottom:12, fontWeight:700 }}>{userProfile?.nome || userLogado.email}</p>
                        <p style={{ color:T.muted, fontSize:12, marginBottom:12 }}>{userLogado.email}</p>
                        <button onClick={abrirEditarPerfil} style={{ width:"100%", padding:10, borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.text, fontSize:13, fontWeight:600, cursor:"pointer", marginBottom:8 }}>✏️ Meu perfil</button>
                        <button onClick={async () => {
                          if (!userLogado) return;
                          const { data: existing } = await supabase.from("telegram_vinculos").select("chat_id").eq("user_id", userLogado.id).maybeSingle();
                          if (existing?.chat_id) {
                            if (!confirm("Desvincular Telegram? Você perderá a conexão com o bot.")) return;
                            await supabase.from("telegram_vinculos").delete().eq("user_id", userLogado.id);
                            setTelegramVinculado(false);
                            alert("Telegram desvinculado!");
                            return;
                          }
                          const code = Math.random().toString(36).substring(2, 8).toUpperCase();
                          await supabase.from("user_profiles").update({ pending_code: code }).eq("id", userLogado.id);
                          alert(`📱 Como vincular o Telegram:\n\n1. Abra o bot @gestorstakebot no Telegram\n2. Envie este comando:\n\n/vincular ${code}\n\nPronto! Depois é só mandar fotos de bilhete pelo bot.`);
                        }} style={{ width:"100%", padding:10, borderRadius:8, border:`1px solid ${T.blue}`, background:"transparent", color:T.blue, fontSize:13, fontWeight:600, cursor:"pointer", marginBottom:8 }}>
                          {telegramVinculado ? "🚫 Desvincular Telegram" : "📱 Vincular Telegram"}
                        </button>
                        <button onClick={fazerLogout} style={{ width:"100%", padding:10, borderRadius:8, border:`1px solid ${T.red}`, background:"transparent", color:T.red, fontSize:13, fontWeight:600, cursor:"pointer" }}>Sair</button>
                      </div>
                    ) : telaCadastro ? (
                      <div>
                        <p style={{ color:T.text, fontSize:14, marginBottom:12, fontWeight:700, textAlign:"center" }}>Criar Conta</p>
                        <input placeholder="Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                          style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:13, marginBottom:8, outline:"none", boxSizing:"border-box" }} />
                        <input placeholder="Nome" value={formProfile.nome} onChange={e => setFormProfile({...formProfile, nome:e.target.value})}
                          style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:13, marginBottom:8, outline:"none", boxSizing:"border-box" }} />
                        <input placeholder="Senha" type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                          style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:13, marginBottom:8, outline:"none", boxSizing:"border-box" }} />
                        <input placeholder="Confirmar senha" type="password" value={cadastroPass2} onChange={e => setCadastroPass2(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && fazerCadastro()}
                          style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:13, marginBottom:8, outline:"none", boxSizing:"border-box" }} />
                        <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:8, marginBottom:10 }}>
                          <input placeholder="Banca inicial" type="number" value={formProfile.banca} onChange={e => setFormProfile({...formProfile, banca:e.target.value})}
                            style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:13, outline:"none", boxSizing:"border-box" }} />
                          <select value={formProfile.moeda} onChange={e => setFormProfile({...formProfile, moeda:e.target.value})}
                            style={{ padding:"10px 8px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:13, outline:"none" }}>
                            <option value="BRL">BRL</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                          </select>
                        </div>
                        {loginErro && <p style={{ color:T.red, fontSize:12, marginBottom:8 }}>{loginErro}</p>}
                        <button onClick={fazerCadastro} disabled={loginLoading} style={{ width:"100%", padding:10, borderRadius:8, border:"none", background:T.blue, color:"white", fontSize:13, fontWeight:600, cursor: loginLoading ? "wait" : "pointer", opacity: loginLoading ? 0.6 : 1 }}>{loginLoading ? "Criando..." : "Criar conta"}</button>
                        <p style={{ color:T.muted, fontSize:12, marginTop:10, textAlign:"center" }}>Já tem conta? <span onClick={() => { setTelaCadastro(false); setLoginErro(""); }} style={{ color:T.blue, cursor:"pointer", fontWeight:600 }}>Entrar</span></p>
                      </div>
                    ) : (
                      <div>
                        <p style={{ color:T.text, fontSize:14, marginBottom:12, fontWeight:700, textAlign:"center" }}>Entrar</p>
                        <input placeholder="Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                          style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:13, marginBottom:8, outline:"none", boxSizing:"border-box" }} />
                        <input placeholder="Senha" type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && fazerLogin()}
                          style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:13, marginBottom:10, outline:"none", boxSizing:"border-box" }} />
                        {loginErro && <p style={{ color:T.red, fontSize:12, marginBottom:8 }}>{loginErro}</p>}
                        <button onClick={fazerLogin} disabled={loginLoading} style={{ width:"100%", padding:10, borderRadius:8, border:"none", background:T.blue, color:"white", fontSize:13, fontWeight:600, cursor: loginLoading ? "wait" : "pointer", opacity: loginLoading ? 0.6 : 1 }}>{loginLoading ? "Entrando..." : "Entrar"}</button>
                        <p style={{ color:T.muted, fontSize:12, marginTop:10, textAlign:"center" }}>Não tem conta? <span onClick={() => { setTelaCadastro(true); setLoginErro(""); }} style={{ color:T.blue, cursor:"pointer", fontWeight:600 }}>Criar conta</span></p>
                        <p style={{ color:T.muted, fontSize:12, marginTop:6, textAlign:"center" }}><span onClick={async () => {
                          if (!loginEmail) { setLoginErro("Digite o email primeiro"); return; }
                          const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, { redirectTo: window.location.origin });
                          if (error) setLoginErro(error.message);
                          else setLoginErro("Email de recuperação enviado!");
                        }} style={{ color:T.blue, cursor:"pointer", fontWeight:600 }}>Esqueci a senha</span></p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </nav>

        <div style={{ maxWidth:1200, margin:"0 auto", padding:"20px 16px" }}>

          {/* ── HERO ── */}
          <div className="hero-card" style={{
            background: dark ? "linear-gradient(135deg, #0F172A 0%, #1a2744 50%, #0F172A 100%)" : "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 50%, #EFF6FF 100%)",
            borderRadius:20, padding:"24px 28px", marginBottom:20,
            border:`1px solid ${T.border}`, position:"relative", overflow:"hidden"
          }}>
            {/* glow */}
            <div style={{ position:"absolute", top:-60, right:-60, width:200, height:200, borderRadius:"50%", background: isLucroPos ? `radial-gradient(circle, ${T.green}20, transparent 70%)` : `radial-gradient(circle, ${T.red}20, transparent 70%)`, pointerEvents:"none" }} />

            <div className="hero-row" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:16, position:"relative" }}>
              <div>
                <p style={{ fontSize:11, fontWeight:700, letterSpacing:3, color:T.muted, textTransform:"uppercase", marginBottom:6 }}>
                  Tipster · banca base {fmt(BANCA_INICIAL)}
                </p>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:8 }}>
                  {sequencia >= 2 && (
                    <span style={{ fontSize:12, fontWeight:700, padding:"4px 12px", borderRadius:100, background: tipoSeq==="green" ? `${T.green}15` : `${T.red}15`, color: tipoSeq==="green" ? T.green : T.red, border:`1px solid ${tipoSeq==="green" ? T.green : T.red}40` }}>
                      🔥 {sequencia} {tipoSeq==="green" ? "greens" : "reds"} seguidos
                    </span>
                  )}
                  {maxDrawdown > 0 && (
                    <span style={{ fontSize:12, fontWeight:600, padding:"4px 12px", borderRadius:100, background:`${T.red}12`, color:T.red, border:`1px solid ${T.red}30` }}>
                      Drawdown máx: {maxDrawdown.toFixed(1)}%
                    </span>
                  )}
                </div>
                <p style={{ fontSize:13, color:T.muted }}>{apostas.length} bilhetes · {resolvidasSimples.length} resolvidos · {pendentes.length} pendentes</p>
              </div>

              <div style={{ textAlign:"right" }}>
                <div style={{ display:"inline-flex", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:3, marginBottom:8 }}>
                  <button onClick={() => setIncluirBonus(true)} style={{
                    padding:"5px 14px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer", border:"none",
                    background: incluirBonus ? T.green : "transparent",
                    color: incluirBonus ? "#fff" : T.muted,
                    transition:"all 0.2s",
                  }}>Com bônus</button>
                  <button onClick={() => setIncluirBonus(false)} style={{
                    padding:"5px 14px", borderRadius:6, fontSize:11, fontWeight:700, cursor:"pointer", border:"none",
                    background: !incluirBonus ? T.blue : "transparent",
                    color: !incluirBonus ? "#fff" : T.muted,
                    transition:"all 0.2s",
                  }}>Sem bônus</button>
                </div>
                <p style={{ fontSize:11, color:T.muted, textTransform:"uppercase", letterSpacing:2, marginBottom:4 }}>Banca atual</p>
                <p style={{ fontSize:36, fontWeight:900, color: isLucroPos ? T.green : T.red, letterSpacing:-1, lineHeight:1 }}>
                  {fmt(bancaAtual)}
                </p>
                <div style={{ display:"flex", justifyContent:"flex-end", gap:6, marginTop:8, flexWrap:"wrap" }}>
                  <span style={{ fontSize:13, fontWeight:700, padding:"4px 12px", borderRadius:100, background: isLucroPos ? `${T.green}20` : `${T.red}20`, color: isLucroPos ? T.green : T.red, border:`1px solid ${isLucroPos ? T.green : T.red}40` }}>
                    {yieldPct>=0?"+":""}{yieldPct.toFixed(2)}% yield
                  </span>
                  <span style={{ fontSize:13, padding:"4px 12px", borderRadius:100, background:`${T.blue}15`, color:T.blue, border:`1px solid ${T.blue}30` }}>
                    ROI {roiUnidades>=0?"+":""}{roiUnidades.toFixed(1)}u
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── MÉTRICAS ── */}
          <div className="metrics-grid" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))", gap:10, marginBottom:20 }}>
            {[
              { label:"Apostas", valor:String(apostas.length), sub:`${greens.length}G · ${reds.length}R · ${pendentes.length}P`, cor:T.text },
              { label:"Acerto", valor:`${taxaAcerto.toFixed(1)}%`, sub:`${resolvidasSimples.length} resolvidas`, cor: taxaAcerto>=55 ? T.green : taxaAcerto>0 ? T.red : T.text },
              { label:"Yield", valor:`${yieldPct>=0?"+":""}${yieldPct.toFixed(1)}%`, sub:fmt(lucroSimples), cor: lucroSimples>=0 ? T.green : T.red },
              { label:"Odd média", valor:oddMedia.toFixed(2), sub:"apostas simples", cor:T.text },
              { label:"Melhor seq.", valor:`${melhorSeq}G`, sub:"greens seguidos", cor: melhorSeq>=5 ? T.amber : T.text },
              { label:"Drawdown", valor:`${maxDrawdown.toFixed(1)}%`, sub:"queda máxima", cor: maxDrawdown>10 ? T.red : T.text },
              { label:"Bônus", valor:fmt(lucroBonus), sub: pendBonus>0 ? `${pendBonus} pendente${pendBonus>1?"s":""}` : `${greenBonus}G · ${redBonus}R`, cor: lucroBonus>0 ? T.green : T.text },
            ].map(c => (
              <div key={c.label} style={{ borderRadius:14, padding:"14px 16px", background:T.bgCard, border:`1px solid ${T.border}` }}>
                <p style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:T.muted, marginBottom:8 }}>{c.label}</p>
                <p style={{ fontSize:20, fontWeight:800, color:c.cor, letterSpacing:-0.5 }}>{c.valor}</p>
                <p style={{ fontSize:11, color:T.muted, marginTop:2 }}>{c.sub}</p>
              </div>
            ))}
          </div>

          {/* ── ABAS ── */}
          <div style={{ background:T.bgCard, borderRadius:14, border:`1px solid ${T.border}`, marginBottom:16, overflow:"hidden" }}>
            {/* Mobile: dropdown */}
            <div style={{ display:"none" }} className="mobile-aba-select" />
            <div style={{ display:"flex", overflowX:"auto", scrollbarWidth:"none", gap:0 }}>
              {abasMapa.map(t => (
                <button key={t.key} onClick={() => setAba(t.key)} style={{
                  padding:"14px 16px", fontSize:13, fontWeight:700, border:"none",
                  borderBottom: aba===t.key ? `2px solid ${T.blue}` : `2px solid transparent`,
                  background:"transparent", cursor:"pointer", whiteSpace:"nowrap",
                  color: aba===t.key ? T.blue : T.muted,
                  transition:"all 0.15s", flexShrink:0,
                }}>
                  {t.label}{t.count !== undefined ? ` (${t.count})` : ""}
                </button>
              ))}
            </div>
          </div>

          {/* ── ABA RESUMO ── */}
          {aba === "resumo" && (
            <div style={{ display:"flex", flexDirection:"column", gap:16, animation:"fadeIn 0.3s ease" }}>

              {/* Gráfico */}
              {dadosGrafico.length > 1 && (
                <div style={{ borderRadius:16, padding:"20px 16px 12px", background:T.bgCard, border:`1px solid ${T.border}` }}>
                  <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:T.muted, marginBottom:16 }}>Evolução da banca</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={dadosGrafico}>
                      <defs>
                        <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={isLucroPos ? T.green : T.red} stopOpacity={0.25} />
                          <stop offset="100%" stopColor={isLucroPos ? T.green : T.red} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
                      <XAxis dataKey="data" tick={{ fontSize:10, fill:T.muted }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize:10, fill:T.muted }} tickFormatter={v=>`R$${v}`} domain={["auto","auto"]} axisLine={false} tickLine={false} width={72} />
                      <ReferenceLine y={BANCA_INICIAL} stroke={T.subtle} strokeDasharray="4 4" />
                      <Tooltip formatter={(v: any) => [fmt(v),"Banca"]} contentStyle={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:10, fontSize:12, color:T.text }} />
                      <Area type="monotone" dataKey="banca" stroke={isLucroPos ? T.green : T.red} strokeWidth={2.5} fill="url(#g1)" dot={false} activeDot={{ r:4, fill: isLucroPos ? T.green : T.red }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Stats row */}
              <div className="stats-row" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {/* Distribuição */}
                <div style={{ borderRadius:16, padding:20, background:T.bgCard, border:`1px solid ${T.border}` }}>
                  <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:T.muted, marginBottom:16 }}>Distribuição</p>
                  {[
                    { label:"Green", count:greens.length, total:resolvidasSimples.length, cor:T.green },
                    { label:"Red", count:reds.length, total:resolvidasSimples.length, cor:T.red },
                    { label:"Pendente", count:simples.filter(a=>a.resultado==="pendente").length, total:simples.length, cor:T.amber },
                  ].map(r => {
                    const pct = r.total > 0 ? (r.count/r.total*100) : 0;
                    return (
                      <div key={r.label} style={{ marginBottom:14 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                          <span style={{ fontSize:13, color:T.muted, fontWeight:500 }}>{r.label}</span>
                          <span style={{ fontSize:13, fontWeight:700, color:r.cor }}>{r.count} · {pct.toFixed(0)}%</span>
                        </div>
                        <div style={{ height:5, borderRadius:99, background:T.border, overflow:"hidden" }}>
                          <div style={{ width:`${pct}%`, height:"100%", borderRadius:99, background:r.cor, transition:"width 0.6s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Performance por casa */}
                <div style={{ borderRadius:16, padding:20, background:T.bgCard, border:`1px solid ${T.border}` }}>
                  <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:T.muted, marginBottom:16 }}>Por casa</p>
                  {topCasas.length === 0
                    ? <p style={{ color:T.muted, fontSize:13 }}>Sem dados ainda.</p>
                    : topCasas.map(([casa, d]) => (
                      <div key={casa} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingBottom:12, marginBottom:12, borderBottom:`1px solid ${T.border}` }}>
                        <div>
                          <p style={{ fontSize:13, fontWeight:600, color:T.text }}>{casa}</p>
                          <p style={{ fontSize:11, color:T.muted }}>{d.count} apostas · {d.count>0 ? ((d.greens/d.count)*100).toFixed(0) : 0}% acerto</p>
                        </div>
                        <span style={{ fontSize:14, fontWeight:700, color: d.lucro>=0 ? T.green : T.red }}>
                          {d.lucro>=0?"+":""}{fmt(d.lucro)}
                        </span>
                      </div>
                    ))
                  }
                </div>
              </div>

              {/* Bônus + últimas */}
              <div className="bonus-row" style={{ display:"grid", gridTemplateColumns:"260px 1fr", gap:12 }}>
                <div style={{ borderRadius:16, padding:20, background:T.bgCard, border:`1px solid ${T.border}` }}>
                  <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:T.muted, marginBottom:16 }}>Bônus</p>
                  {[
                    { label:"Lucro total", valor:fmt(lucroBonus), cor: lucroBonus>0 ? T.green : T.text },
                    { label:"Convertidos", valor:String(greenBonus), cor:T.green },
                    { label:"Perdidos", valor:String(redBonus), cor:T.red },
                    { label:"Pendentes", valor:String(pendBonus), cor:T.amber },
                  ].map(i => (
                    <div key={i.label} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${T.border}` }}>
                      <span style={{ fontSize:13, color:T.muted }}>{i.label}</span>
                      <span style={{ fontSize:14, fontWeight:700, color:i.cor }}>{i.valor}</span>
                    </div>
                  ))}
                </div>

                <div style={{ borderRadius:16, padding:20, background:T.bgCard, border:`1px solid ${T.border}` }}>
                  <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:T.muted, marginBottom:14 }}>Últimas apostas</p>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {listaSimples.slice(0,6).map(a => {
                      const lucro = lucroCalc(a);
                      const nLegs = a.detalhes?.length ?? 0;
                      const label = nLegs > 1 ? `${labelTipo(nLegs)} · ${a.detalhes![0]?.jogo}` : a.detalhes?.[0]?.jogo ?? "—";
                      return (
                        <div key={a.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, background:T.bg, border:`1px solid ${T.border}` }}>
                          <div style={{ minWidth:40, textAlign:"center" }}>
                            <p style={{ fontSize:12, fontWeight:700, color:T.text }}>{fmtDataCurta(a.data)}</p>
                            <p style={{ fontSize:10, color:T.muted }}>{fmtDiaSemana(a.data)}</p>
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ fontSize:12, color:T.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{label}</p>
                            <p style={{ fontSize:11, color:T.muted }}>{a.casa_aposta} · @{a.odd_total}</p>
                          </div>
                          <ResultadoBadge resultado={a.resultado} T={T} />
                          {a.resultado !== "pendente" && a.resultado !== "void" && (
                            <span style={{ fontSize:13, fontWeight:700, color: lucro>=0 ? T.green : T.red, minWidth:72, textAlign:"right" }}>
            {lucro>=0?"+":""}{fmtBRL(lucro, MOEDA)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── ABA ANÁLISE ── */}
          {aba === "analise" && (() => {
            // ── Dados por visão ──
            const visoes = ["diario","semanal","mensal","anual"] as VisaoAnalise[];
            const labelMap: Record<VisaoAnalise,string> = { diario:"Dia", semanal:"Semana", mensal:"Mês", anual:"Ano" };

            let lucroVisao = 0, apostasResolvidasVisao: Aposta[] = [], diasVisao = 0;
            let dadosGraficoVisao: { data:string; banca:number }[] = [];
            let lucroPorDiaVisao: Record<string, number> = {};
            let tituloPeriodo = "";
            let navAnterior: (() => void) | null = null;
            let navProximo: (() => void) | null = null;

            if (visaoAnalise === "diario") {
              const apostasDia = apostasFiltro.filter(a => a.data === diaAnalise);
              apostasResolvidasVisao = apostasDia.filter(a => a.resultado !== "pendente" && a.resultado !== "void");
              lucroVisao = apostasResolvidasVisao.reduce((s, a) => s + lucroCalc(a), 0);
              tituloPeriodo = new Date(diaAnalise + "T12:00:00").toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
              navAnterior = () => { const d = new Date(diaAnalise + "T12:00:00"); d.setDate(d.getDate()-1); setDiaAnalise(d.toISOString().split("T")[0]); };
              navProximo = () => { const d = new Date(diaAnalise + "T12:00:00"); d.setDate(d.getDate()+1); setDiaAnalise(d.toISOString().split("T")[0]); };
              dadosGraficoVisao = [{ data: diaAnalise.slice(8), banca: BANCA_INICIAL + lucroVisao }];
            } else if (visaoAnalise === "semanal") {
              const dBase = new Date();
              dBase.setDate(dBase.getDate() + semanaOffset * 7);
              const diaSemana = dBase.getDay();
              const inicio = new Date(dBase); inicio.setDate(inicio.getDate() - diaSemana);
              const fim = new Date(inicio); fim.setDate(fim.getDate() + 6);
              tituloPeriodo = `${inicio.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})} – ${fim.toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})}`;
              navAnterior = () => setSemanaOffset(s => s - 1);
              navProximo = () => setSemanaOffset(s => s + 1);
              let acum = BANCA_INICIAL;
              for (let i = 0; i < 7; i++) {
                const d = new Date(inicio); d.setDate(d.getDate() + i);
                const chave = d.toISOString().split("T")[0];
                const luc = apostasFiltro.filter(a => a.data === chave && a.resultado !== "pendente" && a.resultado !== "void").reduce((s, a) => s + lucroCalc(a), 0);
                if (luc !== 0) { acum = parseFloat((acum + luc).toFixed(2)); lucroPorDiaVisao[chave] = luc; }
                dadosGraficoVisao.push({ data: d.toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit"}), banca: acum });
              }
              apostasResolvidasVisao = apostasFiltro.filter(a => {
                const d = new Date(a.data + "T12:00:00");
                return d >= inicio && d <= fim && a.resultado !== "pendente" && a.resultado !== "void";
              });
              lucroVisao = apostasResolvidasVisao.reduce((s, a) => s + lucroCalc(a), 0);
            } else if (visaoAnalise === "mensal") {
              tituloPeriodo = mesAnalise.toLocaleDateString("pt-BR", { month:"long", year:"numeric" });
              navAnterior = () => setMesAnalise(new Date(anoAtual, mesAtual - 1));
              navProximo = () => setMesAnalise(new Date(anoAtual, mesAtual + 1));
              lucroPorDiaVisao = lucroPorDiaMes;
              apostasResolvidasVisao = apostasMesResolvidas;
              lucroVisao = lucroMes;
              dadosGraficoVisao = dadosGraficoMes;
            } else {
              tituloPeriodo = `${anoAtual}`;
              navAnterior = () => setMesAnalise(new Date(anoAtual - 1, mesAtual));
              navProximo = () => setMesAnalise(new Date(anoAtual + 1, mesAtual));
              const mesesNomes = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
              let acum = BANCA_INICIAL;
              for (let m = 0; m < 12; m++) {
                const lucMes = apostasFiltro.filter(a => { const d = new Date(a.data); return d.getMonth() === m && d.getFullYear() === anoAtual && a.resultado !== "pendente" && a.resultado !== "void"; }).reduce((s, a) => s + lucroCalc(a), 0);
                if (lucMes !== 0) acum = parseFloat((acum + lucMes).toFixed(2));
                dadosGraficoVisao.push({ data: mesesNomes[m], banca: acum });
              }
              apostasResolvidasVisao = apostasFiltro.filter(a => { const d = new Date(a.data); return d.getFullYear() === anoAtual && a.resultado !== "pendente" && a.resultado !== "void"; });
              lucroVisao = apostasResolvidasVisao.reduce((s, a) => s + lucroCalc(a), 0);
            }

            diasVisao = new Set(apostasResolvidasVisao.map(a => a.data)).size;
            const mediaVisao = diasVisao > 0 ? lucroVisao / diasVisao : 0;
            const greensVisao = apostasResolvidasVisao.filter(a => a.resultado === "green").length;
            const redsVisao = apostasResolvidasVisao.filter(a => a.resultado === "red").length;
            const taxaVisao = apostasResolvidasVisao.length > 0 ? (greensVisao / apostasResolvidasVisao.length * 100) : 0;
            const melhorDiaVisao = Object.entries(lucroPorDiaVisao).length > 0 ? Object.entries(lucroPorDiaVisao).reduce((a, b) => b[1] > a[1] ? b : a) : null;

            return (
            <div style={{ animation:"fadeIn 0.3s ease" }}>
              {/* Toggle */}
              <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
                {visoes.map(v => (
                  <button key={v} onClick={() => setVisaoAnalise(v)}
                    className={visaoAnalise === v ? "pill-active" : ""}
                    style={{ padding:"8px 18px", borderRadius:100, border:`1px solid ${visaoAnalise === v ? T.blue : T.border}`, background: visaoAnalise === v ? T.blue : "transparent", color: visaoAnalise === v ? "white" : T.muted, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    {labelMap[v]}
                  </button>
                ))}
              </div>

              {/* Navegação */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, marginBottom:16 }}>
                <button onClick={navAnterior!} style={{ background:"none", border:"none", cursor:"pointer", color:T.muted, fontSize:20, padding:4 }}>◀</button>
                <span style={{ fontSize:16, fontWeight:800, color:T.text, minWidth:200, textAlign:"center", textTransform:"capitalize" }}>{tituloPeriodo}</span>
                <button onClick={navProximo!} style={{ background:"none", border:"none", cursor:"pointer", color:T.muted, fontSize:20, padding:4 }}>▶</button>
              </div>

              {/* Cards */}
              <div className="analise-cards" style={{ display:"grid", gridTemplateColumns: visaoAnalise === "diario" ? "repeat(3,1fr)" : "repeat(4,1fr)", gap:10, marginBottom:16 }}>
                <div style={{ padding:"14px", borderRadius:12, background:T.bgCard, border:`1px solid ${T.border}` }}>
                  <p style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1 }}>Faturamento</p>
                  <p style={{ fontSize:20, fontWeight:800, color: lucroVisao >= 0 ? T.green : T.red, marginTop:4 }}>{lucroVisao >= 0 ? "+" : ""}{fmt(lucroVisao)}</p>
                </div>
                {visaoAnalise !== "diario" && (
                  <div style={{ padding:"14px", borderRadius:12, background:T.bgCard, border:`1px solid ${T.border}` }}>
                    <p style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1 }}>Média/dia</p>
                    <p style={{ fontSize:20, fontWeight:800, color: mediaVisao >= 0 ? T.green : T.red, marginTop:4 }}>{mediaVisao >= 0 ? "+" : ""}{fmt(mediaVisao)}</p>
                    <p style={{ fontSize:11, color:T.muted, marginTop:2 }}>{diasVisao} dias</p>
                  </div>
                )}
                <div style={{ padding:"14px", borderRadius:12, background:T.bgCard, border:`1px solid ${T.border}` }}>
                  <p style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1 }}>Acerto</p>
                  <p style={{ fontSize:20, fontWeight:800, color:T.text, marginTop:4 }}>{taxaVisao.toFixed(0)}%</p>
                  <p style={{ fontSize:11, color:T.muted, marginTop:2 }}>{greensVisao}W / {redsVisao}L</p>
                </div>
                {melhorDiaVisao && (
                  <div style={{ padding:"14px", borderRadius:12, background:T.bgCard, border:`1px solid ${T.border}` }}>
                    <p style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1 }}>Melhor dia</p>
                    <p style={{ fontSize:16, fontWeight:800, color:T.green, marginTop:4 }}>{fmt(melhorDiaVisao[1])}</p>
                    <p style={{ fontSize:11, color:T.muted, marginTop:2 }}>{melhorDiaVisao[0].slice(5)}</p>
                  </div>
                )}
                {visaoAnalise === "mensal" && (
                  <div style={{ padding:"14px", borderRadius:12, background:T.bgCard, border:`1px solid ${T.border}` }}>
                    <p style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1 }}>Streak</p>
                    <p style={{ fontSize:20, fontWeight:800, color: streakTipoCalc === "green" ? T.green : streakTipoCalc === "red" ? T.red : T.muted, marginTop:4 }}>
                      {streakDias > 0 ? `${streakDias} dias ${streakTipoCalc === "green" ? "🔥" : "💀"}` : "—"}
                    </p>
                  </div>
                )}
              </div>

              {/* Gráfico */}
              {dadosGraficoVisao.length > 1 && (
                <div style={{ padding:"16px", borderRadius:14, background:T.bgCard, border:`1px solid ${T.border}`, marginBottom:16 }}>
                  <p style={{ fontSize:12, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Evolução da Banca</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={dadosGraficoVisao}>
                      <defs>
                        <linearGradient id="gAnalise" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={lucroVisao >= 0 ? T.green : T.red} stopOpacity={0.3}/>
                          <stop offset="95%" stopColor={lucroVisao >= 0 ? T.green : T.red} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                      <XAxis dataKey="data" tick={{ fontSize:10, fill:T.muted }} interval={visaoAnalise === "anual" ? 0 : 6} />
                      <YAxis tick={{ fontSize:10, fill:T.muted }} tickFormatter={v => `R$${v}`} width={60} />
                      <ReferenceLine y={BANCA_INICIAL} stroke={T.muted} strokeDasharray="4 4" />
                      <Tooltip contentStyle={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:10, fontSize:12, color:T.text }} formatter={(v) => [`R$ ${Number(v).toFixed(2)}`, "Banca"]} />
                      <Area type="monotone" dataKey="banca" stroke={lucroVisao >= 0 ? T.green : T.red} fill="url(#gAnalise)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* ── DIÁRIO: Lista de apostas ── */}
              {visaoAnalise === "diario" && (
                <div style={{ padding:"16px", borderRadius:14, background:T.bgCard, border:`1px solid ${T.border}` }}>
                  {apostasFiltro.filter(a => a.data === diaAnalise).length === 0 ? (
                    <p style={{ fontSize:13, color:T.muted, textAlign:"center", padding:20 }}>Nenhuma aposta neste dia</p>
                  ) : apostasFiltro.filter(a => a.data === diaAnalise).map(a => (
                    <div key={a.id} style={{ padding:"10px 12px", borderRadius:10, background:T.bg, border:`1px solid ${T.border}`, marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:13, fontWeight:700, color:T.text }}>{a.casa_aposta}</span>
                        <ResultadoBadge resultado={a.resultado} T={T} />
                      </div>
                      <p style={{ fontSize:12, color:T.muted, marginTop:4 }}>@{a.odd_total} · {a.stake_unidades ?? "?"}u · {a.tipo}</p>
                      {a.detalhes?.map(d => (
                        <p key={d.id} style={{ fontSize:11, color:T.subtle, marginTop:2 }}>→ {d.jogo} | {d.mercado} | {d.selecao} ({d.odd_parcial})</p>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* ── SEMANAL: Barras dos 7 dias ── */}
              {visaoAnalise === "semanal" && (() => {
                const dBase = new Date(); dBase.setDate(dBase.getDate() + semanaOffset * 7);
                const diaSemana = dBase.getDay();
                const inicio = new Date(dBase); inicio.setDate(inicio.getDate() - diaSemana);
                const maxVal = Math.max(...Object.values(lucroPorDiaVisao).map(Math.abs), 1);
                return (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:6 }}>
                    {Array.from({ length:7 }, (_, i) => {
                      const d = new Date(inicio); d.setDate(d.getDate() + i);
                      const chave = d.toISOString().split("T")[0];
                      const luc = lucroPorDiaVisao[chave] ?? 0;
                      const pct = Math.min(Math.abs(luc) / maxVal * 100, 100);
                      const isToday = chave === hoje;
                      return (
                        <div key={i} onClick={() => { setDiaAnalise(chave); setVisaoAnalise("diario"); }}
                          style={{ padding:"10px 6px", borderRadius:10, background:T.bgCard, border:`1px solid ${isToday ? T.blue : T.border}`, textAlign:"center", cursor:"pointer" }}>
                          <p style={{ fontSize:10, fontWeight:700, color:T.muted, marginBottom:4 }}>{d.toLocaleDateString("pt-BR",{weekday:"short"})}</p>
                          <p style={{ fontSize:11, fontWeight:700, color:T.text }}>{d.getDate()}</p>
                          {luc !== 0 ? (
                            <div style={{ height:4, borderRadius:2, background:T.border, marginTop:6, overflow:"hidden" }}>
                              <div style={{ height:"100%", width:`${pct}%`, borderRadius:2, background: luc >= 0 ? T.green : T.red }} />
                            </div>
                          ) : <div style={{ height:4, background:T.border, borderRadius:2, marginTop:6 }} />}
                          <p style={{ fontSize:10, fontWeight:600, color: luc > 0 ? T.green : luc < 0 ? T.red : T.muted, marginTop:4 }}>
                            {luc !== 0 ? `${luc >= 0 ? "+" : ""}${luc.toFixed(0)}` : "—"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ── MENSAL: Calendário heatmap ── */}
              {visaoAnalise === "mensal" && (
                <div className="analise-layout" style={{ display:"flex", gap:16 }}>
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:12, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Calendário</p>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
                      {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d => (
                        <div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:700, color:T.muted, padding:4 }}>{d}</div>
                      ))}
                      {(() => {
                        const primeiroDia = new Date(anoAtual, mesAtual, 1).getDay();
                        const diasNoMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
                        const cells: React.ReactNode[] = [];
                        for (let i = 0; i < primeiroDia; i++) cells.push(<div key={`empty-${i}`} />);
                        const maxLucro = diasLucro.length > 0 ? Math.max(...diasLucro.map(([,v]) => Math.abs(v)), 1) : 1;
                        for (let d = 1; d <= diasNoMes; d++) {
                          const chave = `${anoAtual}-${String(mesAtual+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                          const luc = lucroPorDiaMes[chave] ?? null;
                          const ehHoje = chave === hoje;
                          const apostasDia = apostasFiltro.filter(a => a.data === chave);
                          let bg = T.border;
                          if (luc !== null) {
                            const intensidade = Math.min(Math.abs(luc) / maxLucro, 1);
                            bg = luc >= 0 ? `rgba(34,197,94,${0.15 + intensidade * 0.6})` : `rgba(239,68,68,${0.15 + intensidade * 0.6})`;
                          }
                          cells.push(
                            <div key={d} className="cal-cell"
                              onClick={() => setDiaSelecionado(diaSelecionado === chave ? null : chave)}
                              onMouseEnter={(e) => { if (luc !== null) { const r = e.currentTarget.getBoundingClientRect(); setTooltipDia({ x:r.left+r.width/2, y:r.top-8, data:chave, valor:luc, apostas:apostasDia }); }}}
                              onMouseLeave={() => setTooltipDia(null)}
                              style={{ aspectRatio:"1", borderRadius:8, background:bg, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", border: ehHoje ? `2px solid ${T.blue}` : diaSelecionado === chave ? `2px solid ${T.text}` : "2px solid transparent" }}>
                              <span style={{ fontSize:11, fontWeight:700, color:T.text }}>{d}</span>
                              {luc !== null && <span style={{ fontSize:8, fontWeight:600, color: luc >= 0 ? "#22c55e" : "#ef4444" }}>{luc >= 0 ? "+" : ""}{luc.toFixed(0)}</span>}
                            </div>
                          );
                        }
                        return cells;
                      })()}
                    </div>
                  </div>
                  <div className="analise-side" style={{ width:280, flexShrink:0 }}>
                    {diaSelecionado ? (() => {
                      const apostasDia = apostasFiltro.filter(a => a.data === diaSelecionado);
                      const lucroDia = apostasDia.filter(a => a.resultado !== "pendente" && a.resultado !== "void").reduce((s, a) => s + lucroCalc(a), 0);
                      return (
                        <div style={{ padding:"16px", borderRadius:14, background:T.bgCard, border:`1px solid ${T.border}`, animation:"fadeIn 0.2s ease" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                            <p style={{ fontSize:14, fontWeight:800, color:T.text }}>{new Date(diaSelecionado+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"short"})}</p>
                            <button onClick={() => setDiaSelecionado(null)} style={{ background:"none", border:"none", cursor:"pointer", color:T.muted, fontSize:16 }}>✕</button>
                          </div>
                          <p style={{ fontSize:18, fontWeight:800, color: lucroDia >= 0 ? T.green : T.red, marginBottom:12 }}>{lucroDia >= 0 ? "+" : ""}{fmt(lucroDia)}</p>
                          {apostasDia.map(a => (
                            <div key={a.id} style={{ padding:"8px 10px", borderRadius:8, background:T.bg, border:`1px solid ${T.border}`, marginBottom:6 }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                <span style={{ fontSize:12, fontWeight:600, color:T.text }}>{a.casa_aposta}</span>
                                <ResultadoBadge resultado={a.resultado} T={T} />
                              </div>
                              <p style={{ fontSize:11, color:T.muted, marginTop:2 }}>@{a.odd_total} · {a.stake_unidades ?? "?"}u</p>
                            </div>
                          ))}
                        </div>
                      );
                    })() : (
                      <div style={{ padding:"16px", borderRadius:14, background:T.bgCard, border:`1px solid ${T.border}`, textAlign:"center" }}>
                        <p style={{ fontSize:13, color:T.muted }}>Selecione um dia</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── ANUAL: 12 meses heatmap ── */}
              {visaoAnalise === "anual" && (() => {
                const mesesNomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
                const lucrosMeses = Array.from({ length:12 }, (_, m) => {
                  return apostasFiltro.filter(a => { const d = new Date(a.data); return d.getMonth() === m && d.getFullYear() === anoAtual && a.resultado !== "pendente" && a.resultado !== "void"; }).reduce((s, a) => s + lucroCalc(a), 0);
                });
                const maxLucroAno = Math.max(...lucrosMeses.map(Math.abs), 1);
                return (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                    {lucrosMeses.map((luc, m) => {
                      const intensidade = luc !== 0 ? Math.min(Math.abs(luc) / maxLucroAno, 1) : 0;
                      const bg = luc === 0 ? T.border : luc > 0 ? `rgba(34,197,94,${0.15 + intensidade * 0.6})` : `rgba(239,68,68,${0.15 + intensidade * 0.6})`;
                      const apostasMesAno = apostasFiltro.filter(a => { const d = new Date(a.data); return d.getMonth() === m && d.getFullYear() === anoAtual; });
                      return (
                        <div key={m} onClick={() => { setMesAnalise(new Date(anoAtual, m)); setVisaoAnalise("mensal"); }}
                          className="cal-cell" style={{ padding:"14px", borderRadius:12, background:bg, border:`1px solid ${T.border}`, cursor:"pointer" }}>
                          <p style={{ fontSize:12, fontWeight:700, color:T.text }}>{mesesNomes[m].slice(0,3)}</p>
                          <p style={{ fontSize:18, fontWeight:800, color: luc > 0 ? T.green : luc < 0 ? T.red : T.muted, marginTop:4 }}>
                            {luc !== 0 ? `${luc >= 0 ? "+" : ""}${luc.toFixed(0)}` : "—"}
                          </p>
                          <p style={{ fontSize:10, color:T.muted, marginTop:2 }}>{apostasMesAno.length} aposta(s)</p>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Tooltip */}
              {tooltipDia && (
                <div style={{ position:"fixed", left:tooltipDia.x, top:tooltipDia.y, transform:"translate(-50%,-100%)", background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:8, padding:"8px 12px", fontSize:12, color:T.text, zIndex:999, pointerEvents:"none", boxShadow:"0 4px 12px rgba(0,0,0,0.3)" }}>
                  <p style={{ fontWeight:700 }}>{new Date(tooltipDia.data+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})}</p>
                  <p style={{ color: tooltipDia.valor >= 0 ? T.green : T.red, fontWeight:800 }}>{tooltipDia.valor >= 0 ? "+" : ""}{fmt(tooltipDia.valor)}</p>
                  <p style={{ color:T.muted, fontSize:11 }}>{tooltipDia.apostas.length} aposta(s)</p>
                </div>
              )}
            </div>
            );
          })()}

          {/* ── ABA TODAS ── */}
          {aba === "todas" && (
            <div style={{ display:"flex", flexDirection:"column", gap:8, animation:"fadeIn 0.3s ease" }}>
              {apostas.length === 0 && (
                <div style={{ textAlign:"center", padding:"60px 0", color:T.muted }}>
                  <p style={{ fontSize:32, marginBottom:8 }}>📋</p>
                  <p style={{ fontSize:14 }}>Nenhuma aposta registrada.</p>
                </div>
              )}
              {[...apostas].sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at)).map(aposta => (
                <CardAposta key={aposta.id} aposta={aposta} bancaMomentoCalc={bancaMomentoCalc}
                  expandido={expandido} setExpandido={setExpandido}
                  editando={editando} setEditando={setEditando}
                  salvarResultado={salvarResultado} excluirAposta={excluirAposta} salvando={salvando} T={T} moeda={MOEDA}
                  podeEditar={!!userLogado} onEditarAposta={abrirEditarAposta} />
              ))}
            </div>
          )}

          {/* ── ABA PENDENTES ── */}
          {aba === "pendentes" && (
            <div style={{ display:"flex", flexDirection:"column", gap:8, animation:"fadeIn 0.3s ease" }}>
              {pendentes.length === 0 && (
                <div style={{ textAlign:"center", padding:"60px 0", color:T.muted }}>
                  <p style={{ fontSize:32, marginBottom:8 }}>✅</p>
                  <p style={{ fontSize:14 }}>Nenhuma aposta pendente.</p>
                </div>
              )}
              {[...pendentes].reverse().map(aposta => (
                <CardAposta key={aposta.id} aposta={aposta} bancaMomentoCalc={bancaMomentoCalc}
                  expandido={expandido} setExpandido={setExpandido}
                  editando={editando} setEditando={setEditando}
                  salvarResultado={salvarResultado} excluirAposta={excluirAposta} salvando={salvando} T={T} moeda={MOEDA}
                  podeEditar={!!userLogado} onEditarAposta={abrirEditarAposta} />
              ))}
            </div>
          )}

          {/* ── ABAS DE BILHETES ── */}
          {(["simples","duplas","triplas","combinadas"] as Aba[]).includes(aba) && (() => {
            const mapa: Record<string, Aposta[]> = {
              simples: [...simplesUm].reverse(),
              duplas: [...simplesDupla].reverse(),
              triplas: [...simplesTripla].reverse(),
              combinadas: [...simplesCombinada].reverse(),
            };
            const lista = mapa[aba] ?? [];
            return (
              <div style={{ display:"flex", flexDirection:"column", gap:8, animation:"fadeIn 0.3s ease" }}>
                {lista.length === 0 && (
                  <div style={{ textAlign:"center", padding:"60px 0", color:T.muted }}>
                    <p style={{ fontSize:32, marginBottom:8 }}>🎯</p>
                    <p style={{ fontSize:14 }}>Nenhuma aposta {aba.slice(0,-1)} ainda.</p>
                  </div>
                )}
                {lista.map(aposta => (
                <CardAposta key={aposta.id} aposta={aposta} bancaMomentoCalc={bancaMomentoCalc}
                  expandido={expandido} setExpandido={setExpandido}
                  editando={editando} setEditando={setEditando}
                  salvarResultado={salvarResultado} excluirAposta={excluirAposta} salvando={salvando} T={T} moeda={MOEDA}
                  podeEditar={!!userLogado} onEditarAposta={abrirEditarAposta} />
              ))}

              </div>
            );
          })()}

          {/* ── ABA BÔNUS ── */}
          {aba === "bonus" && (
            <div style={{ display:"flex", flexDirection:"column", gap:10, animation:"fadeIn 0.3s ease" }}>
              {listaBonus.length > 0 && (
                <div className="bonus-stats-grid" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:6 }}>
                  {[
                    { label:"Total", valor:String(bonus.length), cor:T.text },
                    { label:"Convertidos", valor:String(greenBonus), cor:T.green },
                    { label:"Perdidos", valor:String(redBonus), cor:T.red },
                    { label:"Lucro total", valor:fmt(lucroBonus), cor: lucroBonus>0 ? T.green : T.text },
                  ].map(c => (
                    <div key={c.label} style={{ borderRadius:12, padding:"14px 16px", background:T.bgCard, border:`1px solid ${T.border}` }}>
                      <p style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:T.muted, marginBottom:6 }}>{c.label}</p>
                      <p style={{ fontSize:20, fontWeight:800, color:c.cor }}>{c.valor}</p>
                    </div>
                  ))}
                </div>
              )}
              {listaBonus.length === 0 && (
                <div style={{ textAlign:"center", padding:"60px 0", color:T.muted }}>
                  <p style={{ fontSize:32, marginBottom:8 }}>🎁</p>
                  <p style={{ fontSize:14 }}>Nenhum bônus registrado ainda.</p>
                </div>
              )}
              {listaBonus.map(aposta => (
                <CardAposta key={aposta.id} aposta={aposta} bancaMomentoCalc={{}}
                  expandido={expandido} setExpandido={setExpandido}
                  editando={editando} setEditando={setEditando}
                  salvarResultado={salvarResultado} excluirAposta={excluirAposta} salvando={salvando} T={T} moeda={MOEDA}
                  podeEditar={!!userLogado} onEditarAposta={abrirEditarAposta} />
              ))}
            </div>
          )}

          {/* ── ABA PROGRAMAÇÃO ── */}
          {aba === "programacao" && (
            <div style={{ display:"flex", flexDirection:"column", gap:16, animation:"fadeIn 0.3s ease" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:T.muted }}>Programação semanal de bônus</p>
                {isAdmin && <button onClick={abrirNovaProgramacao} style={{ padding:"8px 16px", borderRadius:8, border:"none", background:T.blue, color:"white", fontSize:12, fontWeight:700, cursor:"pointer" }}>+ Nova</button>}
              </div>
              <div className="prog-grid" style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:8 }}>
                {DIAS_SEMANA.map(dia => {
                  const itens = programacao.filter(p => p.dia_semana === dia);
                  return (
                    <div key={dia} style={{ borderRadius:12, padding:"12px 10px", background:T.bgCard, border:`1px solid ${itens.length>0 ? T.blue+"40" : T.border}`, minHeight:90 }}>
                      <p style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color: itens.length>0 ? T.blue : T.muted, marginBottom:8 }}>{DIAS_LABEL[dia]}</p>
                      {itens.length === 0 && <p style={{ fontSize:11, color:T.subtle }}>—</p>}
                      {itens.map(p => (
                        <div key={p.id} style={{ padding:"8px", borderRadius:8, marginBottom:6, background:T.bg, border:`1px solid ${T.border}`, cursor: isAdmin ? "pointer" : "default" }} onClick={() => isAdmin && abrirEditarProgramacao(p)}>
                          <div style={{ display:"flex", justifyContent:"space-between" }}>
                            <span style={{ fontSize:11, fontWeight:700, color:T.text }}>{p.casa}</span>
                            {isAdmin && <span onClick={e => { e.stopPropagation(); excluirProgramacao(p.id); }} style={{ fontSize:10, color:T.red, cursor:"pointer", fontWeight:700 }}>✕</span>}
                          </div>
                          <p style={{ fontSize:13, fontWeight:800, color:T.green, marginTop:4 }}>{fmt(p.valor)}</p>
                          {p.observacao && <p style={{ fontSize:10, color:T.muted, marginTop:2 }}>{p.observacao}</p>}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── MODAL PROGRAMAÇÃO ── */}
        {modalProgramacao && (
          <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.7)", backdropFilter:"blur(6px)", padding:20 }} onClick={() => setModalProgramacao(false)}>
            <div style={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:18, width:"100%", maxWidth:400, padding:"24px 28px" }} onClick={e => e.stopPropagation()}>
              <h2 style={{ fontSize:17, fontWeight:800, color:T.text, marginBottom:20 }}>{editProgramacao ? "Editar" : "Nova"} Programação</h2>
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:4 }}>Casa</label>
                  <select value={formProg.casa} onChange={e => setFormProg(f=>({...f,casa:e.target.value}))}>
                    {CASAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:4 }}>Dia</label>
                  <select value={formProg.dia_semana} onChange={e => setFormProg(f=>({...f,dia_semana:e.target.value}))}>
                    {DIAS_SEMANA.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase()+d.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:4 }}>Valor (R$)</label>
                  <input type="number" value={formProg.valor} onChange={e => setFormProg(f=>({...f,valor:e.target.value}))} placeholder="0,00" />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:4 }}>Observação</label>
                  <input type="text" value={formProg.observacao} onChange={e => setFormProg(f=>({...f,observacao:e.target.value}))} placeholder="Opcional..." />
                </div>
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:22 }}>
                <button onClick={() => setModalProgramacao(false)} style={{ padding:"10px 20px", borderRadius:10, border:`1px solid ${T.border}`, cursor:"pointer", background:"transparent", color:T.muted, fontSize:13, fontWeight:600 }}>Cancelar</button>
                <button onClick={salvarProgramacao} style={{ padding:"10px 20px", borderRadius:10, border:"none", cursor:"pointer", background:T.blue, color:"white", fontSize:13, fontWeight:700 }}>{editProgramacao ? "Salvar" : "Adicionar"}</button>
              </div>
            </div>
          </div>
        )}

          {/* ── ABA TELEGRAM ── */}
          {aba === "telegram" && userLogado && (
            <div style={{ display:"flex", flexDirection:"column", gap:10, animation:"fadeIn 0.3s ease" }}>
              <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:T.muted }}>Mensagens do Telegram</p>
              {telegramMsgs.length === 0 && (
                <div style={{ textAlign:"center", padding:"60px 0", color:T.muted }}>
                  <p style={{ fontSize:32, marginBottom:8 }}>📨</p>
                  <p style={{ fontSize:14 }}>Nenhuma mensagem recebida.</p>
                </div>
              )}
              {telegramMsgs.map(msg => (
                <div key={msg.id} style={{ borderRadius:12, padding:"14px 16px", background:T.bgCard, border:`1px solid ${msg.status === "pendente" ? T.amber : msg.status === "confirmado" ? T.green : T.border}`, display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:T.text }}>{msg.nome}</span>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:100, fontWeight:700,
                        background: msg.status === "pendente" ? `${T.amber}18` : msg.status === "confirmado" ? `${T.green}18` : `${T.red}18`,
                        color: msg.status === "pendente" ? T.amber : msg.status === "confirmado" ? T.green : T.red,
                      }}>{msg.status}</span>
                      <span style={{ fontSize:10, color:T.muted }}>{new Date(msg.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                    {msg.foto_file_id && <p style={{ fontSize:12, color:T.blue, marginBottom:4 }}>📷 Foto recebida</p>}
                    {msg.texto && <p style={{ fontSize:13, color:T.text }}>{msg.texto}</p>}
                  </div>
                  {msg.status === "pendente" && (
                    <button onClick={() => abrirConfirmacao(msg)} style={{ padding:"8px 16px", borderRadius:8, border:"none", background:T.blue, color:"white", fontSize:12, fontWeight:700, cursor:"pointer", flexShrink:0 }}>
                      Visualizar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── ABA USUÁRIOS (admin) ── */}
          {aba === "usuarios" && isAdmin && !clienteSelecionado && (
            <div style={{ display:"flex", flexDirection:"column", gap:10, animation:"fadeIn 0.3s ease" }}>
              <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:T.muted }}>Usuários cadastrados ({usuarios.length})</p>
              {loadingUsuarios && (
                <div style={{ textAlign:"center", padding:"60px 0", color:T.muted }}>
                  <p style={{ fontSize:14 }}>Carregando...</p>
                </div>
              )}
              {!loadingUsuarios && usuarios.length === 0 && (
                <div style={{ textAlign:"center", padding:"60px 0", color:T.muted }}>
                  <p style={{ fontSize:32, marginBottom:8 }}>👥</p>
                  <p style={{ fontSize:14 }}>Nenhum usuário cadastrado ainda.</p>
                </div>
              )}
              {!loadingUsuarios && usuarios.map(u => (
                <div key={u.id} onClick={() => { setClienteSelecionado(u.id); setFiltroResultado("todos"); setFiltroCasaCliente("todas"); setFiltroOrigemCliente("todas"); setFiltroMesCliente(""); }}
                  style={{ borderRadius:12, padding:"14px 16px", background:T.bgCard, border:`1px solid ${T.border}`, cursor:"pointer" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8, marginBottom:10 }}>
                    <div>
                      <p style={{ fontSize:14, fontWeight:800, color:T.text }}>{u.nome || "(sem nome)"}</p>
                      <p style={{ fontSize:11, color:T.muted }}>Cadastrado em {new Date(u.created_at).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:100, background:`${T.blue}18`, color:T.blue }}>{u.moeda}</span>
                      <button style={{ padding:"6px 12px", borderRadius:8, border:"none", background:T.blue, color:"white", fontSize:12, fontWeight:700, cursor:"pointer" }}>Ver apostas →</button>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(110px, 1fr))", gap:8 }}>
                    {[
                      { label:"Banca inicial", valor:fmtBRL(u.banca_inicial, u.moeda) },
                      { label:"Banca atual", valor:fmtBRL(u.bancaAtual, u.moeda), cor: u.lucroTotal >= 0 ? T.green : T.red },
                      { label:"Lucro", valor:(u.lucroTotal>=0?"+":"") + fmtBRL(u.lucroTotal, u.moeda), cor: u.lucroTotal >= 0 ? T.green : T.red },
                      { label:"Apostas", valor:String(u.totalApostas) },
                      { label:"Resolvidas", valor:`${u.resolvidas} (${u.greens}G ${u.reds}R)` },
                      { label:"Pendentes", valor:String(u.pendentes) },
                      { label:"Origem", valor:`✈️ ${u.viaTelegram} · ✍️ ${u.viaManual}` },
                    ].map((c,i) => (
                      <div key={i} style={{ padding:"6px 10px", borderRadius:8, background:T.bg, border:`1px solid ${T.border}` }}>
                        <span style={{ fontSize:9, color:T.muted, display:"block", marginBottom:1, textTransform:"uppercase", letterSpacing:0.5 }}>{c.label}</span>
                        <span style={{ fontSize:12, fontWeight:700, color:c.cor || T.text }}>{c.valor}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── ABA USUÁRIOS: detalhe de um cliente ── */}
          {aba === "usuarios" && isAdmin && clienteSelecionado && (() => {
            const cliente = usuarios.find(u => u.id === clienteSelecionado);
            const listaCliente = apostasPorUsuario[clienteSelecionado] ?? [];
            const casasCliente = Array.from(new Set(listaCliente.map(a => a.casa_aposta).filter(Boolean)));
            const bancaMomentoCliente: Record<string, number> = {};
            let bancaAcumCliente = cliente?.banca_inicial ?? BANCA_INICIAL_DEFAULT;
            for (const a of listaCliente) {
              bancaMomentoCliente[a.id] = bancaAcumCliente;
              if (a.resultado !== "pendente" && a.resultado !== "void") {
                bancaAcumCliente = parseFloat((bancaAcumCliente + calcularLucro(a, bancaAcumCliente)).toFixed(2));
              }
            }
            const listaFiltrada = [...listaCliente].reverse().filter(a => {
              if (filtroResultado !== "todos" && a.resultado !== filtroResultado) return false;
              if (filtroCasaCliente !== "todas" && a.casa_aposta !== filtroCasaCliente) return false;
              if (filtroOrigemCliente !== "todas" && (a.origem || "desconhecido") !== filtroOrigemCliente) return false;
              if (filtroMesCliente && !a.data.startsWith(filtroMesCliente)) return false;
              return true;
            });
            return (
              <div style={{ display:"flex", flexDirection:"column", gap:10, animation:"fadeIn 0.3s ease" }}>
                <button onClick={() => setClienteSelecionado(null)} style={{ alignSelf:"flex-start", padding:"6px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.muted, fontSize:12, fontWeight:700, cursor:"pointer" }}>← Voltar</button>
                <p style={{ fontSize:14, fontWeight:800, color:T.text }}>{cliente?.nome || "(sem nome)"} · {listaFiltrada.length} de {listaCliente.length} apostas</p>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  <select value={filtroResultado} onChange={e => setFiltroResultado(e.target.value)} style={{ padding:"7px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:12 }}>
                    <option value="todos">Resultado: todos</option>
                    <option value="green">Green</option>
                    <option value="red">Red</option>
                    <option value="pendente">Pendente</option>
                    <option value="void">Void</option>
                  </select>
                  <select value={filtroCasaCliente} onChange={e => setFiltroCasaCliente(e.target.value)} style={{ padding:"7px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:12 }}>
                    <option value="todas">Casa: todas</option>
                    {casasCliente.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={filtroOrigemCliente} onChange={e => setFiltroOrigemCliente(e.target.value)} style={{ padding:"7px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:12 }}>
                    <option value="todas">Origem: todas</option>
                    <option value="telegram">✈️ Telegram</option>
                    <option value="manual">✍️ Manual</option>
                    <option value="desconhecido">Desconhecida</option>
                  </select>
                  <input type="month" value={filtroMesCliente} onChange={e => setFiltroMesCliente(e.target.value)} style={{ padding:"7px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:12 }} />
                  {(filtroResultado !== "todos" || filtroCasaCliente !== "todas" || filtroOrigemCliente !== "todas" || filtroMesCliente) && (
                    <button onClick={() => { setFiltroResultado("todos"); setFiltroCasaCliente("todas"); setFiltroOrigemCliente("todas"); setFiltroMesCliente(""); }} style={{ padding:"7px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.muted, fontSize:12, cursor:"pointer" }}>Limpar filtros</button>
                  )}
                </div>
                {listaFiltrada.length === 0 && (
                  <div style={{ textAlign:"center", padding:"60px 0", color:T.muted }}>
                    <p style={{ fontSize:32, marginBottom:8 }}>🔍</p>
                    <p style={{ fontSize:14 }}>Nenhuma aposta com esses filtros.</p>
                  </div>
                )}
                {listaFiltrada.map(aposta => (
                  <CardAposta key={aposta.id} aposta={aposta} bancaMomentoCalc={bancaMomentoCliente}
                    expandido={expandido} setExpandido={setExpandido}
                    editando={editando} setEditando={setEditando}
                    salvarResultado={salvarResultado} excluirAposta={excluirAposta} salvando={salvando} T={T} moeda={cliente?.moeda}
                    podeEditar={false} />
                ))}
              </div>
            );
          })()}

          {/* ── MODAL CONFIRMAÇÃO TELEGRAM ── */}
        {modalTelegram && msgSelecionada && (
          <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.7)", backdropFilter:"blur(6px)", padding:20 }} onClick={() => setModalTelegram(false)}>
            <div style={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:18, width:"100%", maxWidth:480, padding:"24px 28px" }} onClick={e => e.stopPropagation()}>
              <h2 style={{ fontSize:17, fontWeight:800, color:T.text, marginBottom:6 }}>Confirmar mensagem</h2>
              <p style={{ fontSize:12, color:T.muted, marginBottom:16 }}>De: <b>{msgSelecionada.nome}</b> · {new Date(msgSelecionada.created_at).toLocaleString("pt-BR")}</p>

              {editBilhete && !editMode ? (
                <div style={{ marginBottom:16 }}>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:10 }}>
                    <span style={{ fontSize:12, padding:"4px 10px", borderRadius:6, background:T.bg, border:`1px solid ${T.border}`, color:T.text }}>📅 {editBilhete.data || "sem data"}</span>
                    <span style={{ fontSize:12, padding:"4px 10px", borderRadius:6, background:T.bg, border:`1px solid ${T.border}`, color:T.text }}>🏢 {editBilhete.casa_aposta || "—"}</span>
                    <span style={{ fontSize:12, padding:"4px 10px", borderRadius:6, background:T.bg, border:`1px solid ${T.border}`, color:T.text }}>🎯 {editBilhete.stake_unidades != null ? (editBilhete.stake_tipo === "valor" ? fmtBRL(editBilhete.stake_unidades, MOEDA) : editBilhete.stake_unidades + "u") : "—"}</span>
                    <span style={{ fontSize:12, padding:"4px 10px", borderRadius:6, background:T.bg, border:`1px solid ${T.border}`, color:T.text }}>📊 {editBilhete.odd_total}</span>
                    <span style={{ fontSize:12, padding:"4px 10px", borderRadius:6, background:`${T.blue}18`, border:`1px solid ${T.blue}40`, color:T.blue }}>{editBilhete.pernas?.length ?? 0} perna(s)</span>
                  </div>
                  {editBilhete.pernas?.map((p, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:8, background:T.bg, border:`1px solid ${T.border}`, marginBottom:4, fontSize:12, color:T.text }}>
                      <span style={{ fontWeight:700, color:T.muted, minWidth:18 }}>{i + 1}.</span>
                      <span style={{ flex:1 }}>{p.jogo || "—"}</span>
                      <span style={{ color:T.muted }}>{p.mercado}</span>
                      <span style={{ fontWeight:600 }}>{p.selecao}</span>
                      <span style={{ fontWeight:700, color:T.green }}>{p.odd_parcial}</span>
                    </div>
                  ))}
                  {msgSelecionada.foto_file_id && (
                    <a href={`https://api.telegram.org/file/bot${import.meta.env.VITE_TELEGRAM_BOT_TOKEN||""}/${msgSelecionada.foto_file_id}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ display:"block", textAlign:"center", fontSize:11, color:T.blue, marginTop:8, textDecoration:"underline", cursor:"pointer" }}>
                      Ver imagem original
                    </a>
                  )}
                </div>
              ) : editBilhete && editMode ? (
                <div style={{ marginBottom:16 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                    <div>
                      <label style={{ fontSize:10, fontWeight:700, color:T.muted }}>DATA</label>
                      <input type="date" value={editBilhete.data||""} onChange={e => setEditBilhete({...editBilhete, data:e.target.value||null})} style={{ width:"100%", padding:"7px 9px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:12, boxSizing:"border-box" }}/>
                    </div>
                    <div>
                      <label style={{ fontSize:10, fontWeight:700, color:T.muted }}>CASA</label>
                      <input type="text" placeholder="Ex: 22BET" value={editBilhete.casa_aposta||""} onChange={e => setEditBilhete({...editBilhete, casa_aposta:e.target.value||null})} style={{ width:"100%", padding:"7px 9px", borderRadius:8, border:`2px solid ${!editBilhete.casa_aposta ? "#f97316" : T.border}`, background:T.bg, color:T.text, fontSize:12, boxSizing:"border-box" }}/>
                    </div>
                    <div>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
                        <label style={{ fontSize:10, fontWeight:700, color:T.muted }}>{editBilhete.stake_tipo === "valor" ? `VALOR (${MOEDA})` : "STAKE (un)"}</label>
                        <div style={{ display:"flex", gap:2 }}>
                          <button type="button" onClick={() => setEditBilhete({...editBilhete, stake_tipo:"unidades"})} style={{ fontSize:9, padding:"2px 6px", borderRadius:4, border:"none", cursor:"pointer", background:(editBilhete.stake_tipo??"unidades")==="unidades"?T.blue:T.bg, color:(editBilhete.stake_tipo??"unidades")==="unidades"?"white":T.muted, fontWeight:700 }}>un</button>
                          <button type="button" onClick={() => setEditBilhete({...editBilhete, stake_tipo:"valor"})} style={{ fontSize:9, padding:"2px 6px", borderRadius:4, border:"none", cursor:"pointer", background:editBilhete.stake_tipo==="valor"?T.blue:T.bg, color:editBilhete.stake_tipo==="valor"?"white":T.muted, fontWeight:700 }}>{MOEDA}</button>
                        </div>
                      </div>
                      <input type="number" step="0.1" min="0" placeholder={editBilhete.stake_tipo === "valor" ? "50" : "1.5"} value={editBilhete.stake_unidades??""} onChange={e => setEditBilhete({...editBilhete, stake_unidades:e.target.value ? parseFloat(e.target.value) : null})} style={{ width:"100%", padding:"7px 9px", borderRadius:8, border:`2px solid ${editBilhete.stake_unidades==null ? "#f97316" : T.border}`, background:T.bg, color:T.text, fontSize:12, boxSizing:"border-box" }}/>
                    </div>
                    <div>
                      <label style={{ fontSize:10, fontWeight:700, color:T.muted }}>ODD TOTAL</label>
                      <input type="number" step="0.01" min="0" value={editBilhete.odd_total} readOnly style={{ width:"100%", padding:"7px 9px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.muted, fontSize:12, boxSizing:"border-box", opacity:0.7 }}/>
                    </div>
                  </div>
                  {editBilhete.pernas?.map((p, i) => (
                    <div key={i} style={{ background:T.bg, borderRadius:8, padding:8, marginBottom:6, border:`1px solid ${T.border}` }}>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr", gap:6 }}>
                        <input type="text" placeholder="Esporte" value={p.esporte} onChange={e => { const n=[...editBilhete.pernas]; n[i]={...n[i], esporte:e.target.value}; setEditBilhete({...editBilhete, pernas:n}); }} style={{ padding:"6px 7px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bgCard, color:T.text, fontSize:11, boxSizing:"border-box" }}/>
                        <input type="text" placeholder="Jogo" value={p.jogo} onChange={e => { const n=[...editBilhete.pernas]; n[i]={...n[i], jogo:e.target.value}; setEditBilhete({...editBilhete, pernas:n}); }} style={{ padding:"6px 7px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bgCard, color:T.text, fontSize:11, boxSizing:"border-box" }}/>
                        <input type="text" placeholder="Mercado" value={p.mercado} onChange={e => { const n=[...editBilhete.pernas]; n[i]={...n[i], mercado:e.target.value}; setEditBilhete({...editBilhete, pernas:n}); }} style={{ padding:"6px 7px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bgCard, color:T.text, fontSize:11, boxSizing:"border-box" }}/>
                        <input type="text" placeholder="Seleção" value={p.selecao} onChange={e => { const n=[...editBilhete.pernas]; n[i]={...n[i], selecao:e.target.value}; setEditBilhete({...editBilhete, pernas:n}); }} style={{ padding:"6px 7px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bgCard, color:T.text, fontSize:11, boxSizing:"border-box" }}/>
                        <input type="number" step="0.01" min="0" placeholder="Odd" value={p.odd_parcial} onChange={e => { const n=[...editBilhete.pernas]; n[i]={...n[i], odd_parcial:parseFloat(e.target.value)||0}; setEditBilhete({...editBilhete, pernas:n}); }} style={{ padding:"6px 7px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bgCard, color:T.text, fontSize:11, boxSizing:"border-box" }}/>
                      </div>
                    </div>
                  ))}
                  {msgSelecionada.foto_file_id && (
                    <a href={`https://api.telegram.org/file/bot${import.meta.env.VITE_TELEGRAM_BOT_TOKEN||""}/${msgSelecionada.foto_file_id}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ display:"block", textAlign:"center", fontSize:11, color:T.blue, marginTop:6, marginBottom:6, textDecoration:"underline", cursor:"pointer" }}>
                      Ver imagem original
                    </a>
                  )}
                  <div>
                    <label style={{ fontSize:10, fontWeight:700, color:T.muted }}>OBSERVAÇÃO</label>
                    <input value={editMsgTexto} onChange={e => setEditMsgTexto(e.target.value)} placeholder="Opcional..." style={{ width:"100%", padding:"7px 9px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:12, boxSizing:"border-box" }}/>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
                    <div>
                      <label style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:4 }}>Texto</label>
                      <div style={{ padding:"10px 12px", borderRadius:8, background:T.bg, border:`1px solid ${T.border}`, fontSize:13, color:T.text, minHeight:36 }}>{msgSelecionada.texto || "(sem texto)"}</div>
                    </div>
                    <div>
                      <label style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:4 }}>Editar</label>
                      <input value={editMsgTexto} onChange={e => setEditMsgTexto(e.target.value)} placeholder="Edite o texto..." />
                    </div>
                  </div>
                </>
              )}

              <div style={{ display:"flex", gap:8, justifyContent:"flex-end", flexWrap:"wrap" }}>
                <button onClick={negarMsg} style={{ padding:"9px 16px", borderRadius:10, border:`1px solid ${T.red}`, background:"transparent", color:T.red, fontSize:12, fontWeight:700, cursor:"pointer" }}>✕ Negar</button>
                {editBilhete && !editMode && (
                  <button onClick={() => setEditMode(true)} style={{ padding:"9px 16px", borderRadius:10, border:"none", background:T.muted, color:"white", fontSize:12, fontWeight:700, cursor:"pointer" }}>✎ Editar</button>
                )}
                {editBilhete && editMode && (
                  <button onClick={() => setEditMode(false)} style={{ padding:"9px 16px", borderRadius:10, border:"none", background:T.muted, color:"white", fontSize:12, fontWeight:700, cursor:"pointer" }}>👁 Visualizar</button>
                )}
                <button onClick={salvarEditado} style={{ padding:"9px 16px", borderRadius:10, border:"none", background:T.green, color:"white", fontSize:12, fontWeight:700, cursor:"pointer" }}>✓ Salvar</button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL APOSTA (cadastro manual / edição) ── */}
        {modalAposta && (
          <div style={{ position:"fixed", inset:0, zIndex:250, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.7)", backdropFilter:"blur(6px)", padding:20 }} onClick={() => !salvandoAposta && setModalAposta(false)}>
            <div style={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:18, width:"100%", maxWidth:560, maxHeight:"88vh", overflowY:"auto", padding:"24px 28px" }} onClick={e => e.stopPropagation()}>
              <h2 style={{ fontSize:17, fontWeight:800, color:T.text, marginBottom:4 }}>{formAposta.id ? "Editar Aposta" : "Nova Aposta"}</h2>
              <p style={{ fontSize:12, color:T.muted, marginBottom:16 }}>{labelTipo(formAposta.pernas.length)} · {formAposta.pernas.length} perna(s)</p>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                <div>
                  <label style={{ fontSize:10, fontWeight:700, color:T.muted }}>DATA</label>
                  <input type="date" value={formAposta.data} onChange={e => setFormAposta({...formAposta, data:e.target.value})} style={{ width:"100%", padding:"7px 9px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:12, boxSizing:"border-box" }}/>
                </div>
                <div>
                  <label style={{ fontSize:10, fontWeight:700, color:T.muted }}>CASA</label>
                  <input type="text" placeholder="Ex: 22BET" value={formAposta.casa_aposta} onChange={e => setFormAposta({...formAposta, casa_aposta:e.target.value})} style={{ width:"100%", padding:"7px 9px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:12, boxSizing:"border-box" }}/>
                </div>
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
                    <label style={{ fontSize:10, fontWeight:700, color:T.muted }}>{formAposta.stake_tipo === "valor" ? `VALOR (${MOEDA})` : "STAKE (un)"}</label>
                    <div style={{ display:"flex", gap:2 }}>
                      <button type="button" onClick={() => setFormAposta({...formAposta, stake_tipo:"unidades"})} style={{ fontSize:9, padding:"2px 6px", borderRadius:4, border:"none", cursor:"pointer", background:formAposta.stake_tipo==="unidades"?T.blue:T.bg, color:formAposta.stake_tipo==="unidades"?"white":T.muted, fontWeight:700 }}>un</button>
                      <button type="button" onClick={() => setFormAposta({...formAposta, stake_tipo:"valor"})} style={{ fontSize:9, padding:"2px 6px", borderRadius:4, border:"none", cursor:"pointer", background:formAposta.stake_tipo==="valor"?T.blue:T.bg, color:formAposta.stake_tipo==="valor"?"white":T.muted, fontWeight:700 }}>{MOEDA}</button>
                    </div>
                  </div>
                  <input type="number" step="0.1" min="0" placeholder={formAposta.stake_tipo === "valor" ? "50" : "1.5"} value={formAposta.stake_unidades} onChange={e => setFormAposta({...formAposta, stake_unidades:e.target.value})} style={{ width:"100%", padding:"7px 9px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:12, boxSizing:"border-box" }}/>
                </div>
                <div>
                  <label style={{ fontSize:10, fontWeight:700, color:T.muted }}>ODD TOTAL <span style={{opacity:0.6}}>(calc: {oddCalculada(formAposta.pernas).toFixed(2)})</span></label>
                  <input type="number" step="0.01" min="0" placeholder={oddCalculada(formAposta.pernas).toFixed(2)} value={formAposta.odd_total} onChange={e => setFormAposta({...formAposta, odd_total:e.target.value})} style={{ width:"100%", padding:"7px 9px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:12, boxSizing:"border-box" }}/>
                </div>
                <div style={{ gridColumn:"1 / -1" }}>
                  <label style={{ fontSize:10, fontWeight:700, color:T.muted }}>RESULTADO</label>
                  <select value={formAposta.resultado} onChange={e => setFormAposta({...formAposta, resultado:e.target.value as Resultado})} style={{ width:"100%", padding:"7px 9px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:12 }}>
                    <option value="pendente">Pendente</option>
                    <option value="green">Green</option>
                    <option value="red">Red</option>
                    <option value="void">Void</option>
                  </select>
                </div>
              </div>

              <p style={{ fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1, marginTop:14, marginBottom:6 }}>Jogos / Pernas</p>
              {formAposta.pernas.map((p, i) => (
                <div key={i} style={{ background:T.bg, borderRadius:8, padding:8, marginBottom:6, border:`1px solid ${T.border}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:10, fontWeight:700, color:T.muted }}>Jogo {i + 1}</span>
                    {formAposta.pernas.length > 1 && (
                      <span onClick={() => removerPernaForm(i)} style={{ fontSize:11, color:T.red, cursor:"pointer", fontWeight:700 }}>✕ remover</span>
                    )}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 2fr", gap:6, marginBottom:6 }}>
                    <input type="text" placeholder="Esporte" value={p.esporte} onChange={e => updatePernaForm(i, "esporte", e.target.value)} style={{ padding:"6px 7px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bgCard, color:T.text, fontSize:11, boxSizing:"border-box" }}/>
                    <input type="text" placeholder="Campeonato" value={p.campeonato} onChange={e => updatePernaForm(i, "campeonato", e.target.value)} style={{ padding:"6px 7px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bgCard, color:T.text, fontSize:11, boxSizing:"border-box" }}/>
                    <input type="text" placeholder="Jogo (Time A x Time B)" value={p.jogo} onChange={e => updatePernaForm(i, "jogo", e.target.value)} style={{ padding:"6px 7px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bgCard, color:T.text, fontSize:11, boxSizing:"border-box" }}/>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 0.7fr", gap:6 }}>
                    <input type="text" placeholder="Mercado" value={p.mercado} onChange={e => updatePernaForm(i, "mercado", e.target.value)} style={{ padding:"6px 7px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bgCard, color:T.text, fontSize:11, boxSizing:"border-box" }}/>
                    <input type="text" placeholder="Seleção" value={p.selecao} onChange={e => updatePernaForm(i, "selecao", e.target.value)} style={{ padding:"6px 7px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bgCard, color:T.text, fontSize:11, boxSizing:"border-box" }}/>
                    <input type="number" step="0.01" min="0" placeholder="Odd" value={p.odd_parcial} onChange={e => updatePernaForm(i, "odd_parcial", e.target.value)} style={{ padding:"6px 7px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bgCard, color:T.text, fontSize:11, boxSizing:"border-box" }}/>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addPernaForm} style={{ width:"100%", padding:8, borderRadius:8, border:`1px dashed ${T.border}`, background:"transparent", color:T.blue, fontSize:12, fontWeight:700, cursor:"pointer", marginBottom:12 }}>+ Adicionar jogo</button>

              <div>
                <label style={{ fontSize:10, fontWeight:700, color:T.muted }}>OBSERVAÇÃO</label>
                <input value={formAposta.observacao} onChange={e => setFormAposta({...formAposta, observacao:e.target.value})} placeholder="Opcional..." style={{ width:"100%", padding:"7px 9px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:12, boxSizing:"border-box" }}/>
              </div>

              <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:18 }}>
                <button onClick={() => setModalAposta(false)} disabled={salvandoAposta} style={{ padding:"9px 16px", borderRadius:10, border:`1px solid ${T.border}`, background:"transparent", color:T.muted, fontSize:12, fontWeight:700, cursor:"pointer" }}>Cancelar</button>
                <button onClick={salvarAposta} disabled={salvandoAposta} style={{ padding:"9px 16px", borderRadius:10, border:"none", background:T.green, color:"white", fontSize:12, fontWeight:700, cursor:"pointer", opacity:salvandoAposta?0.6:1 }}>{salvandoAposta ? "Salvando..." : "✓ Salvar aposta"}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL EDITAR PERFIL ── */}
        {editProfileMode && (
          <div style={{ position:"fixed", inset:0, zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.7)", backdropFilter:"blur(6px)", padding:20 }} onClick={() => setEditProfileMode(false)}>
            <div style={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:18, width:"100%", maxWidth:400, padding:"28px 32px" }} onClick={e => e.stopPropagation()}>
              <h2 style={{ fontSize:18, fontWeight:800, color:T.text, marginBottom:16, textAlign:"center" }}>Editar Perfil</h2>
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:4 }}>Nome</label>
                  <input value={formProfile.nome} onChange={e => setFormProfile({...formProfile, nome:e.target.value})} placeholder="Seu nome" />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:10 }}>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:4 }}>Banca Inicial</label>
                    <input type="number" value={formProfile.banca} onChange={e => setFormProfile({...formProfile, banca:e.target.value})} />
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:4 }}>Moeda</label>
                    <select value={formProfile.moeda} onChange={e => setFormProfile({...formProfile, moeda:e.target.value})}>
                      <option value="BRL">BRL</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:1, display:"block", marginBottom:4 }}>Como registrar o stake por padrão</label>
                  <div style={{ display:"flex", gap:8 }}>
                    <button type="button" onClick={() => setFormProfile({...formProfile, stake_tipo_padrao:"valor"})} style={{ flex:1, padding:10, borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:700, background:formProfile.stake_tipo_padrao==="valor"?T.blue:T.bg, color:formProfile.stake_tipo_padrao==="valor"?"white":T.muted }}>Valor fixo ({formProfile.moeda})</button>
                    <button type="button" onClick={() => setFormProfile({...formProfile, stake_tipo_padrao:"unidades"})} style={{ flex:1, padding:10, borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:700, background:formProfile.stake_tipo_padrao==="unidades"?T.blue:T.bg, color:formProfile.stake_tipo_padrao==="unidades"?"white":T.muted }}>Unidades (% banca)</button>
                  </div>
                  <p style={{ fontSize:10, color:T.muted, marginTop:4 }}>Toda aposta nova (Telegram ou manual) já vem marcada com essa opção — dá pra trocar bilhete por bilhete se precisar.</p>
                </div>
              </div>
              <div style={{ display:"flex", gap:10, marginTop:20 }}>
                <button onClick={() => setEditProfileMode(false)} style={{ flex:1, padding:"12px", borderRadius:10, border:`1px solid ${T.border}`, background:"transparent", color:T.muted, fontSize:14, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
                <button onClick={salvarEditProfile} style={{ flex:1, padding:"12px", borderRadius:10, border:"none", background:T.blue, color:"white", fontSize:14, fontWeight:700, cursor:"pointer" }}>Salvar</button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL RELATÓRIO ── */}
        {modalRelatorio && (
          <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.7)", backdropFilter:"blur(6px)", padding:20 }} onClick={() => !gerandoRelatorio && setModalRelatorio(false)}>
            <div style={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:18, width:"100%", maxWidth:680, maxHeight:"85vh", display:"flex", flexDirection:"column", overflow:"hidden" }} onClick={e => e.stopPropagation()}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"18px 24px", borderBottom:`1px solid ${T.border}` }}>
                <div>
                  <h2 style={{ fontSize:17, fontWeight:800, color:T.text }}>Relatório Master Tipster</h2>
                  <p style={{ fontSize:12, color:T.muted, marginTop:2 }}>Gerado em {new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"long",year:"numeric"})}</p>
                </div>
                <button onClick={() => !gerandoRelatorio && setModalRelatorio(false)} style={{ background:"none", border:"none", cursor:"pointer", color:T.muted, fontSize:20, padding:4 }}>✕</button>
              </div>
              <div style={{ padding:24, overflowY:"auto", flex:1 }}>
                {gerandoRelatorio
                  ? (
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:60, gap:16 }}>
                      <div style={{ width:40, height:40, border:`3px solid ${T.border}`, borderTopColor:T.blue, borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
                      <p style={{ color:T.muted, fontSize:14, fontWeight:600 }}>Gerando análise...</p>
                    </div>
                  ) : (
                    <div style={{ fontSize:14, lineHeight:1.8, color:T.text, whiteSpace:"pre-wrap" }}>{textoRelatorio}</div>
                  )
                }
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:10, padding:"14px 24px", borderTop:`1px solid ${T.border}` }}>
                {textoRelatorio && !gerandoRelatorio && (
                  <button onClick={() => navigator.clipboard.writeText(textoRelatorio)} style={{ padding:"10px 20px", borderRadius:10, border:`1px solid ${T.border}`, cursor:"pointer", background:"transparent", color:T.text, fontSize:13, fontWeight:700 }}>Copiar</button>
                )}
                <button onClick={() => setModalRelatorio(false)} style={{ padding:"10px 20px", borderRadius:10, border:"none", cursor:"pointer", background:T.blue, color:"white", fontSize:13, fontWeight:700 }}>Fechar</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Responsive CSS ── */}
      <style>{`
        @media (max-width: 768px) {
          .nav-btn-text { display: none !important; }
          .nav-inner { height: auto !important; flex-wrap: wrap !important; padding: 10px 16px !important; gap: 8px !important; }
          .nav-actions { flex-wrap: wrap !important; justify-content: flex-end !important; }
          .hero-card { padding: 18px 16px !important; }
          .hero-row { flex-direction: column !important; }
          .hero-row > div:last-child { text-align: left !important; }
          .metrics-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .stats-row { display: flex !important; flex-direction: column !important; gap: 12px !important; }
          .bonus-row { display: flex !important; flex-direction: column !important; gap: 12px !important; }
          .bonus-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .prog-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .metrics-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .prog-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .bonus-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </>
  );
}

// ── Card de aposta ──
function CardAposta({ aposta, bancaMomentoCalc, expandido, setExpandido, editando, setEditando, salvarResultado, excluirAposta, salvando, T, moeda, podeEditar, onEditarAposta }: {
  aposta: Aposta; bancaMomentoCalc?: Record<string, number>;
  expandido: string | null; setExpandido: (id: string | null) => void;
  editando: { id: string; resultado: Resultado } | null;
  setEditando: (v: { id: string; resultado: Resultado } | null) => void;
  salvarResultado: () => void; excluirAposta: (id: string) => void; salvando: boolean; T: typeof DARK; moeda?: string;
  podeEditar?: boolean; onEditarAposta?: (a: Aposta) => void;
}) {
  const lucro = calcularLucro(aposta, bancaMomentoCalc?.[aposta.id]);
  const isExp = expandido === aposta.id;
  const nLegs = aposta.detalhes?.length ?? 0;
  const tipoLabel = labelTipo(nLegs);
  const isBonus = aposta.tipo === "bonus";
  const stakeValor = isBonus
    ? (aposta.valor_bonus ?? 0)
    : aposta.stake_tipo === "valor"
      ? (aposta.stake_unidades ?? 0)
      : ((aposta.stake_unidades ?? 1) / 100) * (aposta.banca_momento ?? BANCA_INICIAL_DEFAULT);
  const stakeLabel = isBonus ? "" : (aposta.stake_tipo === "valor" ? fmtBRL(aposta.stake_unidades ?? 0, moeda) : `${aposta.stake_unidades}u`);

  const labelPrincipal = nLegs <= 1
    ? (aposta.detalhes?.[0]?.jogo ?? "—")
    : nLegs === 2
      ? `${aposta.detalhes![0]?.jogo} + ${aposta.detalhes![1]?.jogo}`
      : `${tipoLabel} ${nLegs} jogos`;

  const tipoCor = isBonus ? T.amber : nLegs===1 ? T.blue : nLegs===2 ? "#A78BFA" : nLegs===3 ? "#F472B6" : T.amber;

  return (
    <div style={{ borderRadius:12, overflow:"hidden", background:T.bgCard, border:`1px solid ${T.border}`, transition:"border-color 0.2s" }}>
      <div onClick={() => setExpandido(isExp ? null : aposta.id)} style={{
        display:"flex", alignItems:"center", gap:10, padding:"13px 16px", cursor:"pointer",
        background: isExp ? T.bgHover : "transparent",
      }}>
        {/* Data */}
        <div style={{ textAlign:"center", minWidth:38, flexShrink:0 }}>
          <p style={{ fontSize:12, fontWeight:700, color:T.text }}>{fmtDataCurta(aposta.data)}</p>
          <p style={{ fontSize:10, color:T.muted }}>{fmtDiaSemana(aposta.data)}</p>
        </div>

        <div style={{ width:1, height:30, background:T.border, flexShrink:0 }} />

        {/* Casa + tipo */}
        <div style={{ flexShrink:0, minWidth:76 }}>
          <p style={{ fontSize:12, fontWeight:600, color:T.text, display:"flex", alignItems:"center", gap:4 }}>
            {aposta.casa_aposta}
            {aposta.origem === "telegram" && <span title="Cadastrado via Telegram">✈️</span>}
            {aposta.origem === "manual" && <span title="Cadastrado manualmente">✍️</span>}
          </p>
          <span style={{ fontSize:9, padding:"2px 6px", borderRadius:4, fontWeight:700, background:`${tipoCor}18`, color:tipoCor }}>
            {isBonus ? "BÔNUS" : tipoLabel.toUpperCase()}
          </span>
        </div>

        {/* Label */}
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:12, color:T.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", fontWeight:500 }}>{labelPrincipal}</p>
          {nLegs > 2 && (
            <p style={{ fontSize:10, color:T.muted, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginTop:2 }}>
              {aposta.detalhes?.map(d => d.selecao).join(" · ")}
            </p>
          )}
        </div>

        {!isBonus && <span style={{ fontSize:11, color:T.muted, flexShrink:0 }}>{stakeLabel}</span>}
        <span style={{ fontSize:13, fontFamily:"monospace", color:T.blue, fontWeight:700, flexShrink:0 }}>@{aposta.odd_total}</span>
        <ResultadoBadge resultado={aposta.resultado} T={T} />
        {aposta.resultado !== "pendente" && aposta.resultado !== "void" && (
          <span style={{ fontSize:13, fontWeight:800, flexShrink:0, minWidth:72, textAlign:"right", color: lucro>=0 ? T.green : T.red }}>
            {lucro>=0?"+":""}{fmtBRL(lucro, moeda)}
          </span>
        )}
        <span style={{ fontSize:10, color:T.muted, flexShrink:0 }}>{isExp?"▲":"▼"}</span>
      </div>

      {isExp && (
        <div style={{ padding:"16px 18px 18px", borderTop:`1px solid ${T.border}`, animation:"fadeIn 0.2s ease" }}>
          {/* chips */}
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
            {[
              { label:"Data", valor:fmtDataLonga(aposta.data) },
              isBonus
                ? { label:"Depósito bônus", valor:fmtBRL(aposta.valor_bonus ?? 0, moeda) }
                : { label:"Valor apostado", valor:fmtBRL(stakeValor, moeda) },
              isBonus
                ? { label:"Lucro máximo", valor:fmtBRL(aposta.lucro_maximo ?? 0, moeda) }
                : { label:"Stake", valor:stakeLabel },
              ...(aposta.observacao ? [{ label:"Obs", valor:aposta.observacao }] : []),
            ].map((item, i) => (
              <div key={i} style={{ padding:"6px 12px", borderRadius:8, background:T.bg, border:`1px solid ${T.border}` }}>
                <span style={{ fontSize:10, color:T.muted, display:"block", marginBottom:1 }}>{item.label}</span>
                <span style={{ fontSize:12, fontWeight:600, color:T.text }}>{item.valor}</span>
              </div>
            ))}
            {isBonus && (
              <div style={{ padding:"6px 12px", borderRadius:8, background:`${T.amber}10`, border:`1px solid ${T.amber}30` }}>
                <span style={{ fontSize:10, color:T.amber, display:"block", marginBottom:1 }}>Risco</span>
                <span style={{ fontSize:12, fontWeight:600, color:T.amber }}>Sem risco real</span>
              </div>
            )}
          </div>

          {/* Legs */}
          {(aposta.detalhes ?? []).length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:14 }}>
              {aposta.detalhes!.map((d, i) => (
                <div key={d.id} style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"11px 14px", borderRadius:10, background:T.bg, border:`1px solid ${T.border}` }}>
                  <div style={{ flex:1 }}>
                    {nLegs > 1 && (
                      <span style={{ fontSize:10, fontWeight:700, color:T.muted, display:"block", marginBottom:3, textTransform:"uppercase", letterSpacing:1 }}>
                        Leg {i+1} · {d.esporte}
                      </span>
                    )}
                    <p style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:2 }}>{d.jogo}</p>
                    <p style={{ fontSize:11, color:T.muted, marginBottom:3 }}>{d.campeonato}</p>
                    <p style={{ fontSize:12, color:T.muted }}>
                      {d.mercado}: <span style={{ color:T.blue, fontWeight:700 }}>{d.selecao}</span>
                    </p>
                  </div>
                  <span style={{ fontSize:15, fontFamily:"monospace", fontWeight:800, color:T.blue }}>@{d.odd_parcial}</span>
                </div>
              ))}
            </div>
          )}

          {/* Editar resultado */}
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:12, color:T.muted }}>Resultado:</span>
            {editando?.id === aposta.id ? (
              <>
                <select value={editando.resultado} onChange={e => setEditando({ id:aposta.id, resultado:e.target.value as Resultado })} style={{ width:"auto", padding:"7px 12px" }}>
                  <option value="pendente">Pendente</option>
                  <option value="green">Green</option>
                  <option value="red">Red</option>
                  <option value="void">Void</option>
                </select>
                <button onClick={salvarResultado} disabled={salvando} style={{ padding:"7px 16px", borderRadius:8, border:"none", cursor:"pointer", background:T.green, color:"white", fontSize:13, fontWeight:700, opacity:salvando?0.6:1 }}>
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
                <button onClick={() => setEditando(null)} style={{ padding:"7px 12px", borderRadius:8, border:`1px solid ${T.border}`, cursor:"pointer", background:"transparent", color:T.muted, fontSize:13 }}>
                  Cancelar
                </button>
              </>
            ) : (
              podeEditar && <button onClick={() => setEditando({ id:aposta.id, resultado:aposta.resultado })} style={{ padding:"7px 14px", borderRadius:8, border:"none", cursor:"pointer", background:T.blue, color:"white", fontSize:12, fontWeight:700 }}>
                Resultado
              </button>
            )}
            {podeEditar && onEditarAposta && (
              <button onClick={() => onEditarAposta(aposta)} style={{ padding:"7px 14px", borderRadius:8, border:`1px solid ${T.border}`, cursor:"pointer", background:"transparent", color:T.text, fontSize:12, fontWeight:700 }}>
                ✏️ Editar aposta
              </button>
            )}
            {podeEditar && (
              <button onClick={() => excluirAposta(aposta.id)} style={{ padding:"7px 14px", borderRadius:8, border:`1px solid ${T.red}`, cursor:"pointer", background:"transparent", color:T.red, fontSize:12, fontWeight:700 }}>
                Excluir
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultadoBadge({ resultado, T }: { resultado: Resultado; T: typeof DARK }) {
  const map: Record<Resultado, { label:string; cor:string }> = {
    pendente: { label:"Pendente", cor:T.amber },
    green: { label:"Green", cor:T.green },
    red: { label:"Red", cor:T.red },
    void: { label:"Void", cor:T.muted },
  };
  const { label, cor } = map[resultado];
  return (
    <span style={{ fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:100, flexShrink:0, background:`${cor}18`, color:cor, border:`1px solid ${cor}35` }}>
      {label}
    </span>
  );
}
