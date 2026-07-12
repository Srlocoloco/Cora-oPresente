// Tela TelaLogin

import { useState, useEffect, useRef } from "react";
import { Plus, Heart, Truck, CreditCard, Eye, EyeOff, ChevronLeft, Check, Zap, Lock } from "lucide-react";
import type { Usuario, Cliente } from "../types";
import { EMAIL_ADMIN, SENHA_ADMIN, NOME_ADMIN, GOOGLE_CLIENT_ID } from "../constantes";
import { Logo } from "../components/Logo";

// ─── Login Screen ─────────────────────────────────────────────────────────────

export function TelaLogin({
  aoLogar,
  modoInicial = "login",
  aviso,
  aoVoltar,
  clientes = [],
}: {
  aoLogar: (u: Usuario, viaGoogle?: boolean) => void;
  modoInicial?: "login" | "cadastro";
  aviso?: string;
  aoVoltar?: () => void;
  clientes?: Cliente[];
}) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [modo, setModo] = useState<"login" | "cadastro">(modoInicial);
  const [name, setName] = useState("");
  // Cadastro rápido com Google: só pede o nome de usuário
  const [modoGoogle, setModoGoogle] = useState(false);
  const [nomeGoogle, setNomeGoogle] = useState("");
  // Onde o Google desenha o botão oficial de login (quando há Client ID)
  const botaoGoogleRef = useRef<HTMLDivElement>(null);

  // Login real com Google: carrega o script oficial e valida a conta na Google.
  // Quem já tem cadastro entra automaticamente com o e-mail verificado.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return; // sem Client ID configurado, usa o fluxo simulado
    const iniciarGoogle = () => {
      const g = (window as any).google;
      if (!g?.accounts?.id || !botaoGoogleRef.current) return;
      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resposta: any) => {
          try {
            // O Google devolve um token JWT: o payload traz nome e e-mail verificados
            const payload = JSON.parse(
              atob(resposta.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
            );
            aoLogar({ name: payload.name || payload.email.split("@")[0], email: payload.email }, true);
          } catch {
            setErro("Não foi possível entrar com o Google. Tente novamente.");
          }
        },
      });
      g.accounts.id.renderButton(botaoGoogleRef.current, {
        theme: "outline",
        size: "large",
        width: 380,
        text: "continue_with",
        locale: "pt-BR",
      });
    };
    if ((window as any).google?.accounts?.id) { iniciarGoogle(); return; }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = iniciarGoogle;
    document.head.appendChild(script);
  }, []);

  // Cria a conta automaticamente a partir do nome de usuário informado
  const cadastrarComGoogle = () => {
    if (!nomeGoogle.trim()) { setErro("Informe seu nome de usuário."); return; }
    const emailGerado = nomeGoogle.trim().toLowerCase().replace(/\s+/g, ".") + "@gmail.com";
    // Bloqueia tentativas de criar a conta do administrador pelo Google
    if (emailGerado === EMAIL_ADMIN) {
      setErro("Este nome de usuário não está disponível.");
      return;
    }
    setErro("");
    setCarregando(true);
    // Se o usuário já tem cadastro, entra automaticamente na conta existente
    const contaExistente = clientes.find((c) => c.email.toLowerCase() === emailGerado);
    setTimeout(() => {
      setCarregando(false);
      aoLogar(
        contaExistente
          ? { name: contaExistente.name, email: contaExistente.email }
          : { name: nomeGoogle.trim(), email: emailGerado }
      );
    }, 1000);
  };

  const aoEnviarFormulario = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !senha) { setErro("Preencha todos os campos."); return; }
    if (modo === "cadastro" && !name) { setErro("Informe seu nome."); return; }

    const emailLimpo = email.trim().toLowerCase();

    // Conta reservada do Admin: exige a senha correta e não pode ser recadastrada
    if (emailLimpo === EMAIL_ADMIN) {
      if (modo === "cadastro") {
        setErro("Este e-mail é reservado. Use a opção Entrar.");
        return;
      }
      if (senha !== SENHA_ADMIN) {
        setErro("Senha incorreta.");
        return;
      }
    }

    setErro("");
    setCarregando(true);
    setTimeout(() => {
      setCarregando(false);
      // Login da conta reservada usa sempre o nome oficial
      if (emailLimpo === EMAIL_ADMIN) {
        aoLogar({ name: NOME_ADMIN, email: EMAIL_ADMIN });
        return;
      }
      aoLogar({ name: name || email.split("@")[0], email });
    }, 1200);
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[55%] bg-[#4A1218] relative overflow-hidden flex-col">
        <img
          src="https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=900&h=1200&fit=crop&auto=format"
          alt="Shopping"
          className="absolute inset-0 w-full h-full object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#4A1218] via-[#C8102E]/60 to-[#4A1218]/80" />

        <div className="relative z-10 flex flex-col h-full p-12">
          <Logo />

          <div className="flex-1 flex flex-col justify-center">
            <div className="max-w-sm">
              <h1 className="text-4xl font-black text-white leading-tight mb-4">
                Bem-vindo de volta!
              </h1>
              <p className="text-white/65 text-base leading-relaxed mb-10">
                Acesse sua conta e continue aproveitando as melhores ofertas com frete grátis e parcelamento sem juros.
              </p>

              <div className="space-y-4">
                {[
                  { icon: <Truck size={18} />, text: "Frete grátis em milhares de produtos" },
                  { icon: <CreditCard size={18} />, text: "Parcele em até 12x sem juros" },
                  { icon: <Zap size={18} />, text: "Descontos exclusivos pagando com PIX" },
                  { icon: <Heart size={18} />, text: "Parte da receita vai para projetos sociais" },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-3">
                    <span className="text-[#E8B84B]">{item.icon}</span>
                    <span className="text-white/75 text-sm font-medium">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="text-white/30 text-xs">
            © 2026 Coração Presente · Todos os direitos reservados
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 bg-white flex items-center justify-center p-8">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex justify-center">
            <Logo />
          </div>

          {aoVoltar && (
            <button
              onClick={aoVoltar}
              className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-[#C8102E] font-semibold mb-6 transition-colors"
            >
              <ChevronLeft size={15} />
              Voltar para a loja
            </button>
          )}

          {aviso && (
            <div className="bg-red-50 border border-red-200 text-[#C8102E] text-[13px] font-semibold px-4 py-3 rounded-xl mb-6">
              {aviso}
            </div>
          )}

          <div className="mb-8">
            <h2 className="text-2xl font-black text-gray-900">
              {modo === "login" ? "Entrar na sua conta" : "Criar sua conta"}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {modo === "login"
                ? "Informe seu e-mail e senha para continuar"
                : "Preencha os dados abaixo para começar"}
            </p>
          </div>

          <form onSubmit={aoEnviarFormulario} className="space-y-4">
            {modo === "cadastro" && (
              <div>
                <label className="text-[13px] font-semibold text-gray-700 block mb-1.5">
                  Nome completo
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all"
                />
              </div>
            )}

            <div>
              <label className="text-[13px] font-semibold text-gray-700 block mb-1.5">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all"
              />
            </div>

            <div>
              <label className="text-[13px] font-semibold text-gray-700 block mb-1.5">
                Senha
              </label>
              <div className="relative">
                <input
                  type={mostrarSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                >
                  {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {modo === "login" && (
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <div
                    onClick={() => setLembrar(!lembrar)}
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                      lembrar ? "bg-[#C8102E] border-[#C8102E]" : "border-gray-300"
                    }`}
                  >
                    {lembrar && <Check size={10} className="text-white" />}
                  </div>
                  <span className="text-[12px] text-gray-600 font-medium">Lembrar de mim</span>
                </label>
                <button type="button" className="text-[12px] text-[#C8102E] font-semibold hover:underline">
                  Esqueci minha senha
                </button>
              </div>
            )}

            {erro && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
                {erro}
              </div>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="w-full bg-[#C8102E] hover:bg-[#8C1626] disabled:opacity-70 text-white font-black py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-[15px]"
            >
              {carregando ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Entrando...
                </>
              ) : modo === "login" ? (
                "Entrar"
              ) : (
                "Criar conta"
              )}
            </button>

            <div className="relative flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[11px] text-gray-400 font-medium">ou continue com</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Com Client ID: botão oficial do Google (login real).
                Sem Client ID: cadastro simulado pedindo só o nome de usuário. */}
            {GOOGLE_CLIENT_ID ? (
              <div ref={botaoGoogleRef} className="flex justify-center" />
            ) : !modoGoogle ? (
              <button
                type="button"
                onClick={() => { setModoGoogle(true); setErro(""); }}
                className="w-full border-2 border-gray-200 hover:border-gray-300 text-gray-700 font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2.5 text-sm"
              >
                <span className="text-lg">G</span>
                Continuar com Google
              </button>
            ) : (
              <div className="border-2 border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">G</span>
                  <span className="text-[13px] font-bold text-gray-800">Cadastro rápido com Google</span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Informe apenas seu nome de usuário — o resto criamos automaticamente.
                </p>
                <input
                  type="text"
                  value={nomeGoogle}
                  onChange={(e) => setNomeGoogle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); cadastrarComGoogle(); } }}
                  placeholder="Seu nome de usuário"
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setModoGoogle(false); setErro(""); }}
                    className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-2.5 rounded-xl hover:border-gray-300 transition-colors text-[13px]"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={cadastrarComGoogle}
                    disabled={carregando}
                    className="flex-1 bg-[#C8102E] hover:bg-[#8C1626] disabled:opacity-70 text-white font-black py-2.5 rounded-xl transition-colors text-[13px] flex items-center justify-center gap-2"
                  >
                    {carregando ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      "Criar conta"
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>

          <p className="text-center text-[13px] text-gray-500 mt-6">
            {modo === "login" ? "Não tem uma conta?" : "Já tem conta?"}{" "}
            <button
              onClick={() => { setModo(modo === "login" ? "cadastro" : "login"); setErro(""); }}
              className="text-[#C8102E] font-bold hover:underline"
            >
              {modo === "login" ? "Criar conta grátis" : "Entrar"}
            </button>
          </p>

          <div className="flex items-center justify-center gap-1.5 mt-5 text-[11px] text-gray-400">
            <Lock size={11} />
            <span>Seus dados estão seguros e protegidos</span>
          </div>
        </div>
      </div>
    </div>
  );
}
