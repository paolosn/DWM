import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

/**
 * Módulo 32 — Desktop Application. Bootstrap del renderer. Deliberadamente
 * mínimo (montaje en el DOM real): la lógica testeable vive en `App.tsx` y
 * en `shell/*`. No se incluye en la cobertura de pruebas unitarias por la
 * misma razón que `main/index.ts` no lo está.
 */
const container = document.getElementById("root");
if (!container) {
  throw new Error('No se encontró el elemento raíz "#root" en index.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
