import { useState } from "react";
import { callOperation, DwmOperationError } from "../../api-client/index.js";
import { PageHeader } from "../../design-system/composites/PageHeader/index.js";
import { Card } from "../../design-system/primitives/Card/index.js";
import { Button } from "../../design-system/primitives/Button/index.js";
import { TextField } from "../../design-system/primitives/TextField/index.js";
import { TextArea } from "../../design-system/primitives/TextArea/index.js";
import { Select } from "../../design-system/primitives/Select/index.js";
import { InlineAlert } from "../../design-system/composites/InlineAlert/index.js";
import { ErrorState } from "../../design-system/composites/ErrorState/index.js";
import { useToast } from "../../design-system/composites/Toast/index.js";
import "./ProvisioningScreen.css";

type Category = "viabilidad" | "auditoria" | "seguridad" | "directo";

const CATEGORY_LABEL: Record<Category, string> = {
  viabilidad: "Nueva viabilidad",
  auditoria: "Nueva auditoría",
  seguridad: "Nueva revisión de seguridad",
  directo: "Nuevo proyecto directo",
};

const TIPO_TRABAJO_OPTIONS = [
  { value: "wordpress", label: "WordPress" },
  { value: "web", label: "Web" },
  { value: "aplicacion", label: "Aplicación" },
  { value: "plugin", label: "Plugin" },
  { value: "automatizacion", label: "Automatización" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "otro", label: "Otro" },
];

interface FormFields {
  cliente: string;
  nombreProyecto: string;
  descripcion: string;
  objetivo: string;
  tecnologia: string;
  origenCodigo: string;
  tipoTrabajo: string;
  precio: string;
  plazo: string;
  email: string;
  telefono: string;
  notas: string;
}

const EMPTY_FIELDS: FormFields = {
  cliente: "",
  nombreProyecto: "",
  descripcion: "",
  objetivo: "",
  tecnologia: "",
  origenCodigo: "",
  tipoTrabajo: "",
  precio: "",
  plazo: "",
  email: "",
  telefono: "",
  notas: "",
};

interface CreateResult {
  readonly projectId: string;
  readonly clientId: string;
  readonly clientCreated: boolean;
  readonly projectPath: string;
  readonly vsCodeOpened: boolean;
  readonly vsCodeMessage: string;
}

interface ViabilityReport {
  readonly veredicto: string;
  readonly puntuacion: number;
  readonly resumen: string;
  readonly riesgos: readonly string[];
  readonly complejidad: string;
  readonly plazoEstimado: string;
  readonly costeOrientativo: string;
  readonly preguntasPendientes: readonly string[];
  readonly recomendacion: string;
  readonly siguientePaso: string;
  readonly providerId: string;
  readonly model?: string;
}

/**
 * client-workflow-v2 — punto de entrada humano principal (README
 * secciones 1-3): Nueva viabilidad / Nueva auditoría / Nueva revisión de
 * seguridad / Nuevo proyecto directo. Las cuatro llaman a la misma
 * operación real `provisioning.create-project` (discriminada por
 * categoría) — nunca piden ruta, perfil, Workspace ni configuración
 * técnica: el motor resuelve todo eso automáticamente (Workspace activo,
 * perfil activo/único, ubicación por categoría, duplicado de PSN-BASE).
 * Tras crear el proyecto: se abre VS Code automáticamente (reutilizando
 * `EnvironmentManager.openInVSCode`, ya probado), el proyecto queda
 * activo, y se muestra una confirmación clara con ambos resultados.
 */
