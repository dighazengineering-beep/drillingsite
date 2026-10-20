import { productImages, applyOverrides } from "@/lib/productPhotos";
import { useState } from "react";
import { Link } from "wouter";
import { Search, ShoppingCart, MessageSquare, Filter, X, ChevronDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import PageBanner from "@/components/PageBanner";
import { IMAGES, pageBackdrop } from "@/lib/images";
import {
  useListProducts,
  useListProductCategories,
  useAddToCart,
} from "@workspace/api-client-react";
import { formatKES, getCartSessionId, whatsappLink } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { LiveTitle } from "@/components/LiveTitle";

const PAGE_SIZE = 8;

export default function Products() {
  const { toast } = useToast();
  const sessionId = getCartSessionId();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(() => (new URLSearchParams(window.location.search).get("category") || "").split(",").filter(Boolean));
  const toggleCategory = (c: string) => { setSelected((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c])); setPage(1); };
  const clearCategories = () => { setSelected([]); setPage(1); };
  const [inStockOnly, setInStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [catOpen, setCatOpen] = useState(false);

  const { data: categories } = useListProductCategories();
  // Load once, then filter the chosen categories here so several can be ticked at once.
  const { data: all, isLoading } = useListProducts(
    {
      inStock: inStockOnly || undefined,
      search: search || undefined,
      page: 1,
      limit: 500,
    },
    { query: { queryKey: ["products", "all", inStockOnly, search] } }
  );
  const filtered = (all?.items ?? []).filter((p) => selected.length === 0 || selected.includes(p.category));
  const products = all ? { items: filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: filtered.length } : undefined;

  const addToCart = useAddToCart();

  function handleAddToCart(productId: number, productName: string) {
    addToCart.mutate(
      { data: { sessionId, productId, quantity: 1 } },
      { onSuccess: () => toast({ title: "Added to cart", description: productName }) }
    );
  }

  const allCategories = (categories ?? []).map((c) => c.name);
  const totalPages = products ? Math.ceil(products.total / PAGE_SIZE) : 1;

  return (
    <div>
      <PageBanner
        image={IMAGES.solarDiagram}
        eyebrow="Equipment Store"
        title="Products & Equipment"
        description="Pumps, solar systems, pipes, tanks and accessories from trusted brands."
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/60" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search..."
              className="pl-9 h-9 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-sky-300/70"
              data-testid="input-search"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label="Clear search">
                <X className="h-4 w-4 text-white/60" />
              </button>
            )}
          </div>
          <Popover open={catOpen} onOpenChange={setCatOpen}>
            <div
              className={`flex items-center h-9 rounded-md border text-xs font-medium transition-all ${
                selected.length > 0 ? "border-sky-300 bg-sky-300 text-slate-900" : "border-white/25 text-white/90 hover:bg-white/10"
              }`}
            >
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 pl-3 pr-2 h-full max-w-[150px] sm:max-w-[220px]" data-testid="button-category-dropdown">
                  <span className="truncate">{selected.length === 0 ? "All categories" : selected.length === 1 ? selected[0] : `${selected.length} categories`}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                </button>
              </PopoverTrigger>
              {selected.length > 0 && (
                <button
                  onClick={clearCategories}
                  aria-label="Clear category"
                  data-testid="button-category-clear"
                  className="pr-2 pl-0.5 h-full"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <PopoverContent align="end" className="w-64 p-1">
              <button
                onClick={clearCategories}
                data-testid="button-category-All"
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-left hover:bg-muted ${
                  selected.length === 0 ? "font-semibold text-primary" : "text-foreground"
                }`}
              >
                All categories
                {selected.length === 0 && <Check className="h-4 w-4" />}
              </button>
              <div className="my-1 h-px bg-border" />
              {allCategories.map((cat) => {
                const on = selected.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    data-testid={`button-category-${cat}`}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-left text-foreground hover:bg-muted"
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    {cat}
                  </button>
                );
              })}
              <p className="px-3 pt-1 pb-1.5 text-[11px] text-muted-foreground">Tick one or more categories</p>
            </PopoverContent>
          </Popover>
          <button
            onClick={() => { setInStockOnly(!inStockOnly); setPage(1); }}
            data-testid="button-instock-filter"
            className={`flex items-center gap-1.5 px-3 h-9 rounded-md border text-xs font-medium whitespace-nowrap transition-all ${
              inStockOnly
                ? "border-sky-300 bg-sky-300 text-slate-900"
                : "border-white/25 text-white/85 hover:bg-white/10"
            }`}
          >
            <Filter className="h-3.5 w-3.5" /> In Stock
          </button>
        </div>
      </PageBanner>

      <div style={pageBackdrop(IMAGES.backdropWater, "center 40%")}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div>
          {products && (
            <p className="mb-2 inline-block rounded-full bg-card/95 px-3 py-1 text-xs text-muted-foreground shadow-sm">
              Showing {products.items.length} of {products.total} products
              {selected.length > 0 && ` in ${selected.join(", ")}`}
            </p>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              {Array(PAGE_SIZE).fill(0).map((_, i) => (
                <Card key={i}><CardContent className="p-3">
                  <Skeleton className="h-28 w-full rounded-lg mb-2" />
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-8 w-full" />
                </CardContent></Card>
              ))}
            </div>
          ) : (products?.items ?? []).length === 0 ? (
            <div className="text-center py-12 rounded-xl bg-card/95 shadow-sm">
              <h3 className="text-sm font-medium text-foreground mb-1">No products found</h3>
              <p className="text-muted-foreground text-xs mb-4">Try a different search term or category</p>
              <Button variant="outline" size="sm" onClick={() => { setSearch(""); setSelected([]); setInStockOnly(false); }}>
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              {(products?.items ?? []).map(applyOverrides).map((product) => (
                <Card key={product.id} className="group hover:shadow-md transition-all flex flex-col overflow-hidden" data-testid={`card-product-${product.id}`}>
                  <CardContent className="p-0 flex flex-col h-full">
                    <Link href={`/products/${product.id}`} className="block">
                      <div className="bg-muted h-24 sm:h-28 flex items-center justify-center overflow-hidden">
                        {productImages(product.name, product.imageUrl).length ? (
                          <img src={productImages(product.name, product.imageUrl)[0]} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-3xl font-bold text-muted-foreground/20">
                            {product.category.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </Link>

                    <div className="p-2.5 sm:p-3 flex flex-col flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-1 mb-1">
                        <span className="text-[11px] text-muted-foreground">{product.category}</span>
                        {product.inStock ? (
                          <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">In Stock</span>
                        ) : (
                          <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">Out of Stock</span>
                        )}
                      </div>
                      <Link href={`/products/${product.id}`} className="flex-1">
                        <h3 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 mb-1 leading-snug">
                          <LiveTitle level="sub" text={product.name} hi="#0ea5e9" />
                        </h3>
                      </Link>
                      {product.brand && <p className="text-[11px] text-muted-foreground mb-1">{product.brand}</p>}

                      <div className="flex items-baseline gap-2 mb-2 mt-auto">
                        <span className="text-sm font-bold text-primary whitespace-nowrap">{formatKES(product.price)}</span>
                        {product.comparePrice && (
                          <span className="hidden sm:inline text-[11px] text-muted-foreground line-through whitespace-nowrap">{formatKES(product.comparePrice)}</span>
                        )}
                      </div>

                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="flex-1 h-8 text-xs px-2"
                          disabled={!product.inStock || addToCart.isPending}
                          onClick={() => handleAddToCart(product.id, product.name)}
                          data-testid={`button-add-cart-${product.id}`}
                        >
                          <ShoppingCart className="h-3.5 w-3.5 mr-1.5 hidden sm:block" /> Add to Cart
                        </Button>
                        {product.whatsappOrderEnabled && (
                          <a
                            href={whatsappLink(`Hi, I would like to order: ${product.name} (Price: ${formatKES(product.price)})`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`button-whatsapp-${product.id}`}
                          >
                            <Button size="sm" variant="outline" className="h-8 px-2.5 border-[#25D366] text-[#25D366] hover:bg-green-50">
                              <MessageSquare className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
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
      </div>
      </div>
    </div>
  );
}
