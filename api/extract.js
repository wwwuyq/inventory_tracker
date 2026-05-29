export const config = {
  runtime: "edge"
};

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    document_type: {
      type: "string",
      enum: ["manufacturing", "shipping", "purchase", "inventory", "invoice", "unknown"]
    },
    manufacturer: { type: "string" },
    retailer: { type: "string" },
    partner: { type: "string" },
    po_number: { type: "string" },
    invoice_number: { type: "string" },
    tracking_number: { type: "string" },
    ship_date: { type: "string" },
    estimated_arrival: { type: "string" },
    currency: { type: "string" },
    amount_paid: { type: "number" },
    amount_due: { type: "number" },
    notes: { type: "string" },
    confidence: { type: "number" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sku: { type: "string" },
          name: { type: "string" },
          quantity: { type: "number" },
          unit_price: { type: "number" },
          total_price: { type: "number" }
        },
        required: ["sku", "name", "quantity", "unit_price", "total_price"]
      }
    }
  },
  required: [
    "document_type",
    "manufacturer",
    "retailer",
    "partner",
    "po_number",
    "invoice_number",
    "tracking_number",
    "ship_date",
    "estimated_arrival",
    "currency",
    "amount_paid",
    "amount_due",
    "notes",
    "confidence",
    "items"
  ]
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function mapDocumentType(type) {
  if (type === "invoice") return "purchase";
  if (["manufacturing", "shipping", "purchase", "inventory"].includes(type)) return type;
  return "manufacturing";
}

async function fileToDataUrl(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${file.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: "Missing OPENAI_API_KEY on the server." }, 500);
  }

  const form = await request.formData();
  const rawText = String(form.get("text") || "").trim();
  const files = form.getAll("files").filter((item) => item instanceof File);

  if (!rawText && files.length === 0) {
    return json({ error: "Upload a file or paste text to extract." }, 400);
  }

  const content = [
    {
      type: "input_text",
      text: [
        "Extract operational purchase/manufacturing/shipping information for Lili Design Studio.",
        "Documents may include English or Chinese text, retail POs, invoices, packing lists, factory orders, box labels, and shipping labels.",
        "Return only fields supported by the schema. Use empty strings and 0 for missing values. Dates should be YYYY-MM-DD when possible.",
        rawText ? `Pasted text:\n${rawText}` : ""
      ].filter(Boolean).join("\n\n")
    }
  ];

  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      content.push({
        type: "input_file",
        filename: file.name || "document.pdf",
        file_data: dataUrl
      });
    } else if (file.type.startsWith("image/")) {
      content.push({
        type: "input_image",
        image_url: dataUrl,
        detail: "high"
      });
    } else if (file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt")) {
      content.push({
        type: "input_text",
        text: `${file.name}:\n${await file.text()}`
      });
    }
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "lili_ops_document_extraction",
          strict: true,
          schema: EXTRACTION_SCHEMA
        }
      }
    })
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return json({ error: body?.error?.message || `OpenAI request failed with ${response.status}` }, 500);
  }

  const outputText = body?.output_text
    || body?.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;

  if (!outputText) {
    return json({ error: "OpenAI returned no extractable text.", raw: body }, 500);
  }

  const extracted = JSON.parse(outputText);
  const firstItem = extracted.items?.[0] || {};

  return json({
    raw: extracted,
    review: {
      type: mapDocumentType(extracted.document_type),
      sku: firstItem.sku || "",
      quantity: firstItem.quantity || 0,
      price: firstItem.unit_price || firstItem.total_price || 0,
      reference: extracted.po_number || extracted.invoice_number || "",
      tracking: extracted.tracking_number || "",
      date: extracted.ship_date || extracted.estimated_arrival || "",
      partner: extracted.partner || extracted.manufacturer || extracted.retailer || "",
      notes: extracted.notes || firstItem.name || ""
    }
  });
}
