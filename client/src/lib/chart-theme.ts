import { useTheme } from "@/hooks/use-theme";

/**
 * Colores de los gráficos.
 *
 * Van en JS y no en tokens CSS porque Recharts los escribe como atributos SVG
 * (`stroke="…"`), y un atributo de presentación no resuelve `var(--token)`.
 *
 * El orden categórico es fijo: la primera serie de cualquier gráfico es petróleo,
 * la segunda granate, y así. Nunca se cicla ni se reasigna al filtrar — si al
 * quitar una serie las demás cambiaran de color, dos capturas de la misma
 * pantalla dejarían de ser comparables.
 *
 * Rojo y verde no van juntos en la secuencia a propósito: es la confusión más
 * común (deuteranopía), y separarlos por el morado deja todos los pares
 * adyacentes por encima del umbral. La paleta está verificada con el validador
 * de la guía de visualización en claro y en oscuro: banda de luminosidad, piso
 * de croma, separación bajo daltonismo y contraste contra el fondo.
 *
 * El gris de "Otros" queda fuera de la secuencia: no es una categoría más, es la
 * ausencia de categoría, y por eso no compite en saturación con las demás.
 */
export interface ChartColors {
  /** Serie 1..4, en orden fijo. */
  series: [string, string, string, string];
  /** Agrupador "Otros" / resto. */
  other: string;
  income: string;
  expense: string;
  grid: string;
  axis: string;
  surface: string;
  border: string;
  text: string;
}

const LIGHT: ChartColors = {
  series: ["#00909E", "#A4262C", "#6B3FA0", "#107C41"],
  other: "#8A8886",
  income: "#00909E",
  expense: "#A4262C",
  grid: "#EDEBE9",
  axis: "#605E5C",
  surface: "#FFFFFF",
  border: "#E1E1E1",
  text: "#242424",
};

const DARK: ChartColors = {
  series: ["#2FA3B0", "#D4696E", "#9A7BC8", "#4AA677"],
  other: "#979593",
  income: "#2FA3B0",
  expense: "#D4696E",
  grid: "#332F2E",
  axis: "#A19F9D",
  surface: "#201F1E",
  border: "#3B3A39",
  text: "#F3F2F1",
};

export function useChartColors(): ChartColors {
  const { theme } = useTheme();
  return theme === "dark" ? DARK : LIGHT;
}
