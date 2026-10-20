import { useEffect, useState } from "react";
import { Link } from "wouter";
import { MapPin, Droplets, Calendar, Layers } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import PageBanner from "@/components/PageBanner";
import { IMAGES, pageBackdrop } from "@/lib/images";
import { projectPhoto } from "@/lib/projectPhotos";
import { useListProjects } from "@workspace/api-client-react";
import { LiveTitle } from "@/components/LiveTitle";

const PAGE_SIZE = 8;
// Project categories, in the order shown on the page
const CATEGORIES = [
  "Hydrogeological Survey",
  "Borehole Drilling",
  "Drilling & Pump",
  "Pump Installation",
  "Test Pumping",
  "Water Purification",
  "Borehole Inspection",
  "Borehole Maintenance",
  "Full Package",
];
const CATEGORY_HINT: Record<string, string> = {
  "Hydrogeological Survey": "Survey only",
  "Borehole Drilling": "Drilling only",
  "Drilling & Pump": "Drilling and pump",
  "Pump Installation": "Pump only",
  "Test Pumping": "Pump test only",
  "Water Purification": "Treatment systems",
  "Borehole Inspection": "Camera check",
  "Borehole Maintenance": "Cleaning and servicing",
  "Full Package": "Survey to pump",
};
const CLIENT_TYPES = ["All", "Community", "Agricultural", "Commercial", "Government", "Healthcare", "Education", "Residential", "Hospitality", "Humanitarian", "Conservation", "Research"];

const CLIENT_COLORS: Record<string, string> = {
  Community: "bg-green-100 text-green-700",
  Agricultural: "bg-yellow-100 text-yellow-700",
  Commercial: "bg-blue-100 text-blue-700",
  Government: "bg-purple-100 text-purple-700",
  Healthcare: "bg-red-100 text-red-700",
  Education: "bg-indigo-100 text-indigo-700",
  Hospitality: "bg-pink-100 text-pink-700",
  Residential: "bg-cyan-100 text-cyan-700",
  Humanitarian: "bg-orange-100 text-orange-700",
  Conservation: "bg-teal-100 text-teal-700",
  Research: "bg-gray-100 text-gray-700",
};

const select =
  "h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

