// ---------------------------------------------------------------------------
// Formato de tiempo hábil
// ---------------------------------------------------------------------------
// El reloj del Anexo C se mide en MINUTOS hábiles, pero nadie habla así. La
// regla de esta casa: se mide fino y se muestra en la unidad que cada cifra
// pide.
//
//   240  → «4 h»        un tramo corto se lee en horas
//   1920 → «4 días»     uno largo se lee en días
//   1509 → «3d 1,1h»    y uno intermedio dice las dos cosas
//
// Así la cláusula del contrato —«el plazo se extiende día por día»— sigue
// siendo cierta: un día SON 8 horas, y la pantalla lo dice en días cuando la
// cifra llega a una jornada.
//
// Antes esto no existía: el único formateador del repositorio vivía suelto
// dentro de un componente de Settings y no sabía de jornadas.
// ---------------------------------------------------------------------------

/**
 * Una jornada hábil, en minutos. 8 horas efectivas: de 8:00 a 17:00 con la
 * hora de almuerzo descontada, que es lo que pacta el contrato.
 *
 * Tiene que coincidir con el calendario «Proyectos · Anexo C» de la base
 * (00084). Si allí cambia la jornada, aquí también.
 */
export const MINUTOS_JORNADA = 480;

/** Redondea a un decimal sin arrastrar el ruido del punto flotante. */
function unDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Formato corto, para insignias y celdas estrechas: «4 h», «3d 1,1h», «2 días».
 *
 * Devuelve '—' para null o undefined, que es lo que se quiere en una tabla:
 * un hueco honesto en vez de un cero que parece un dato.
 */
export function formatHabil(minutos: number | null | undefined): string {
  if (minutos === null || minutos === undefined) return '—';
  if (minutos <= 0) return '0 h';

  const horas = minutos / 60;

  // Menos de una jornada: en horas, que es como se habla de un trámite.
  if (minutos < MINUTOS_JORNADA) {
    return minutos < 60
      ? `${Math.round(minutos)} min`
      : `${unDecimal(horas)} h`;
  }

  const dias = Math.floor(minutos / MINUTOS_JORNADA);
  const resto = unDecimal((minutos % MINUTOS_JORNADA) / 60);

  if (resto === 0) return dias === 1 ? '1 día' : `${dias} días`;
  return `${dias}d ${resto}h`;
}

/**
 * Formato largo, para frases al cliente: «4 horas hábiles», «3 días hábiles».
 * El portal lo usa porque ahí cada cifra se lee como una afirmación.
 */
export function formatHabilLargo(minutos: number | null | undefined): string {
  if (minutos === null || minutos === undefined) return 'sin datos';
  if (minutos <= 0) return 'sin tiempo acumulado';

  if (minutos < MINUTOS_JORNADA) {
    if (minutos < 60) {
      const m = Math.round(minutos);
      return `${m} ${m === 1 ? 'minuto' : 'minutos'}`;
    }
    const h = unDecimal(minutos / 60);
    return `${h} ${h === 1 ? 'hora hábil' : 'horas hábiles'}`;
  }

  const dias = Math.floor(minutos / MINUTOS_JORNADA);
  const resto = unDecimal((minutos % MINUTOS_JORNADA) / 60);
  const base = `${dias} ${dias === 1 ? 'día hábil' : 'días hábiles'}`;

  return resto === 0 ? base : `${base} y ${resto} h`;
}

/**
 * Las dos unidades a la vez: «3 días (25,1 h)».
 *
 * Para la tabla auditable del portal, donde el cliente compara cifras con el
 * contrato y conviene que no tenga que hacer la cuenta ni fiarse de ella.
 */
export function formatHabilDoble(minutos: number | null | undefined): string {
  if (minutos === null || minutos === undefined) return '—';
  if (minutos < MINUTOS_JORNADA) return formatHabil(minutos);
  return `${formatHabil(minutos)} (${unDecimal(minutos / 60)} h)`;
}

/**
 * Minutos a jornadas, para barras de progreso y proporciones.
 * Devuelve decimales: 1509 minutos son 3,14 jornadas, no 3.
 */
export function enJornadas(minutos: number | null | undefined): number {
  if (!minutos || minutos <= 0) return 0;
  return minutos / MINUTOS_JORNADA;
}
