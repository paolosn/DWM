/**
 * Módulo 33A — Design System. Tokens del sistema visual (documento
 * DWM_Especificacion_UX_UI_y_Pantallas_v2.0_FINAL §5). Única fuente
 * programática de valores de color, tipografía, geometría y movimiento:
 * ningún componente debe declarar estos valores de forma literal.
 *
 * Los mismos valores se reflejan como variables CSS en `tokens.css`
 * (consumidas por los estilos) para que ambos permanezcan sincronizados
 * manualmente hasta que exista un pipeline de generación compartido.
 */

export const colorTokens = {
  backgroundPrimary: "#F5F5F7",
  surface: "#FFFFFF",
  borderSubtle: "#E5E5E7",
  textPrimary: "#1D1D1F",
  textSecondary: "#6E6E73",
  textDisabled: "#A1A1A6",
  accent: "#007AFF",
  success: "#248A3D",
  warning: "#B26A00",
  danger: "#D70015",
} as const;

export type ColorToken = keyof typeof colorTokens;

export const fontFamily = '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const typographyTokens = {
  screenTitle: { size: "26px", weight: 600, lineHeight: "32px" },
  sectionTitle: { size: "17px", weight: 600, lineHeight: "24px" },
  body: { size: "14px", weight: 400, lineHeight: "20px" },
  meta: { size: "12px", weight: 400, lineHeight: "16px" },
} as const;

export type TypographyToken = keyof typeof typographyTokens;

/** Unidad base 4px (documento §5 "Geometría"). */
export const spacingUnit = 4;

export const spacingTokens = {
  xs: "8px",
  sm: "12px",
  md: "16px",
  lg: "24px",
  xl: "32px",
} as const;

export type SpacingToken = keyof typeof spacingTokens;

export const radiusTokens = {
  card: "12px",
  control: "8px",
} as const;

export const shadowTokens = {
  /** Sombra discreta única permitida (documento: "sombras discretas"). */
  resting: "0 1px 2px rgba(29, 29, 31, 0.06), 0 1px 1px rgba(29, 29, 31, 0.04)",
  raised: "0 4px 12px rgba(29, 29, 31, 0.10)",
} as const;

export const controlSizeTokens = {
  buttonMinHeight: "36px",
  primaryActionHeight: "40px",
} as const;

export const motionTokens = {
  hover: "140ms",
  menu: "160ms",
  overlay: "200ms",
} as const;