export default function Projects() {
  const [serviceType, setServiceType] = useState("All");
  const [clientType, setClientType] = useState("All");
  const [page, setPage] = useState(1);

  // Load every project once, then filter and page here so category counts are instant.
  const { data, isLoading } = useListProjects(
    { page: 1, limit: 200 },
    { query: { queryKey: ["projects", "all"] } }
  );

  const all = data?.items ?? [];
  const counts: Record<string, number> = {};
  for (const p of all) counts[p.serviceType] = (counts[p.serviceType] ?? 0) + 1;
  const filtered = all.filter(
    (p) => (serviceType === "All" || p.serviceType === serviceType) && (clientType === "All" || p.clientType === clientType)
  );
  const total = filtered.length;
  const projects = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  // Warm the photos for the next page so paging is instant too
  useEffect(() => {
    for (const p of filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const src = projectPhoto(p.title, p.serviceType)?.src;
      if (src) new Image().src = src;
    }
  }, [filtered.length, page, serviceType, clientType]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasFilters = serviceType !== "All" || clientType !== "All";

  function resetFilters() {
    setServiceType("All");
    setClientType("All");
    setPage(1);
  }

  return (
    <div>
      <PageBanner
        image={IMAGES.rig}
        eyebrow="Our Work"
        title="Completed Projects"
        description="Boreholes and water systems delivered for homes, farms and institutions across Kenya."
      >
      </PageBanner>

      <div style={pageBackdrop(IMAGES.backdropTruck, "center 50%")}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div>
          {/* Categories */}
          <div className="mb-3 rounded-xl bg-card/95 p-2 shadow-sm">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]" role="tablist" aria-label="Project categories">
              {["All", ...CATEGORIES].map((c) => {
                const active = serviceType === c;
                const n = c === "All" ? all.length : counts[c] ?? 0;
                return (
                  <button
                    key={c}
                    role="tab"
                    aria-selected={active}
                    onClick={() => { setServiceType(c); setPage(1); }}
                    data-testid={`tab-project-${c}`}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-left transition-colors ${
                      active ? "bg-primary text-primary-foreground shadow" : "bg-muted/60 text-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="block text-xs font-semibold leading-tight whitespace-nowrap">
                      <LiveTitle level="sub" text={c === "All" ? "All projects" : c} hi="#bae6fd" /> <span className={active ? "text-white/80" : "text-muted-foreground"}>({n})</span>
                    </span>
                    <span className={`block text-[10px] leading-tight ${active ? "text-white/75" : "text-muted-foreground"}`}>
                      {c === "All" ? "Every job we have done" : CATEGORY_HINT[c]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filters + count */}
          <div className="flex flex-wrap items-center gap-2 mb-3 rounded-xl bg-card/95 px-3 py-2 shadow-sm">
            <select className={select} value={clientType} onChange={(e) => { setClientType(e.target.value); setPage(1); }} aria-label="Client type">
              {CLIENT_TYPES.map((t) => <option key={t} value={t}>{t === "All" ? "All clients" : t}</option>)}
            </select>
            {hasFilters && (
              <button onClick={resetFilters} className="text-xs text-primary hover:text-primary/70 transition-colors">Clear</button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {isLoading ? "Loading..." : `Showing ${projects.length} of ${total} projects`}
            </span>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {Array(PAGE_SIZE).fill(0).map((_, i) => (
                <Card key={i}><CardContent className="p-0">
                  <Skeleton className="h-24 w-full rounded-t-xl" />
                  <div className="p-3 space-y-2">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </CardContent></Card>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12 rounded-xl bg-card/95 shadow-sm">
              <Droplets className="h-8 w-8 text-muted-foreground/25 mx-auto mb-2" />
              <h3 className="text-sm font-medium text-foreground mb-1">No projects found</h3>
              <p className="text-muted-foreground text-xs mb-3">Try adjusting your filters</p>
              <Button variant="outline" size="sm" onClick={resetFilters}>Clear Filters</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {projects.map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <Card className="h-full group hover:shadow-md transition-all cursor-pointer overflow-hidden" data-testid={`card-project-${project.id}`}>
                    <CardContent className="p-0 flex flex-col h-full">
                      <div className="relative aspect-[3/2] overflow-hidden bg-[hsl(160_52%_14%)]">
                        {(() => {
                          const photo = projectPhoto(project.title, project.serviceType);
                          return photo ? (
                            <img
                              src={photo.src}
                              alt=""
                              decoding="async"
                              className="absolute inset-0 h-full w-full object-cover"
                              style={{ objectPosition: photo.pos }}
                            />
                          ) : (
                            <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, hsl(160 52% 12%) 0%, hsl(155 56% 24%) 60%, hsl(172 58% 30%) 100%)" }}>
                              <Droplets className="absolute right-3 top-3 h-14 w-14 text-white/10" />
                            </div>
                          );
                        })()}
                        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, hsl(160 52% 8% / .1) 0%, hsl(160 52% 8% / .88) 100%)" }} />
                        {project.featured && (
                          <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wider bg-sky-400 text-sky-900 px-1.5 py-0.5 rounded-full">
                            Featured
                          </span>
                        )}
                        <div className="absolute inset-x-0 bottom-0 p-3 text-sm font-bold text-white leading-tight line-clamp-2 group-hover:text-sky-200 transition-colors">
                          <LiveTitle level="sub" text={project.title} hi="#bae6fd" />
                        </div>
                      </div>

                      <div className="p-3 flex flex-col flex-1">
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${CLIENT_COLORS[project.clientType] ?? "bg-gray-100 text-gray-700"}`}>
                            {project.clientType}
                          </span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                            {project.serviceType}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mb-1.5">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{project.town}, {project.county} County</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2 flex-1 mb-2">
                          {project.description}
                        </p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground border-t border-border pt-2">
                          {project.depth && (
                            <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {project.depth}m</span>
                          )}
                          {project.yield && (
                            <span className="flex items-center gap-1"><Droplets className="h-3 w-3" /> {project.yield}</span>
                          )}
                          <span className="flex items-center gap-1 ml-auto"><Calendar className="h-3 w-3" /> {project.completionYear}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mx-auto mt-4 flex w-fit items-center justify-center gap-2 rounded-full bg-card/95 px-3 py-1.5 shadow-sm">
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="px-3 text-xs text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </div>

        {/* Slim CTA */}
        <div className="mt-4 rounded-xl bg-card/95 border border-primary/20 shadow-sm px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-sm font-semibold text-foreground"><LiveTitle level="sub" text="Start your own water project" hi="#0ea5e9" /></span>
          <div className="flex gap-2">
            <Button asChild size="sm" className="h-8 text-xs"><Link href="/contact">Request a Free Quote</Link></Button>
            <a href="tel:+254110699444">
              <Button size="sm" variant="outline" className="h-8 text-xs">Call +254 110 699 444</Button>
            </a>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