export function ProvisioningScreen(): JSX.Element {
  const { showToast } = useToast();
  const [category, setCategory] = useState<Category | null>(null);
  const [fields, setFields] = useState<FormFields>(EMPTY_FIELDS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<CreateResult | undefined>(undefined);

  const [analysis, setAnalysis] = useState<ViabilityReport | undefined>(undefined);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | undefined>(undefined);

  async function handleAnalyze(): Promise<void> {
    if (!fields.descripcion.trim() || !fields.nombreProyecto.trim()) return;
    setAnalyzing(true);
    setAnalysisError(undefined);
    setAnalysis(undefined);
    try {
      const report = (await callOperation("provisioning.analyze-viability", {
        project: {
          projectName: fields.nombreProyecto.trim(),
          descripcion: fields.descripcion.trim(),
          ...(fields.objetivo.trim() ? { objetivo: fields.objetivo.trim() } : {}),
          ...(fields.precio.trim() ? { presupuesto: fields.precio.trim() } : {}),
          ...(fields.plazo.trim() ? { plazo: fields.plazo.trim() } : {}),
          ...(fields.tecnologia.trim() ? { tecnologia: fields.tecnologia.trim() } : {}),
          ...(fields.notas.trim() ? { notas: fields.notas.trim() } : {}),
        },
      })) as ViabilityReport;
      setAnalysis(report);
    } catch (err) {
      setAnalysisError(
        err instanceof DwmOperationError ? err.message : "No se pudo generar el análisis."
      );
    } finally {
      setAnalyzing(false);
    }
  }

  function setField<K extends keyof FormFields>(key: K, value: string): void {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function reset(): void {
    setCategory(null);
    setFields(EMPTY_FIELDS);
    setError(undefined);
    setResult(undefined);
    setAnalysis(undefined);
    setAnalysisError(undefined);
  }

  function buildDescription(): string {
    const parts = [fields.descripcion.trim()];
    if (category === "viabilidad" && fields.objetivo.trim()) {
      parts.push(`Objetivo: ${fields.objetivo.trim()}`);
    }
    if (category === "seguridad" && fields.objetivo.trim()) {
      parts.push(`Objetivo de la revisión: ${fields.objetivo.trim()}`);
    }
    return parts.filter(Boolean).join("\n\n");
  }

  function buildNotas(): string {
    const parts: string[] = [];
    if (category === "seguridad" && fields.origenCodigo.trim()) {
      parts.push(`Origen del código: ${fields.origenCodigo.trim()}`);
    }
    if (fields.notas.trim()) parts.push(fields.notas.trim());
    return parts.join("\n\n");
  }

  async function handleSubmit(): Promise<void> {
    if (!category || !fields.cliente.trim() || !fields.nombreProyecto.trim()) return;
    setSubmitting(true);
    setError(undefined);
    setResult(undefined);
    try {
      const created = (await callOperation("provisioning.create-project", {
        category,
        client: {
          name: fields.cliente.trim(),
          ...(fields.email.trim() ? { email: fields.email.trim() } : {}),
          ...(fields.telefono.trim() ? { telefono: fields.telefono.trim() } : {}),
        },
        project: {
          name: fields.nombreProyecto.trim(),
          ...(buildDescription() ? { description: buildDescription() } : {}),
          ...(fields.tecnologia.trim() && (category === "auditoria" || category === "seguridad")
            ? { tipoTrabajo: fields.tecnologia.trim() }
            : {}),
          ...(category === "directo" && fields.tipoTrabajo
            ? { tipoTrabajo: fields.tipoTrabajo }
            : {}),
          ...(fields.precio.trim() ? { precioOModalidad: fields.precio.trim() } : {}),
          ...(fields.plazo.trim() ? { plazo: fields.plazo.trim() } : {}),
          ...(buildNotas() ? { notas: buildNotas() } : {}),
        },
        ...(category === "viabilidad"
          ? {
              briefing: analysis
                ? {
                    veredicto: analysis.veredicto,
                    explicacionVeredicto: analysis.resumen,
                    precioMercado: analysis.costeOrientativo,
                    riesgos: analysis.riesgos,
                    preguntasAlCliente: analysis.preguntasPendientes,
                    siguientePaso: analysis.siguientePaso,
                    notasNegociacion: `Puntuación de viabilidad: ${analysis.puntuacion}/100. Complejidad: ${analysis.complejidad}. Plazo estimado: ${analysis.plazoEstimado}. Recomendación: ${analysis.recomendacion}`,
                  }
                : {
                    ...(fields.precio.trim() ? { presupuestoCliente: fields.precio.trim() } : {}),
                    ...(fields.objetivo.trim() ? { siguientePaso: fields.objetivo.trim() } : {}),
                    ...(fields.notas.trim() ? { notasNegociacion: fields.notas.trim() } : {}),
                  },
            }
          : {}),
      })) as CreateResult;

      setResult(created);
      showToast({
        title: `Proyecto «${fields.nombreProyecto.trim()}» creado y activado`,
        tone: "success",
      });
    } catch (err) {
      setError(err instanceof DwmOperationError ? err.message : "Error desconocido.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="dwm-provisioning-screen">
        <PageHeader title={CATEGORY_LABEL[category ?? "directo"]} description="Proyecto creado" />
        <Card>
          <InlineAlert tone="success" title="Proyecto creado y activado">
            «{fields.nombreProyecto}» está listo. Cliente{" "}
            {result.clientCreated ? "nuevo" : "existente reutilizado"}.
          </InlineAlert>
          <InlineAlert tone={result.vsCodeOpened ? "success" : "warning"} title="VS Code">
            {result.vsCodeMessage}
          </InlineAlert>
          <Button onClick={reset}>Crear otro</Button>
        </Card>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="dwm-provisioning-screen">
        <PageHeader
          title="Nuevo trabajo"
          description="El flujo principal de DWM: sin rutas, sin perfiles técnicos."
        />
        <div className="dwm-provisioning-screen__grid">
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => (
            <Card key={cat}>
              <h2 className="dwm-provisioning-screen__card-title">{CATEGORY_LABEL[cat]}</h2>
              <Button onClick={() => setCategory(cat)}>Empezar</Button>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="dwm-provisioning-screen">
      <PageHeader title={CATEGORY_LABEL[category]} />
      <Card>
        <div className="dwm-provisioning-screen__form">
          <TextField
            label="Cliente o empresa"
            required
            value={fields.cliente}
            onChange={(e) => setField("cliente", e.target.value)}
            hint="Si ya existe un cliente con este nombre, se reutiliza automáticamente."
          />
          <TextField
            label="Nombre del proyecto"
            required
            value={fields.nombreProyecto}
            onChange={(e) => setField("nombreProyecto", e.target.value)}
          />

          {(category === "viabilidad" || category === "auditoria") && (
            <TextArea
              label={
                category === "viabilidad" ? "Descripción del proyecto" : "Qué quiere conseguir"
              }
              value={fields.descripcion}
              onChange={(e) => setField("descripcion", e.target.value)}
            />
          )}
          {category === "seguridad" && (
            <>
              <TextField
                label="Origen del código"
                value={fields.origenCodigo}
                onChange={(e) => setField("origenCodigo", e.target.value)}
                hint="Nunca se ejecuta automáticamente el código importado."
              />
              <TextArea
                label="Objetivo de la revisión"
                value={fields.objetivo}
                onChange={(e) => setField("objetivo", e.target.value)}
              />
            </>
          )}
          {category === "viabilidad" && (
            <TextArea
              label="Objetivo"
              value={fields.objetivo}
              onChange={(e) => setField("objetivo", e.target.value)}
            />
          )}
          {category === "directo" && (
            <TextArea
              label="Descripción"
              value={fields.descripcion}
              onChange={(e) => setField("descripcion", e.target.value)}
            />
          )}

          {(category === "auditoria" || category === "seguridad") && (
            <TextField
              label="Tecnología (si se conoce)"
              value={fields.tecnologia}
              onChange={(e) => setField("tecnologia", e.target.value)}
            />
          )}
          {category === "directo" && (
            <Select
              label="Tipo de trabajo"
              options={TIPO_TRABAJO_OPTIONS}
              placeholder="Selecciona un tipo"
              value={fields.tipoTrabajo}
              onChange={(e) => setField("tipoTrabajo", e.target.value)}
            />
          )}

          <TextField
            label={
              category === "auditoria" ? "Precio de auditoría" : "Precio o modalidad (opcional)"
            }
            value={fields.precio}
            onChange={(e) => setField("precio", e.target.value)}
          />
          <TextField
            label={category === "auditoria" ? "Plazo de entrega" : "Plazo (opcional)"}
            value={fields.plazo}
            onChange={(e) => setField("plazo", e.target.value)}
          />

          <div className="dwm-provisioning-screen__row">
            <TextField
              label="Email de contacto (opcional)"
              value={fields.email}
              onChange={(e) => setField("email", e.target.value)}
            />
            <TextField
              label="Teléfono de contacto (opcional)"
              value={fields.telefono}
              onChange={(e) => setField("telefono", e.target.value)}
            />
          </div>

          <TextArea
            label="Notas (opcional)"
            value={fields.notas}
            onChange={(e) => setField("notas", e.target.value)}
          />

          {error && <ErrorState title="No se pudo crear el proyecto" technicalDetail={error} />}

          {category === "viabilidad" && analysisError && (
            <ErrorState title="No se pudo generar el análisis" technicalDetail={analysisError} />
          )}

          {category === "viabilidad" && analysis && (
            <div className="dwm-provisioning-screen__report">
              <InlineAlert
                tone={analysis.puntuacion >= 60 ? "success" : "warning"}
                title={`${analysis.veredicto} — ${analysis.puntuacion}/100`}
              >
                {analysis.resumen}
              </InlineAlert>
              <dl className="dwm-provisioning-screen__report-grid">
                <dt>Complejidad</dt>
                <dd>{analysis.complejidad}</dd>
                <dt>Plazo estimado</dt>
                <dd>{analysis.plazoEstimado}</dd>
                <dt>Coste orientativo</dt>
                <dd>{analysis.costeOrientativo}</dd>
                <dt>Recomendación</dt>
                <dd>{analysis.recomendacion}</dd>
                <dt>Siguiente paso</dt>
                <dd>{analysis.siguientePaso}</dd>
              </dl>
              {analysis.riesgos.length > 0 && (
                <div>
                  <strong>Riesgos</strong>
                  <ul>
                    {analysis.riesgos.map((riesgo, i) => (
                      <li key={i}>{riesgo}</li>
                    ))}
                  </ul>
                </div>
              )}
              {analysis.preguntasPendientes.length > 0 && (
                <div>
                  <strong>Preguntas pendientes</strong>
                  <ul>
                    {analysis.preguntasPendientes.map((pregunta, i) => (
                      <li key={i}>{pregunta}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="dwm-provisioning-screen__actions">
            <Button variant="secondary" onClick={reset}>
              Cancelar
            </Button>
            {category === "viabilidad" && !analysis ? (
              <Button
                onClick={() => void handleAnalyze()}
                loading={analyzing}
                disabled={!fields.descripcion.trim() || !fields.nombreProyecto.trim()}
              >
                Generar análisis
              </Button>
            ) : (
              <Button
                onClick={() => void handleSubmit()}
                loading={submitting}
                disabled={!fields.cliente.trim() || !fields.nombreProyecto.trim()}
              >
                {category === "viabilidad"
                  ? "Cliente acepta — crear proyecto"
                  : category === "auditoria"
                    ? "Cliente acepta — preparar auditoría"
                    : category === "seguridad"
                      ? "Confirmar"
                      : "Crear proyecto"}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
