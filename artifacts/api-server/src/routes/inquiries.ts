import { Router } from "express";
import { db, inquiriesTable } from "@workspace/db";
import { CreateInquiryBody } from "@workspace/api-zod";
import { smsOwner } from "./payments";
import { emailClient } from "../lib/mailer";

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

  const d = parsed.data;   // the full message, with every detail the client filled in, so nothing has to be looked up in the admin
  smsOwner(["New website message", `Name: ${d.name}`, `Phone: ${d.phone}`, d.email ? `Email: ${d.email}` : "", d.county ? `County: ${d.county}` : "", d.inquiryType ? `Type: ${d.inquiryType}` : "", `Message: ${String(d.message).slice(0, 1000)}`].filter(Boolean).join("\n"));

  if (d.email) emailClient(String(d.email).toLowerCase(), "We got your message", `Hello ${d.name},\n\nThank you for contacting us. We have your message and will reply soon. If it is urgent, call or WhatsApp us.`);

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
