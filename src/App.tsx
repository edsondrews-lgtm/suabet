import { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine
} from "recharts";

// ── Types ──
type Resultado = "pendente" | "green" | "red" | "void";
type Tipo = "simples" | "bonus";
type Aba = "resumo" | "simples" | "duplas" | "triplas" | "combinadas" | "bonus" | "programacao";

interface Detalhe {
  id: string; aposta_id: string; esporte: string; campeonato: string;
  jogo: string; mercado: string; selecao: string; odd_parcial: number;
}
interface Aposta {
  id: string; data: string; tipo: Tipo; stake_unidades: number | null;
  banca_momento: number | null; valor_bonus: number | null; lucro_maximo: number | null;
  casa_aposta: string; odd_total: number; resultado: Resultado;
  lucro_reais: number | null; observacao: string | null; created_at: string;
  detalhes?: Detalhe[];
}
interface Programacao {
  id: string; casa: string; dia_semana: string; valor: number;
  observacao: string | null; created_at: string;
}

// ── Constants ──
const BANCA_INICIAL = 1000;
const CASAS = ['Granawin','BetandYou','BetLabel','WinWin','22Bet','BetSnipe','BET&YOU'];
const DIAS_SEMANA = ['segunda','terca','quarta','quinta','sexta','sabado','domingo'];
const DIAS_LABEL: Record<string,string> = {
  segunda:"Seg",terca:"Ter",quarta:"Qua",quinta:"Qui",sexta:"Sex",sabado:"Sab",domingo:"Dom"
};

