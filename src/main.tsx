
  import { createRoot } from "react-dom/client";
  import { Toaster } from "sonner";
  import App from "./app/App";
  import "./styles/index.css";
  import { registrarServiceWorker } from "./app/notificacoesPush";

  createRoot(document.getElementById("root")!).render(
    <>
      <App />
      <Toaster richColors position="top-center" />
    </>
  );

  // Registra o service worker (notificações + ícone na tela inicial). Não
  // bloqueia nada: se o navegador não aceitar, o site segue igual.
  registrarServiceWorker();
