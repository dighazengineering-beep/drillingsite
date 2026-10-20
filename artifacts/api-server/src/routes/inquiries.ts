import { Router } from "express";
import { db, inquiriesTable } from "@workspace/db";
import { CreateInquiryBody } from "@workspace/api-zod";

const router = Router();

router.post("/inquiries", async (req, res) => {
  const parsed = CreateInquiryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error });
    return;
  }

  const [inquiry] = await db
    .insert(inquiriesTable)
    .values({
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email ?? null,
      county: parsed.data.county ?? null,
      inquiryType: parsed.data.inquiryType,
      serviceId: parsed.data.serviceId ?? null,
      message: parsed.data.message,
    })
    .returning();

  res.status(201).json({
    id: inquiry.id,
    name: inquiry.name,
    phone: inquiry.phone,
    email: inquiry.email ?? null,
    county: inquiry.county ?? null,
    inquiryType: inquiry.inquiryType,
    serviceId: inquiry.serviceId ?? null,
    message: inquiry.message,
    createdAt: inquiry.createdAt.toISOString(),
  });
});

export default router;
