import { IMAGES, pageBackdrop } from "@/lib/images";
import { LiveTitle } from "@/components/LiveTitle";
import { displayName } from "@/lib/productPhotos";
import { Link } from "wouter";
import { Trash2, Plus, Minus, ShoppingCart, MessageSquare, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useGetCart, useUpdateCartItem, useRemoveCartItem } from "@workspace/api-client-react";
import { formatKES, getCartSessionId, whatsappLink } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export default function Cart() {
  const sessionId = getCartSessionId();
  const queryClient = useQueryClient();

  const { data: cart, isLoading } = useGetCart(
    { sessionId },
    { query: { queryKey: ["cart", sessionId] } }
  );

  const updateItem = useUpdateCartItem({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart", sessionId] }),
    },
  });
  const removeItem = useRemoveCartItem({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cart", sessionId] }),
    },
  });

  function buildWhatsAppMessage() {
    if (!cart?.items.length) return "";
    const lines = cart.items.map(
      (item) => `• ${displayName(item.productName)} x${item.quantity} — ${formatKES(item.subtotal)}`
    );
    return [
      "Hello, I would like to place an order for the following items:",
      "",
      ...lines,
      "",
      `Total: ${formatKES(cart.total)}`,
      "",
      "Please confirm availability and delivery options.",
    ].join("\n");
  }

  if (isLoading) {
    return (
      <div className="pt-[80px] pb-8 min-h-screen" style={pageBackdrop(IMAGES.backdropWater, "center 50%")}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-32 mb-8" />
          <div className="space-y-4">
            {Array(3).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = !cart || cart.items.length === 0;

  return (
    <div className="pt-[80px] pb-8 min-h-screen" style={pageBackdrop(IMAGES.backdropWater, "center 50%")}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 rounded-2xl bg-card/95 shadow-xl py-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Link href="/products" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground"><LiveTitle text="Shopping Cart" hi="#0ea5e9" /></h1>
          {!isEmpty && (
            <span className="text-sm text-muted-foreground">({cart.itemCount} {cart.itemCount === 1 ? "item" : "items"})</span>
          )}
        </div>

        {isEmpty ? (
          <div className="text-center py-12">
            <ShoppingCart className="h-16 w-16 text-muted-foreground/25 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2"><LiveTitle text="Your cart is empty" hi="#0ea5e9" level="sub" /></h2>
            <p className="text-muted-foreground mb-8">Browse our products and add equipment to your cart.</p>
            <Button asChild><Link href="/products">Browse Products</Link></Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Items */}
            <div className="lg:col-span-2 space-y-3">
              {cart.items.map((item) => (
                <Card key={item.id} className="border-border" data-testid={`card-cart-item-${item.id}`}>
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      {/* Image */}
                      <div className="w-16 h-16 rounded-lg bg-muted flex-shrink-0 flex items-center justify-center overflow-hidden">
                        {item.productImageUrl ? (
                          <img src={item.productImageUrl} alt={displayName(item.productName)} className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <ShoppingCart className="h-5 w-5 text-muted-foreground/40" />
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground text-sm leading-snug line-clamp-2 mb-1">
                          {displayName(item.productName)}
                        </h3>
                        <p className="text-sm text-muted-foreground">{formatKES(item.price)} each</p>
                      </div>

                      {/* Controls */}
                      <div className="flex flex-col items-end justify-between gap-3">
                        <button
                          onClick={() => removeItem.mutate({ params: { itemId: item.id } })}
                          className="text-muted-foreground hover:text-red-500 transition-colors"
                          data-testid={`button-remove-${item.id}`}
                          disabled={removeItem.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateItem.mutate({ params: { itemId: item.id }, data: { quantity: item.quantity - 1 } })}
                            className="w-7 h-7 rounded border border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                            data-testid={`button-qty-minus-${item.id}`}
                            disabled={updateItem.isPending}
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center text-sm font-medium" data-testid={`text-qty-${item.id}`}>{item.quantity}</span>
                          <button
                            onClick={() => updateItem.mutate({ params: { itemId: item.id }, data: { quantity: item.quantity + 1 } })}
                            className="w-7 h-7 rounded border border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                            data-testid={`button-qty-plus-${item.id}`}
                            disabled={updateItem.isPending}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <span className="text-sm font-bold text-foreground ml-1" data-testid={`text-subtotal-${item.id}`}>
                            {formatKES(item.subtotal)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Order summary */}
            <div>
              <Card className="sticky top-24 border-border">
                <CardContent className="p-6">
                  <h2 className="font-semibold text-foreground mb-5"><LiveTitle text="Order Summary" hi="#0ea5e9" level="sub" /></h2>

                  <div className="space-y-2 mb-4">
                    {cart.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground truncate max-w-[130px]">{displayName(item.productName)} ×{item.quantity}</span>
                        <span className="text-foreground font-medium ml-2 flex-shrink-0">{formatKES(item.subtotal)}</span>
                      </div>
                    ))}
                  </div>

                  <Separator className="mb-4" />

                  <div className="flex justify-between font-semibold text-foreground mb-6">
                    <span>Total</span>
                    <span className="text-primary text-lg" data-testid="text-cart-total">{formatKES(cart.total)}</span>
                  </div>

                  <a
                    href={whatsappLink(buildWhatsAppMessage())}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block mb-3"
                    data-testid="button-whatsapp-checkout"
                  >
                    <Button className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white">
                      <MessageSquare className="mr-2 h-4 w-4" /> Order via WhatsApp
                    </Button>
                  </a>

                  <Button asChild variant="outline" className="w-full">
                    <Link href="/contact">Request Formal Quote</Link>
                  </Button>

                  <p className="text-xs text-muted-foreground text-center mt-4 leading-relaxed">
                    WhatsApp ordering connects you directly with our sales team for delivery and payment arrangements.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
