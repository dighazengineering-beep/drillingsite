/** Ground elevation (metres above sea level) for a point, from the free Open-Meteo elevation service (a 90 m digital elevation model, so approximate). */
export async function elevationAt(lat: number, lng: number): Promise<number | null> {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`, { signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const v = Number(((await r.json()) as { elevation?: number[] }).elevation?.[0]);
    return Number.isFinite(v) ? Math.round(v) : null;
  } catch { return null; }
}