// ── Helpers ──
function calcularLucro(a: Aposta, bancaBase?: number): number {
  if (a.resultado === "pendente" || a.resultado === "void") return 0;
  if (a.tipo === "bonus") return a.resultado === "green" ? (a.lucro_maximo ?? 0) : 0;
  const banca = bancaBase ?? BANCA_INICIAL;
  const stake = ((a.stake_unidades ?? 1) / 100) * banca;
  return a.resultado === "green"
    ? parseFloat((stake * (a.odd_total - 1)).toFixed(2))
    : parseFloat((-stake).toFixed(2));
}
function fmtBRL(v: number) {
  return "R$ " + Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const [logado, setLogado] = useState(() => localStorage.getItem("sb_auth") === "ok");
  const [menuLogin, setMenuLogin] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginErro, setLoginErro] = useState("");
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

  const bancaMomentoRef = useRef<Record<string, number>>({});
  const T = dark ? DARK : LIGHT;

  function fazerLogin() {
    if (loginUser === "edsondrews" && loginPass === "stake2026") {
      localStorage.setItem("sb_auth", "ok");
      setLogado(true);
      setMenuLogin(false);
      setLoginErro("");
    } else {
      setLoginErro("Login ou senha inválidos");
    }
  }

  function fazerLogout() {
    localStorage.removeItem("sb_auth");
    setLogado(false);
    setMenuLogin(false);
  }

  async function carregar() {
    setLoading(true);
    const { data: ap } = await supabase.from("tipster_apostas").select("*").order("data",{ascending:true}).order("created_at",{ascending:true});
    const { data: det } = await supabase.from("tipster_apostas_detalhes").select("*");
    const { data: prog } = await supabase.from("tipster_programacao").select("*").order("dia_semana");
    const com = (ap ?? []).map((a: Aposta) => ({ ...a, detalhes: (det ?? []).filter((d: Detalhe) => d.aposta_id === a.id) }));
    setApostas(com);
    setProgramacao((prog ?? []) as Programacao[]);
    setLoading(false);
  }
  useEffect(() => { carregar(); }, []);

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

  const todasOrdenadas = [...apostas].sort((a, b) => a.data.localeCompare(b.data) || a.created_at.localeCompare(b.created_at));
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
  const todasResolvidas = apostas.filter(a => a.resultado !== "pendente" && a.resultado !== "void");
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

  // ── CSS global ──
  const globalCSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: ${T.bg}; color: ${T.text}; font-family: 'Inter', system-ui, sans-serif; transition: background 0.3s, color 0.3s; }
    @keyframes spin { to { transform: rotate(360deg) } }
    @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
    ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: ${T.bg}; } ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 3px; }
    select, input { background: ${T.bgCard}; color: ${T.text}; border: 1px solid ${T.border}; border-radius: 10px; padding: 10px 12px; font-size: 14px; outline: none; width: 100%; }
    select:focus, input:focus { border-color: ${T.blue}; }
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
              <span style={{ fontWeight:800, fontSize:15, color:T.text, letterSpacing:-0.5 }}>Master Tipster</span>
            </div>
            <div className="nav-actions" style={{ display:"flex", gap:8, alignItems:"center" }}>
              <button className="nav-btn-text" onClick={carregar} style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.muted, fontSize:12, fontWeight:600, cursor:"pointer" }}>↻ Atualizar</button>
              <button onClick={gerarRelatorio} style={{ padding:"6px 14px", borderRadius:8, border:"none", background:T.blue, color:"white", fontSize:12, fontWeight:700, cursor:"pointer" }}>📊 Relatório</button>
              <button onClick={() => setDark(!dark)} style={{ width:36, height:36, borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.muted, cursor:"pointer", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {dark ? "☀️" : "🌙"}
              </button>
              <div style={{ position:"relative" }}>
                <button onClick={() => setMenuLogin(!menuLogin)} style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${T.border}`, background: logado ? T.green+"20" : "transparent", color: logado ? T.green : T.muted, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                  {logado ? "● Admin" : "🔑 Login"}
                </button>
                {menuLogin && (
                  <div style={{ position:"absolute", right:0, top:44, background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:12, padding:16, width:260, zIndex:100, boxShadow:"0 8px 32px rgba(0,0,0,0.4)" }}>
                    {logado ? (
                      <div>
                        <p style={{ color:T.text, fontSize:13, marginBottom:12 }}>Logado como <b>Admin</b></p>
                        <button onClick={fazerLogout} style={{ width:"100%", padding:10, borderRadius:8, border:`1px solid ${T.red}`, background:"transparent", color:T.red, fontSize:13, fontWeight:600, cursor:"pointer" }}>Sair</button>
                      </div>
                    ) : (
                      <div>
                        <p style={{ color:T.text, fontSize:13, marginBottom:12, fontWeight:600 }}>Login Admin</p>
                        <input placeholder="Usuário" value={loginUser} onChange={e => setLoginUser(e.target.value)}
                          style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:13, marginBottom:8, outline:"none", boxSizing:"border-box" }} />
                        <input placeholder="Senha" type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && fazerLogin()}
                          style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:T.bg, color:T.text, fontSize:13, marginBottom:10, outline:"none", boxSizing:"border-box" }} />
                        {loginErro && <p style={{ color:T.red, fontSize:12, marginBottom:8 }}>{loginErro}</p>}
                        <button onClick={fazerLogin} style={{ width:"100%", padding:10, borderRadius:8, border:"none", background:T.blue, color:"white", fontSize:13, fontWeight:600, cursor:"pointer" }}>Entrar</button>
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
                  Tipster · banca base {fmtBRL(BANCA_INICIAL)}
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
                <p style={{ fontSize:11, color:T.muted, textTransform:"uppercase", letterSpacing:2, marginBottom:4 }}>Banca atual</p>
                <p style={{ fontSize:36, fontWeight:900, color: isLucroPos ? T.green : T.red, letterSpacing:-1, lineHeight:1 }}>
                  {fmtBRL(bancaAtual)}
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
              { label:"Yield", valor:`${yieldPct>=0?"+":""}${yieldPct.toFixed(1)}%`, sub:fmtBRL(lucroSimples), cor: lucroSimples>=0 ? T.green : T.red },
              { label:"Odd média", valor:oddMedia.toFixed(2), sub:"apostas simples", cor:T.text },
              { label:"Melhor seq.", valor:`${melhorSeq}G`, sub:"greens seguidos", cor: melhorSeq>=5 ? T.amber : T.text },
              { label:"Drawdown", valor:`${maxDrawdown.toFixed(1)}%`, sub:"queda máxima", cor: maxDrawdown>10 ? T.red : T.text },
              { label:"Bônus", valor:fmtBRL(lucroBonus), sub: pendBonus>0 ? `${pendBonus} pendente${pendBonus>1?"s":""}` : `${greenBonus}G · ${redBonus}R`, cor: lucroBonus>0 ? T.green : T.text },
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
                      <Tooltip formatter={(v: any) => [fmtBRL(v),"Banca"]} contentStyle={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:10, fontSize:12, color:T.text }} />
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
                          {d.lucro>=0?"+":""}{fmtBRL(d.lucro)}
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
                    { label:"Lucro total", valor:fmtBRL(lucroBonus), cor: lucroBonus>0 ? T.green : T.text },
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
                              {lucro>=0?"+":""}{fmtBRL(lucro)}
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
                    salvarResultado={salvarResultado} salvando={salvando} T={T} logado={logado} />
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
                    { label:"Lucro total", valor:fmtBRL(lucroBonus), cor: lucroBonus>0 ? T.green : T.text },
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
                  salvarResultado={salvarResultado} salvando={salvando} T={T} logado={logado} />
              ))}
            </div>
          )}

          {/* ── ABA PROGRAMAÇÃO ── */}
          {aba === "programacao" && (
            <div style={{ display:"flex", flexDirection:"column", gap:16, animation:"fadeIn 0.3s ease" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <p style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color:T.muted }}>Programação semanal de bônus</p>
                {logado && <button onClick={abrirNovaProgramacao} style={{ padding:"8px 16px", borderRadius:8, border:"none", background:T.blue, color:"white", fontSize:12, fontWeight:700, cursor:"pointer" }}>+ Nova</button>}
              </div>
              <div className="prog-grid" style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:8 }}>
                {DIAS_SEMANA.map(dia => {
                  const itens = programacao.filter(p => p.dia_semana === dia);
                  return (
                    <div key={dia} style={{ borderRadius:12, padding:"12px 10px", background:T.bgCard, border:`1px solid ${itens.length>0 ? T.blue+"40" : T.border}`, minHeight:90 }}>
                      <p style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.5, color: itens.length>0 ? T.blue : T.muted, marginBottom:8 }}>{DIAS_LABEL[dia]}</p>
                      {itens.length === 0 && <p style={{ fontSize:11, color:T.subtle }}>—</p>}
                      {itens.map(p => (
                        <div key={p.id} style={{ padding:"8px", borderRadius:8, marginBottom:6, background:T.bg, border:`1px solid ${T.border}`, cursor: logado ? "pointer" : "default" }} onClick={() => logado && abrirEditarProgramacao(p)}>
                          <div style={{ display:"flex", justifyContent:"space-between" }}>
                            <span style={{ fontSize:11, fontWeight:700, color:T.text }}>{p.casa}</span>
                            {logado && <span onClick={e => { e.stopPropagation(); excluirProgramacao(p.id); }} style={{ fontSize:10, color:T.red, cursor:"pointer", fontWeight:700 }}>✕</span>}
                          </div>
                          <p style={{ fontSize:13, fontWeight:800, color:T.green, marginTop:4 }}>{fmtBRL(p.valor)}</p>
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
          .hero-card { padding: 18px 16px !important; }
          .hero-row { flex-direction: column !important; }
          .hero-row > div:last-child { text-align: left !important; }
          .metrics-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .stats-row { grid-template-columns: 1fr !important; }
          .bonus-row { grid-template-columns: 1fr !important; }
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
function CardAposta({ aposta, bancaMomentoCalc, expandido, setExpandido, editando, setEditando, salvarResultado, salvando, T, logado }: {
  aposta: Aposta; bancaMomentoCalc?: Record<string, number>;
  expandido: string | null; setExpandido: (id: string | null) => void;
  editando: { id: string; resultado: Resultado } | null;
  setEditando: (v: { id: string; resultado: Resultado } | null) => void;
  salvarResultado: () => void; salvando: boolean; T: typeof DARK; logado: boolean;
}) {
  const lucro = calcularLucro(aposta, bancaMomentoCalc?.[aposta.id]);
  const isExp = expandido === aposta.id;
  const nLegs = aposta.detalhes?.length ?? 0;
  const tipoLabel = labelTipo(nLegs);
  const isBonus = aposta.tipo === "bonus";
  const stakeValor = isBonus
    ? (aposta.valor_bonus ?? 0)
    : ((aposta.stake_unidades ?? 1) / 100) * (aposta.banca_momento ?? BANCA_INICIAL);

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
          <p style={{ fontSize:12, fontWeight:600, color:T.text }}>{aposta.casa_aposta}</p>
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

        {!isBonus && <span style={{ fontSize:11, color:T.muted, flexShrink:0 }}>{aposta.stake_unidades}u</span>}
        <span style={{ fontSize:13, fontFamily:"monospace", color:T.blue, fontWeight:700, flexShrink:0 }}>@{aposta.odd_total}</span>
        <ResultadoBadge resultado={aposta.resultado} T={T} />
        {aposta.resultado !== "pendente" && aposta.resultado !== "void" && (
          <span style={{ fontSize:13, fontWeight:800, flexShrink:0, minWidth:72, textAlign:"right", color: lucro>=0 ? T.green : T.red }}>
            {lucro>=0?"+":""}{fmtBRL(lucro)}
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
                ? { label:"Depósito bônus", valor:fmtBRL(aposta.valor_bonus ?? 0) }
                : { label:"Valor apostado", valor:fmtBRL(stakeValor) },
              isBonus
                ? { label:"Lucro máximo", valor:fmtBRL(aposta.lucro_maximo ?? 0) }
                : { label:"Stake", valor:`${aposta.stake_unidades}u` },
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
              logado && <button onClick={() => setEditando({ id:aposta.id, resultado:aposta.resultado })} style={{ padding:"7px 14px", borderRadius:8, border:"none", cursor:"pointer", background:T.blue, color:"white", fontSize:12, fontWeight:700 }}>
                Editar
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
