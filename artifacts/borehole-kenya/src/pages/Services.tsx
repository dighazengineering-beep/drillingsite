import { Link } from "wouter";
import { ArrowRight, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useListServices } from "@workspace/api-client-react";
import { formatKES } from "@/lib/utils";
import { IMAGES, pickImage, pageBackdrop } from "@/lib/images";
import BlendedPhoto from "@/components/BlendedPhoto";
import { LiveTitle } from "@/components/LiveTitle";

export default function Services() {
  const { data: services, isLoading } = useListServices(
    {},
    { query: { queryKey: ["services", "all"] } }
  );

  return (
    <div style={pageBackdrop(IMAGES.backdropRig, "center 55%")}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[84px] pb-6">
        <h1 className="sr-only">Our Services</h1>

        {/* Cards in a row share one height */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {isLoading
            ? Array(4).fill(0).map((_, i) => (
                <Card key={i}><CardContent className="p-3.5">
                  <Skeleton className="h-4 w-2/3 mb-2" />
                  <Skeleton className="h-3 w-full mb-1" />
                  <Skeleton className="h-3 w-4/5 mb-3" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent></Card>
              ))
            : (services ?? []).map((service) => (
                <Card key={service.id} className="h-full group hover:shadow-md transition-all border-border overflow-hidden flex flex-col" data-testid={`card-service-${service.id}`}>
                  <BlendedPhoto src={pickImage(service.name, service.category)} alt={service.name} className="aspect-[4/3]" />
                  <CardContent className="p-3.5 flex flex-col flex-1">
                    <h2 className="text-sm font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                      <LiveTitle level="sub" text={service.name} hi="#0ea5e9" />
                    </h2>
                    <p className="text-xs text-muted-foreground leading-snug mb-2 line-clamp-3 min-h-[3.1em]">
                      {service.shortDescription}
                    </p>
                    {service.highlights.length > 0 && (
                      <ul className="space-y-0.5 mb-2">
                        {service.highlights.slice(0, 3).map((h) => (
                          <li key={h} className="flex items-start gap-1.5 text-[11px] leading-tight text-muted-foreground">
                            <CheckCircle className="h-3 w-3 text-green-500 shrink-0 mt-px" />
                            {h}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-auto pt-2 border-t border-border">
                      <div className="text-xs text-foreground min-h-[2.1em] mb-1.5">
                        {service.priceFrom ? (
                          <>
                            From <span className="text-primary font-bold">{formatKES(service.priceFrom)}</span>
                            {service.priceUnit && <span className="text-muted-foreground"> / {service.priceUnit}</span>}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Price on enquiry</span>
                        )}
                      </div>
                      <Button asChild size="sm" variant="outline" className="w-full h-8 text-xs">
                        <Link href={`/services/${service.id}`}>
                          Details <ArrowRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

          {/* Water purification (quote based) */}
          {!isLoading && (
            <Card className="lg:col-span-3 sm:col-span-2 border-border overflow-hidden flex flex-col sm:flex-row" data-testid="card-service-purification">
              <div className="sm:w-[42%] shrink-0">
                <BlendedPhoto src={IMAGES.purification} alt="Water purification and filtration system" className="aspect-[4/3] sm:aspect-auto sm:h-full" fadeBottom={false} />
              </div>
              <CardContent className="p-3.5 flex flex-col flex-1">
                <h2 className="text-sm font-semibold text-foreground mb-1"><LiveTitle level="sub" text="Water Purification" hi="#0ea5e9" /></h2>
                <p className="text-xs text-muted-foreground leading-snug mb-2">
                  Filtration and treatment systems that make your water safe and clean, matched to your water test results.
                </p>
                <ul className="space-y-0.5 mb-2">
                  {["Water testing", "Filtration and treatment", "Installation and servicing"].map((h) => (
                    <li key={h} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                      {h}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-2 border-t border-border flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Quote on request</span>
                  <Button asChild size="sm" className="h-8 text-xs">
                    <Link href="/purification">View details <ArrowRight className="ml-1 h-3 w-3" /></Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Custom solution */}
          {!isLoading && (
            <div className="lg:col-span-2 sm:col-span-2 rounded-xl bg-card/95 border border-primary/20 shadow-sm p-3.5 flex flex-col justify-center text-center">
              <h2 className="text-sm font-bold text-foreground mb-1"><LiveTitle level="sub" text="Need a Custom Solution?" hi="#0ea5e9" /></h2>
              <p className="text-xs text-muted-foreground mb-3 max-w-sm mx-auto">
                Every water project is unique. Contact our team for a free site assessment and tailored quote.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button asChild size="sm" className="h-8 text-xs">
                  <Link href="/contact">Request a Quote</Link>
                </Button>
                <a href="tel:+254110699444">
                  <Button size="sm" variant="outline" className="h-8 text-xs w-full sm:w-auto">Call +254 110 699 444</Button>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
