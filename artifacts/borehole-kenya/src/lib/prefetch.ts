import type { QueryClient } from "@tanstack/react-query";
import {
  listServices,
  getService,
  listProducts,
  getProduct,
  listProductCategories,
  getListProductCategoriesQueryKey,
  listProjects,
  getProject,
} from "@workspace/api-client-react";
import { projectPhoto } from "@/lib/projectPhotos";

/** Must match the page size / filters used by the pages so cache keys line up. */
const FIVE_MIN = 5 * 60 * 1000;

const PERSIST_KEY = "kws-cache-v1";
const PERSIST_PREFIXES = ["services", "service", "products", "product", "projects", "project"];
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 60;

/** Warm up the connection to the API as early as possible. */
function preconnect() {
  const base = import.meta.env.VITE_API_URL as string | undefined;
  if (!base) return;
  try {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = new URL(base).origin;
    document.head.appendChild(link);
  } catch {
    /* ignore bad URL */
  }
}

/** Put data saved from the last visit straight into the cache so pages open instantly. */
export function hydrateCache(qc: QueryClient) {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { t: number; entries: [unknown[], unknown, number][] };
    if (!saved?.entries || Date.now() - saved.t > MAX_AGE_MS) return;
    for (const [key, data, updatedAt] of saved.entries) {
      qc.setQueryData(key, data, { updatedAt });
    }
  } catch {
    /* ignore corrupt cache */
  }
}

/** Save list and detail data to this browser (debounced) for the next visit. */
export function persistCache(qc: QueryClient) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  qc.getQueryCache().subscribe(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const entries = qc
          .getQueryCache()
          .getAll()
          .filter(
            (q) =>
              q.state.status === "success" &&
              PERSIST_PREFIXES.includes(String(q.queryKey[0])) &&
              // skip search results
              !(q.queryKey[0] === "products" && q.queryKey[3])
          )
          .slice(0, MAX_ENTRIES)
          .map((q) => [q.queryKey, q.state.data, q.state.dataUpdatedAt]);
        localStorage.setItem(PERSIST_KEY, JSON.stringify({ t: Date.now(), entries }));
      } catch {
        /* storage full or unavailable */
      }
    }, 1500);
  });
}

/** Load every page's data in the background as soon as the site opens. */
export async function prefetchSite(qc: QueryClient) {
  preconnect();

  const safe = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch {
      return undefined;
    }
  };

  // 1. The list pages (these also wake the API server if it was asleep)
  const [services, products, projects] = await Promise.all([
    safe(() => qc.fetchQuery({ queryKey: ["services", "all"], queryFn: () => listServices({}), staleTime: FIVE_MIN })),
    safe(() =>
      qc.fetchQuery({
        queryKey: ["products", "all", false, ""],
        queryFn: () => listProducts({ inStock: undefined, search: undefined, page: 1, limit: 500 }),
        staleTime: FIVE_MIN,
      })
    ),
    safe(() =>
      qc.fetchQuery({
        queryKey: ["projects", "all"],
        queryFn: () => listProjects({ page: 1, limit: 200 }),
        staleTime: FIVE_MIN,
      })
    ),
    safe(() =>
      qc.prefetchQuery({ queryKey: getListProductCategoriesQueryKey(), queryFn: () => listProductCategories(), staleTime: FIVE_MIN })
    ),
  ]);

  // 2. Product pictures, so cards appear fully drawn
  for (const p of products?.items ?? []) {
    if (p.imageUrl) new Image().src = p.imageUrl;
  }

  // 2b. Project card photos (first three pages of the list), so the Projects page paints at once
  for (const p of (projects?.items ?? []).slice(0, 24)) {
    const src = projectPhoto(p.title, p.serviceType)?.src;
    if (src) new Image().src = src;
  }

  // 3. Every detail page behind those lists
  const jobs: Promise<unknown>[] = [];
  for (const s of services ?? []) {
    jobs.push(qc.prefetchQuery({ queryKey: ["service", String(s.id)], queryFn: () => getService(s.id), staleTime: FIVE_MIN }));
  }
  for (const p of products?.items ?? []) {
    jobs.push(qc.prefetchQuery({ queryKey: ["product", String(p.id)], queryFn: () => getProduct(p.id), staleTime: FIVE_MIN }));
  }
  for (const p of (projects?.items ?? []).slice(0, 12)) {
    jobs.push(qc.prefetchQuery({ queryKey: ["project", String(p.id)], queryFn: () => getProject(p.id), staleTime: FIVE_MIN }));
  }
  await Promise.all(jobs);
}
