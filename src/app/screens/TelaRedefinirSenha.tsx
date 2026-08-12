// Tela TelaRedefinirSenha — aberta pelo link que o cliente recebe por e-mail
// (?redefinir-senha=TOKEN) depois de pedir "Esqueci minha senha".

import { useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { URL_BACKEND_PIX } from "../constantes";
import { Logo } from "../components/Logo";
import { IndicadorForcaSenha } from "../components/IndicadorForcaSenha";

export function TelaRedefinirSenha({ token, aoConcluir }: { token: string; aoConcluir: () => void }) {
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  const aoEnviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < 8) { setErro("A senha precisa ter pelo menos 8 caracteres."); return; }
    if (!/[a-z]/.test(senha)) { setErro("A senha precisa ter pelo menos uma letra minúscula."); return; }
    if (!/[A-Z]/.test(senha)) { setErro("A senha precisa ter pelo menos uma letra maiúscula."); return; }
    if (!/[0-9]/.test(senha)) { setErro("A senha precisa ter pelo menos um número."); return; }
    if (!/[^A-Za-z0-9]/.test(senha)) { setErro("A senha precisa ter pelo menos um caractere especial (ex.: !@#$%)."); return; }
    if (senha !== confirmar) { setErro("As senhas não são iguais."); return; }
    setErro("");
    setCarregando(true);
    try {
      const resposta = await fetch(`${URL_BACKEND_PIX}/api/clientes/redefinir-senha`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, novaSenha: senha }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      setCarregando(false);
      if (!resposta.ok) {
        setErro(corpo?.erro || "Não foi possível redefinir a senha.");
        return;
      }
      setSucesso(true);
    } catch {
      setCarregando(false);
      setErro("Não foi possível conectar ao servidor. Tente novamente.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="w-full max-w-[400px] bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex justify-center mb-6">
          <Logo />
        </div>

        {sucesso ? (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
              <Lock size={20} className="text-emerald-600" />
            </div>
            <h2 className="text-xl font-black text-gray-900">Senha redefinida!</h2>
            <p className="text-gray-500 text-sm">Já pode entrar na sua conta com a senha nova.</p>
            <button
              onClick={aoConcluir}
              className="w-full bg-[#C8102E] hover:bg-[#8C1626] text-white font-black py-3 rounded-xl transition-colors text-sm"
            >
              Ir para o login
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-black text-gray-900 mb-1">Escolha uma senha nova</h2>
            <p className="text-gray-500 text-sm mb-6">Crie uma senha forte para proteger sua conta.</p>
            <form onSubmit={aoEnviar} className="space-y-4">
              <div>
                <label className="text-[13px] font-semibold text-gray-700 block mb-1.5">Senha nova</label>
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  >
                    {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <IndicadorForcaSenha senha={senha} />
              </div>
              <div>
                <label className="text-[13px] font-semibold text-gray-700 block mb-1.5">Confirme a senha</label>
                <input
                  type={mostrarSenha ? "text" : "password"}
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-[#C8102E] focus:ring-2 focus:ring-[#C8102E]/10 transition-all"
                />
              </div>
              {erro && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-[12px] font-medium px-3 py-2.5 rounded-lg">
                  {erro}
                </div>
              )}
              <button
                type="submit"
                disabled={carregando}
                className="w-full bg-[#C8102E] hover:bg-[#8C1626] disabled:opacity-70 text-white font-black py-3.5 rounded-xl transition-colors text-[15px]"
              >
                {carregando ? "Salvando..." : "Redefinir senha"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
