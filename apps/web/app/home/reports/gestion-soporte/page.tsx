import { redirect } from 'next/navigation';

/**
 * Legacy route. The Gestión Soporte report is now the main /home/reports
 * page; this subpath forwards any direct links or bookmarks back there.
 */
export default async function RedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') qs.set(k, v);
  }
  const suffix = qs.toString();
  redirect(`/home/reports${suffix ? `?${suffix}` : ''}`);
}
