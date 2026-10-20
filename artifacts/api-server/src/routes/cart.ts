import { Router } from "express";
import { db, cartItemsTable, productsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  AddToCartBody,
  GetCartQueryParams,
  RemoveCartItemParams,
  UpdateCartItemBody,
  UpdateCartItemParams,
} from "@workspace/api-zod";

const router = Router();

async function buildCart(sessionId: string) {
  const items = await db
    .select({
      id: cartItemsTable.id,
      productId: cartItemsTable.productId,
      quantity: cartItemsTable.quantity,
      productName: productsTable.name,
      productImageUrl: productsTable.imageUrl,
      price: productsTable.price,
    })
    .from(cartItemsTable)
    .innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
    .where(eq(cartItemsTable.sessionId, sessionId));

  const cartItems = items.map(i => ({
    id: i.id,
    productId: i.productId,
    productName: i.productName,
    productImageUrl: i.productImageUrl ?? null,
    price: parseFloat(i.price),
    quantity: i.quantity,
    subtotal: parseFloat(i.price) * i.quantity,
  }));

  const total = cartItems.reduce((acc, i) => acc + i.subtotal, 0);
  const itemCount = cartItems.reduce((acc, i) => acc + i.quantity, 0);

  return { sessionId, items: cartItems, total, itemCount };
}

router.get("/cart", async (req, res) => {
  const parsed = GetCartQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "sessionId is required" });
    return;
  }
  res.json(await buildCart(parsed.data.sessionId));
});

router.post("/cart/items", async (req, res) => {
  const parsed = AddToCartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { sessionId, productId, quantity } = parsed.data;

  const [existing] = await db
    .select()
    .from(cartItemsTable)
    .where(
      and(
        eq(cartItemsTable.sessionId, sessionId),
        eq(cartItemsTable.productId, productId)
      )
    );

  if (existing) {
    await db
      .update(cartItemsTable)
      .set({ quantity: existing.quantity + quantity })
      .where(eq(cartItemsTable.id, existing.id));
  } else {
    await db.insert(cartItemsTable).values({ sessionId, productId, quantity });
  }

  res.json(await buildCart(sessionId));
});

router.patch("/cart/items/:itemId", async (req, res) => {
  const paramsParsed = UpdateCartItemParams.safeParse({ itemId: Number(req.params.itemId) });
  const bodyParsed = UpdateCartItemBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const [item] = await db
    .select()
    .from(cartItemsTable)
    .where(eq(cartItemsTable.id, paramsParsed.data.itemId));
  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (bodyParsed.data.quantity <= 0) {
    await db.delete(cartItemsTable).where(eq(cartItemsTable.id, item.id));
  } else {
    await db
      .update(cartItemsTable)
      .set({ quantity: bodyParsed.data.quantity })
      .where(eq(cartItemsTable.id, item.id));
  }

  res.json(await buildCart(item.sessionId));
});

router.delete("/cart/items/:itemId", async (req, res) => {
  const parsed = RemoveCartItemParams.safeParse({ itemId: Number(req.params.itemId) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid itemId" });
    return;
  }

  const [item] = await db
    .select()
    .from(cartItemsTable)
    .where(eq(cartItemsTable.id, parsed.data.itemId));
  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const sessionId = item.sessionId;
  await db.delete(cartItemsTable).where(eq(cartItemsTable.id, item.id));
  res.json(await buildCart(sessionId));
});

export default router;
