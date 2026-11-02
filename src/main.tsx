import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './interacoes.css'
import App from './App.tsx'

import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";

// Teste/ensaio do fluxo offline sem servidor: so em desenvolvimento, com ?simular no
// endereco (o build de producao remove este trecho).
const preparar =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has("simular")
    ? import("./dev/apiSimulada")
    : Promise.resolve();

void preparar.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

if (import.meta.env.DEV && "serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registros) =>
    Promise.all(registros.map((registro) => registro.unregister()))
  );

  if ("caches" in window) {
    void caches.keys().then((chaves) =>
      Promise.all(
        chaves
          .filter((chave) => chave.startsWith("fieldpro-app-"))
          .map((chave) => caches.delete(chave))
      )
    );
  }
}
