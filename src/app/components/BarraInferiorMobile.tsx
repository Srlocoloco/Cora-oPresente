// Componente BarraInferiorMobile

import { ShoppingCart, User, Bell, Home, Heart } from "lucide-react";

// ─── Barra Inferior (Mobile) ──────────────────────────────────────────────────

// Navegação fixa no rodapé, visível somente no celular (estilo marketplace):
// Início · Favoritos · Carrinho · Notificações · Eu — o cabeçalho no celular
// fica só com logo + busca; esses atalhos (que incluíam favoritos/perfil/
// carrinho lá em cima) vivem exclusivamente aqui embaixo agora.
export function BarraInferiorMobile({
  ativa,
  qtdCarrinho,
  qtdFavoritos = 0,
  aoIrInicio,
  aoAbrirFavoritos,
  aoAbrirCarrinho,
  aoAbrirPerfil,
  aoAbrirNotificacoes,
  qtdNotificacoes = 0,
}: {
  ativa: "inicio" | "favoritos" | "perfil" | "notificacoes";
  qtdCarrinho: number;
  qtdFavoritos?: number;
  aoIrInicio: () => void;
  aoAbrirFavoritos: () => void;
  aoAbrirCarrinho: () => void;
  aoAbrirPerfil: () => void;
  aoAbrirNotificacoes: () => void;
  qtdNotificacoes?: number;
}) {
  const classeItem = (ativo: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
      ativo ? "text-[#C8102E]" : "text-gray-400"
    }`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-4px_16px_rgba(0,0,0,0.05)] z-40 md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-5">
        <button onClick={aoIrInicio} className={classeItem(ativa === "inicio")}>
          <Home size={20} />
          <span className="text-[10px] font-bold">Início</span>
        </button>
        <button onClick={aoAbrirFavoritos} className={classeItem(ativa === "favoritos")}>
          <div className="relative">
            <Heart size={20} />
            {qtdFavoritos > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-[#C8102E] text-white text-[9px] font-black rounded-full min-w-[15px] h-[15px] px-0.5 flex items-center justify-center">
                {qtdFavoritos}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold">Favoritos</span>
        </button>
        <button onClick={aoAbrirCarrinho} className={classeItem(false)}>
          <div className="relative">
            <ShoppingCart size={20} />
            {qtdCarrinho > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-[#C8102E] text-white text-[9px] font-black rounded-full min-w-[15px] h-[15px] px-0.5 flex items-center justify-center">
                {qtdCarrinho}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold">Carrinho</span>
        </button>
        <button onClick={aoAbrirNotificacoes} className={classeItem(ativa === "notificacoes")}>
          <div className="relative">
            <Bell size={20} />
            {qtdNotificacoes > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-[#C8102E] text-white text-[9px] font-black rounded-full min-w-[15px] h-[15px] px-0.5 flex items-center justify-center">
                {qtdNotificacoes}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold">Avisos</span>
        </button>
        <button onClick={aoAbrirPerfil} className={classeItem(ativa === "perfil")}>
          <User size={20} />
          <span className="text-[10px] font-bold">Eu</span>
        </button>
      </div>
    </nav>
  );
}
