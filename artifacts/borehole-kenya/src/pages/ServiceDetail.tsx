import { Link, useParams } from "wouter";
import { LiveTitle } from "@/components/LiveTitle";
import { ArrowLeft, CheckCircle, Clock, MapPin, Phone, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetService, useCreateInquiry } from "@workspace/api-client-react";
import { IMAGES, pickImage, bannerBackground, pageBackdrop } from "@/lib/images";
import { formatKES, whatsappLink, KENYA_COUNTIES } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface QuoteForm {
  name: string;
  phone: string;
  email: string;
  county: string;
  message: string;
}

export default function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { data: service, isLoading } = useGetService(Number(id), {
    query: { queryKey: ["service", id] },
  });

  const createInquiry = useCreateInquiry();

  const form = useForm<QuoteForm>({
    defaultValues: { name: "", phone: "", email: "", county: "", message: "" },
  });

  function onSubmit(values: QuoteForm) {
    createInquiry.mutate(
      {
        data: {
          name: values.name,
          phone: values.phone,
          email: values.email || null,
          county: values.county || null,
          inquiryType: "service_quote",
          serviceId: service?.id ?? null,
          message: values.message,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Inquiry sent!", description: "We will contact you within 24 hours." });
          form.reset();
        },
        onError: () => {
          toast({ title: "Error", description: "Could not send inquiry. Please call us directly.", variant: "destructive" });
        },
      }
    );
  }

  if (isLoading) {
    return (
      <div className="bg-background pt-[80px] pb-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-48 mb-8" />
          <Skeleton className="h-12 w-2/3 mb-4" />
          <Skeleton className="h-5 w-full mb-2" />
          <Skeleton className="h-5 w-4/5 mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-48 w-full" />
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="min-h-[60vh] bg-background pt-20 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Service Not Found</h1>
          <Button asChild><Link href="/services">Back to Services</Link></Button>
        </div>
      </div>
    );
  }

  const svcText = `${service.name} ${service.category}`.toLowerCase();
  const backdrop = /solar/.test(svcText)
    ? IMAGES.backdropSolar
    : /purif|treat|filter/.test(svcText)
    ? IMAGES.backdropPlant
    : /pump|install/.test(svcText)
    ? IMAGES.backdropTruck
    : IMAGES.backdropRig;

  return (
    <div style={pageBackdrop(backdrop, "center 50%")}>
      {/* Header */}
      <div className="relative overflow-hidden text-white pt-[76px] pb-6" style={{ background: bannerBackground(pickImage(service.name, service.category)) }}>
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/services" className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-3 transition-colors">
            <ArrowLeft className="h-4 w-4" /> All Services
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-300 bg-white/10 px-2.5 py-0.5 rounded-full mb-2 inline-block">
                {service.category}
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2"><LiveTitle text={service.name} hi="#bae6fd" /></h1>
              <p className="text-white/75 text-sm sm:text-base max-w-2xl">{service.shortDescription}</p>
            </div>
            {service.priceFrom && (
              <div className="bg-white/10 border border-white/15 rounded-xl px-4 py-2.5 flex-shrink-0 text-left sm:text-right">
                <div className="text-xs text-white/50 mb-1">Starting from</div>
                <div className="text-xl font-bold text-sky-300">{formatKES(service.priceFrom)}</div>
                {service.priceUnit && <div className="text-xs text-white/50">{service.priceUnit}</div>}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-4 mt-3">
            {service.duration && (
              <div className="flex items-center gap-1.5 text-sm text-white/60">
                <Clock className="h-4 w-4" /> {service.duration}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6 rounded-2xl bg-card/95 shadow-xl p-4 sm:p-6 self-start">
            {/* Description */}
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-4"><LiveTitle text="About This Service" hi="#0ea5e9" /></h2>
              <p className="text-muted-foreground leading-relaxed">{service.description}</p>
            </div>

            {/* Highlights */}
            {service.highlights.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-4"><LiveTitle text="What's Included" hi="#0ea5e9" /></h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {service.highlights.map((h) => (
                    <div key={h} className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/60">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground">{h}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Coverage areas */}
            {service.coverageAreas.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-4"><LiveTitle text="Coverage Areas" hi="#0ea5e9" /></h2>
                <div className="flex flex-wrap gap-2">
                  {service.coverageAreas.map((area) => (
                    <span key={area} className="flex items-center gap-1 text-sm bg-muted px-3 py-1.5 rounded-full text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {area}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* WhatsApp CTA */}
            <div className="rounded-xl border border-green-200 bg-green-50 p-6">
              <h3 className="font-semibold text-foreground mb-2"><LiveTitle level="sub" text="Need Immediate Assistance?" hi="#0ea5e9" /></h3>
              <p className="text-sm text-muted-foreground mb-4">Chat directly with our team on WhatsApp for fast response.</p>
              <a
                href={whatsappLink(`Hi, I am interested in your ${service.name} service. Please provide more details.`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button className="bg-[#25D366] hover:bg-[#20bd5a] text-white">
                  <MessageSquare className="mr-2 h-4 w-4" /> WhatsApp Us
                </Button>
              </a>
            </div>
          </div>

          {/* Sidebar - Quote Form */}
          <div>
            <Card className="sticky top-24 border-border">
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-foreground mb-1"><LiveTitle text="Request a Quote" hi="#0ea5e9" level="sub" /></h2>
                <p className="text-xs text-muted-foreground mb-5">We respond within 24 hours</p>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField control={form.control} name="name" rules={{ required: "Name is required" }} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl><Input placeholder="John Kamau" {...field} data-testid="input-name" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="phone" rules={{ required: "Phone is required" }} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl><Input placeholder="+254 7xx xxx xxx" {...field} data-testid="input-phone" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="county" render={({ field }) => (
                      <FormItem>
                        <FormLabel>County</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-county"><SelectValue placeholder="Select county" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {KENYA_COUNTIES.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="message" rules={{ required: "Message is required" }} render={({ field }) => (
                      <FormItem>
                        <FormLabel>Message</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={`Tell us about your ${service.name} requirements...`}
                            rows={3}
                            {...field}
                            data-testid="input-message"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button type="submit" className="w-full" disabled={createInquiry.isPending} data-testid="button-submit-quote">
                      {createInquiry.isPending ? "Sending..." : "Send Inquiry"}
                    </Button>
                  </form>
                </Form>

                <div className="mt-5 pt-4 border-t border-border text-center">
                  <p className="text-xs text-muted-foreground mb-2">Or call us directly</p>
                  <a href="tel:+254719117660" className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:text-primary/80">
                    <Phone className="h-3.5 w-3.5" /> +254 719 117 660
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
