import { bannerBackground, photoLayer, PLAIN_BANNER } from "@/lib/images";
import { LiveTitle } from "@/components/LiveTitle";
import { projectPhoto, projectBackdrop } from "@/lib/projectPhotos";
import { Link, useParams } from "wouter";
import { ArrowLeft, MapPin, Droplets, Calendar, Layers, Clock, Users, Target, Lightbulb, TrendingUp, MessageSquare, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useGetProject } from "@workspace/api-client-react";
import { whatsappLink } from "@/lib/utils";

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

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading } = useGetProject(Number(id), {
    query: { queryKey: ["project", id] },
  });

  if (isLoading) {
    return (
      <div className="bg-background pt-[80px] pb-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-6 w-32 mb-8" />
          <Skeleton className="h-64 w-full rounded-xl mb-8" />
          <div className="grid grid-cols-2 gap-4 mb-8">
            {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-[60vh] bg-background pt-20 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Project Not Found</h1>
          <Button asChild><Link href="/projects">Browse Projects</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Hero */}
      <div
        className="relative overflow-hidden text-white pt-[76px] pb-6"
        style={{ background: projectPhoto(project.title, project.serviceType, project.imageUrl) ? bannerBackground(projectPhoto(project.title, project.serviceType, project.imageUrl)!.src, projectPhoto(project.title, project.serviceType, project.imageUrl)!.pos, false) : PLAIN_BANNER }}
      >
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/projects" className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-3 transition-colors">
            <ArrowLeft className="h-4 w-4" /> All Projects
          </Link>

          <div className="flex flex-wrap gap-2 mb-3">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CLIENT_COLORS[project.clientType] ?? "bg-white/20 text-white"}`}>
              {project.clientType}
            </span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20 text-white">
              {project.serviceType}
            </span>
            {project.featured && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-sky-400 text-sky-900">
                Featured Project
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 leading-tight"><LiveTitle text={project.title} hi="#bae6fd" /></h1>

          <div className="flex flex-wrap gap-5 text-sm text-white/70">
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-white/50" />
              {project.town}, {project.county}{/^(Kenya|South Sudan)$/.test(project.county) ? "" : " County"}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-white/50" />
              {project.region}
            </span>
            {project.completionYear > 0 && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-white/50" />
                Completed {project.completionYear}
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        style={
          projectBackdrop(project.title, project.serviceType)
            ? {
                backgroundColor: "var(--live-bg, hsl(160 52% 10%))",
                backgroundImage: `linear-gradient(180deg, hsl(160 52% 8% / .55) 0%, hsl(160 52% 8% / .28) 40%, hsl(160 52% 8% / .55) 100%), ${photoLayer(projectBackdrop(project.title, project.serviceType)!.src)}`,
                backgroundSize: "cover",
                backgroundPosition: projectBackdrop(project.title, project.serviceType)!.pos,
              }
            : undefined
        }
      >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Key stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { icon: Layers, label: project.serviceType === "Hydrogeological Survey" ? "Recommended Depth" : "Borehole Depth", value: project.depth ? `${project.depth}m` : "N/A" },
            { icon: Droplets, label: project.serviceType === "Water Purification" ? "Treatment Capacity" : project.serviceType === "Hydrogeological Survey" ? "Expected Yield" : project.serviceType === "Borehole Inspection" ? "Deliverable" : project.serviceType === "Borehole Maintenance" ? "Yield (before → after)" : "Water Yield", value: project.yield ?? "N/A" },
            { icon: Clock, label: "Duration", value: project.duration ?? "N/A" },
            { icon: Calendar, label: "Year", value: project.completionYear > 0 ? project.completionYear.toString() : "N/A" },
          ].filter((stat) => stat.value !== "N/A").map((stat) => (
            <div key={stat.label} className="bg-card/95 border border-border rounded-xl p-4 text-center shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <stat.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="text-lg font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Description */}
        <div className="mb-6 rounded-xl border border-border bg-card/95 p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-foreground mb-3"><LiveTitle text="The Story" hi="#0ea5e9" /></h2>
          <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{project.description}</p>
        </div>

        {/* Challenge / Solution / Outcome */}
        {(project.challenge || project.solution || project.outcome) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
            {project.challenge && (
              <Card className="border-red-200">
                <CardContent className="p-5">
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mb-3">
                    <Target className="h-4 w-4 text-red-500" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2 text-sm"><LiveTitle level="sub" text="What we ran into" hi="#0ea5e9" /></h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{project.challenge}</p>
                </CardContent>
              </Card>
            )}
            {project.solution && (
              <Card className="border-blue-200">
                <CardContent className="p-5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
                    <Lightbulb className="h-4 w-4 text-blue-500" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2 text-sm"><LiveTitle level="sub" text="How we did it" hi="#0ea5e9" /></h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{project.solution}</p>
                </CardContent>
              </Card>
            )}
            {project.outcome && (
              <Card className="border-green-200">
                <CardContent className="p-5">
                  <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center mb-3">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2 text-sm"><LiveTitle level="sub" text="How it ended" hi="#0ea5e9" /></h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{project.outcome}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Location info */}
        <Card className="mb-6 border-border bg-card/95 shadow-sm">
          <CardContent className="p-5">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Project Location
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><span className="text-muted-foreground block text-xs mb-0.5">County</span><span className="font-medium">{project.county}</span></div>
              <div><span className="text-muted-foreground block text-xs mb-0.5">Town</span><span className="font-medium">{project.town}</span></div>
              <div><span className="text-muted-foreground block text-xs mb-0.5">Region</span><span className="font-medium">{project.region}</span></div>
              <div><span className="text-muted-foreground block text-xs mb-0.5">Client Type</span><span className="font-medium">{project.clientType}</span></div>
            </div>
            {project.latitude && project.longitude && (
              <a
                href={`https://www.google.com/maps?q=${project.latitude},${project.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/70 mt-4 transition-colors"
              >
                <MapPin className="h-3.5 w-3.5" /> View on Google Maps →
              </a>
            )}
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="rounded-xl bg-card/95 border border-primary/20 shadow-sm p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div>
            <h3 className="font-semibold text-foreground mb-1"><LiveTitle level="sub" text="Want a Similar Project?" hi="#0ea5e9" /></h3>
            <p className="text-sm text-muted-foreground">We can deliver the same results for your home, farm, or business anywhere in Kenya.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
            <Button asChild>
              <Link href="/contact">Get a Quote</Link>
            </Button>
            <a
              href={whatsappLink(`Hello, I saw your project "${project.title}" in ${project.county} and I'd like something similar. Please advise.`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full sm:w-auto border-[#25D366] text-[#25D366] hover:bg-green-50">
                <MessageSquare className="mr-2 h-4 w-4" /> WhatsApp Us
              </Button>
            </a>
          </div>
        </div>

        {/* Back link */}
        <div className="mt-6 text-center">
          <Link href="/projects" className="inline-flex items-center gap-2 rounded-full bg-card/95 px-4 py-2 text-muted-foreground hover:text-foreground text-sm shadow-sm transition-colors">
            <ArrowLeft className="h-4 w-4" /> Browse all projects
          </Link>
        </div>
      </div>
      </div>
    </div>
  );
}
