import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ShoppingCart, LogIn, Home, Info, Wrench, Store, FolderOpen, PlayCircle, Coins, Phone, MessageCircle, ShieldCheck, ArrowRight, Wallet } from "lucide-react";
import { memberToken, memberApi } from "@/lib/member";
import { ADMIN_PATH } from "@/lib/adminPath";
import { Button } from "@/components/ui/button";
import { useGetCart } from "@workspace/api-client-react";
import { getCartSessionId, whatsappLink } from "@/lib/utils";
import WhatsAppButton from "@/components/WhatsAppButton";
import { LiveTitle } from "@/components/LiveTitle";
import NotificationBell from "@/components/NotificationBell";
import { openPay } from "@/components/PayDialog";
import InstallApp from "@/components/InstallApp";
import { ThemeToggle, ThemeChoice } from "@/components/ThemeToggle";

const navLinks = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/about", label: "About", Icon: Info },
  { href: "/services", label: "Services", Icon: Wrench },
  { href: "/products", label: "Products", Icon: Store },
  { href: "/projects", label: "Projects", Icon: FolderOpen },
  { href: "/feed", label: "Project Videos", Icon: PlayCircle },
  { href: "/join?earn=1", label: "Earn", Icon: Coins },
  { href: "/privacy", label: "Privacy", Icon: ShieldCheck },
  { href: "/contact", label: "Contact", Icon: Phone },
];
const CALL_NUMBER = "+254719117660";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [location] = useLocation();
  const sessionId = getCartSessionId();

  const { data: cart } = useGetCart(
    { sessionId },
    { query: { queryKey: ["cart", sessionId] } }
  );

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const cartCount = cart?.itemCount ?? 0;
  // Re-check on every page change so the button flips after signing in or out.
  const signedIn = !!memberToken() && location !== "";
  const accountHref = signedIn ? "/account" : "/join?mode=login";
  // The Admin button is shown only to a signed-in account whose email is on the admin list (never to anyone else)
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (!signedIn) { setIsAdmin(false); return; }
    let on = true;
    memberApi("/members/me").then((d) => { if (on) setIsAdmin(!!d?.member?.admin); }).catch(() => { if (on) setIsAdmin(false); });
    return () => { on = false; };
  }, [signedIn]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled || open ? "bg-white shadow-md border-b border-border dark:bg-card" : "bg-white/95 backdrop-blur-sm dark:bg-card/95"
      }`}
    >
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between gap-1 sm:h-16">
          {/* Logo */}
          <Link href="/" className="group flex min-w-0 shrink items-center gap-1.5 sm:gap-2.5">
            <img src={`${import.meta.env.BASE_URL}images/logo-mark.webp`} alt="Dighaz Engineering Limited logo" className="h-8 sm:h-10 w-auto shrink-0 transition-transform duration-300 group-hover:scale-105" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-bold text-foreground sm:text-sm"><span className="text-primary">Dighaz</span> Engineering</div>
              <div className="truncate text-[9px] text-muted-foreground font-medium tracking-wide uppercase sm:text-[10px]">Services Kenya</div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`whitespace-nowrap px-1.5 py-2 rounded-md text-[13px] font-medium transition-colors xl:px-2.5 xl:text-sm 2xl:px-3.5 ${
                  location === link.href.split("?")[0]
                    ? "text-primary bg-primary/8"
                    : "text-foreground/80 hover:text-primary hover:bg-primary/6"
                }`}
              >
                <LiveTitle level="sub" text={link.label} hi="#0ea5e9" />
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
            <div className="hidden sm:block lg:hidden xl:block"><WhatsAppButton /></div>
            <NotificationBell />
            <ThemeToggle className="hidden sm:block" />
            <Link href="/cart" className="relative hidden p-1.5 sm:block sm:p-2 rounded-md hover:bg-muted transition-colors" data-testid="link-cart">
              <ShoppingCart className="h-5 w-5 text-foreground/70" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 text-[10px] font-bold bg-primary text-white rounded-full flex items-center justify-center">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </Link>

            <button
              type="button"
              onClick={() => openPay()}
              data-testid="button-pay"
              className="mx-1 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-extrabold text-white shadow-md ring-1 ring-white/30 transition hover:shadow-lg active:scale-95 sm:mx-0 sm:gap-1.5 sm:px-4 sm:py-2 sm:text-sm"
              style={{ background: "linear-gradient(135deg, hsl(160 52% 16%), hsl(210 100% 35%) 60%, hsl(38 92% 50%))" }}
            >
              <Wallet className="h-4 w-4" /> Pay
            </button>

            <Button asChild size="sm" className="hidden sm:inline-flex lg:hidden min-[1700px]:inline-flex">
              <Link href="/quote">Get a Quote</Link>
            </Button>

            {/* Mobile menu toggle */}
            <button
              className="lg:hidden p-1.5 sm:p-2 rounded-md hover:bg-muted transition-colors"
              onClick={() => setOpen(!open)}
              data-testid="button-menu-toggle"
              aria-label="Toggle menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu: icon tiles, then the main actions */}
        {open && (
          <div className="lg:hidden max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain border-t border-border pb-5 pt-3" data-testid="mobile-menu">
            <nav className="grid grid-cols-2 gap-2">
              {navLinks.filter((l) => l.href !== "/privacy").map((link, i) => {
                const on = location === link.href.split("?")[0];
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    style={{ animationDelay: `${i * 28}ms`, animationFillMode: "both" }}
                    className={`animate-in fade-in-0 slide-in-from-top-2 duration-300 flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 shadow-sm transition active:scale-[.97] ${
                      on ? "border-primary/40 bg-primary/10" : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${on ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                      <link.Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 text-[13px] font-bold leading-tight text-foreground">
                      <LiveTitle level="sub" text={link.label} hi="#0ea5e9" />
                    </span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-3 space-y-2">
              <Link
                href="/cart"
                onClick={() => setOpen(false)}
                data-testid="link-cart-mobile"
                className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 shadow-sm transition active:scale-[.98]"
              >
                <span className="flex items-center gap-2.5 text-sm font-bold text-foreground"><ShoppingCart className="h-[18px] w-[18px] text-primary" /> My cart</span>
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">{cartCount}</span>
              </Link>
              <Link
                href="/quote"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-2xl bg-sky-400 px-4 py-3 text-slate-900 shadow-md transition active:scale-[.98]"
              >
                <span className="text-sm font-extrabold">Get a Quote</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <a href={`tel:${CALL_NUMBER}`} className="flex items-center justify-center gap-1.5 rounded-2xl border border-border bg-card py-2.5 text-[13px] font-bold text-foreground shadow-sm transition active:scale-[.97]">
                  <Phone className="h-4 w-4 text-primary" /> Call us
                </a>
                <a href={whatsappLink("Hello, I would like to ask about your services.")} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="flex items-center justify-center gap-1.5 rounded-2xl bg-[#25D366] py-2.5 text-[13px] font-bold text-white shadow-sm transition active:scale-[.97]">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              </div>
              <Link
                href={accountHref}
                onClick={() => setOpen(false)}
                data-testid="link-login-mobile"
                className="flex items-center justify-center gap-1.5 rounded-2xl border border-primary/30 py-2.5 text-[13px] font-bold text-primary transition active:scale-[.98]"
              >
                <LogIn className="h-4 w-4" /> {signedIn ? "My account" : "Log in"}
              </Link>
              {isAdmin && <Link href={ADMIN_PATH} onClick={() => setOpen(false)} data-testid="link-admin-menu" className="flex items-center justify-center gap-1.5 rounded-2xl bg-primary py-2.5 text-[13px] font-bold text-primary-foreground transition active:scale-[.98]"><ShieldCheck className="h-4 w-4" /> Admin panel</Link>}
              <ThemeChoice />
              <div className="empty:hidden"><InstallApp variant="menu" onDone={() => setOpen(false)} /></div>
              <Link href="/privacy" onClick={() => setOpen(false)} className="block pt-1 text-center text-[11px] font-medium text-muted-foreground">Privacy</Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
