import type { ViabilityBriefingInput } from "./ProjectProvisioningTypes.js";

/**
 * Genera el contenido de `briefing-inicial.md` con las mismas secciones
 * que `SISTEMA-DE-TRABAJO/PSN-PANEL/app.js` (`crearProyecto()`): función
 * pura, sin efectos de disco — el llamador decide dónde escribirlo.
 */
export function buildBriefingMarkdown(projectName: string, input: ViabilityBriefingInput): string {
  const fecha = new Date().toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push(`# Briefing Inicial — ${projectName}`);
  lines.push(`**Fecha:** ${fecha}`);
  lines.push("**Estado:** En briefing — leer antes de empezar");
  lines.push("");
  lines.push("---");
  lines.push("");

  lines.push("## Análisis de viabilidad");
  lines.push(`- **Veredicto:** ${input.veredicto ?? "No disponible"}`);
  if (input.explicacionVeredicto) lines.push(`- **Explicación:** ${input.explicacionVeredicto}`);
  lines.push(`- **Precio de mercado:** ${input.precioMercado ?? "No estimado"}`);
  lines.push(`- **Precio mínimo recomendado:** ${input.precioMinimoRecomendado ?? "No estimado"}`);
  if (input.presupuestoCliente)
    lines.push(`- **Presupuesto del cliente:** ${input.presupuestoCliente}`);
  lines.push("");

  if (input.notasNegociacion) {
    lines.push("## Precio acordado y notas de negociación");
    lines.push(input.notasNegociacion);
    lines.push("");
  }

  if (input.equipoNecesario && input.equipoNecesario.length > 0) {
    lines.push("## Equipo necesario");
    for (const item of input.equipoNecesario) lines.push(`- ${item}`);
    lines.push("");
  }

  if (input.riesgos && input.riesgos.length > 0) {
    lines.push("## Riesgos identificados");
    for (const item of input.riesgos) lines.push(`- ${item}`);
    lines.push("");
  }

  if (input.preguntasAlCliente && input.preguntasAlCliente.length > 0) {
    lines.push("## Preguntas pendientes de responder");
    lines.push(
      "_Estas preguntas fueron identificadas en el análisis. Completa las respuestas antes de arrancar._"
    );
    lines.push("");
    input.preguntasAlCliente.forEach((pregunta, index) => {
      lines.push(`${index + 1}. ${pregunta}`);
      lines.push("   **Respuesta:** (pendiente)");
      lines.push("");
    });
  }

  if (input.serviciosExternos && input.serviciosExternos.length > 0) {
    lines.push("## Servicios externos necesarios");
    for (const item of input.serviciosExternos) lines.push(`- ${item}`);
    lines.push("");
  }

  if (input.siguientePaso) {
    lines.push("## Siguiente paso");
    lines.push(input.siguientePaso);
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}
