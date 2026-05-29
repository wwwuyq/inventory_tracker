const STORAGE_KEY = "lili_ops_database_v1";
const SUPABASE_URL = "https://bqlojvhbhbhsoihcrqmt.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_COGo8rAXor8EU_a5AcIjmA_Ckrz0xsw";
const SHARED_DATABASE_ID = "main";

const emptyDatabase = {
  retailStores: [],
  products: [],
  manufacturers: [],
  factoryOrders: [],
  shipments: [],
  inventory: [],
  purchaseOrders: [],
  documents: []
};

const state = loadDatabase();
let supabaseClient = null;
let currentUser = null;
let isRemoteReady = false;
let toastTimer = null;

const $ = (id) => document.getElementById(id);
const money = (value) => Number(value || 0).toLocaleString(undefined, {
  style: "currency",
  currency: "USD"
});
const qty = (value) => Number(value || 0).toLocaleString();
const today = () => new Date().toISOString().slice(0, 10);
const nowLocalInput = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

function loadDatabase() {
  try {
    return { ...emptyDatabase, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
  } catch {
    return structuredClone(emptyDatabase);
  }
}

function saveDatabase() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
  saveRemoteDatabase();
}

function removeLoadedSamples() {
  const before = JSON.stringify(state);
  state.manufacturers = state.manufacturers.filter((item) => item.name !== "Hangzhou Sample Factory");
  state.retailStores = state.retailStores.filter((item) => item.name !== "Retail Buyer A");
  state.products = state.products.filter((item) => !["LILI-DRESS-01", "LILI-TOP-02"].includes(item.sku));
  state.factoryOrders = state.factoryOrders.filter((item) => item.sku !== "LILI-DRESS-01" && item.manufacturer !== "Hangzhou Sample Factory");
  state.shipments = state.shipments.filter((item) => item.sku !== "LILI-DRESS-01" && item.tracking !== "1Z999AA10123456784");
  state.inventory = state.inventory.filter((item) => item.sku !== "LILI-TOP-02");
  state.purchaseOrders = state.purchaseOrders.filter((item) => item.poNumber !== "PO-1048" && item.customer !== "Retail Buyer A");
  return before !== JSON.stringify(state);
}

async function saveRemoteDatabase() {
  if (!isRemoteReady || !supabaseClient || !currentUser) return;
  const { error } = await supabaseClient
    .from("app_state")
    .upsert({
      id: SHARED_DATABASE_ID,
      data: state,
      updated_by: currentUser.id,
      updated_at: new Date().toISOString()
    });
  if (error) console.warn("Supabase save failed", error.message);
}

async function loadRemoteDatabase() {
  if (!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient
    .from("app_state")
    .select("data")
    .eq("id", SHARED_DATABASE_ID)
    .maybeSingle();

  if (error) {
    console.warn("Supabase load failed", error.message);
    return;
  }

  if (data?.data) {
    Object.assign(state, { ...emptyDatabase, ...data.data });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  if (removeLoadedSamples()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  await saveRemoteDatabase();
  renderAll();
}

async function insertRemoteRow(table, payload) {
  if (!isRemoteReady || !supabaseClient || !currentUser) return null;
  const { data, error } = await supabaseClient
    .from(table)
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    console.warn(`Supabase insert failed for ${table}`, error.message);
    return null;
  }
  return data;
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function numberFrom(id) {
  return Number($(id).value || 0);
}

function textFrom(id) {
  return $(id).value.trim();
}

function resetForm(form) {
  form.reset();
  form.querySelectorAll("input[type='date']").forEach((input) => {
    if (input.dataset.defaultToday === "true") input.value = today();
  });
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewId));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function factoryBalance(order) {
  const total = Number(order.quantity || 0) * Number(order.unitPrice || 0);
  return total - Number(order.paid || 0);
}

function inventorySummary() {
  const bySku = new Map();
  state.inventory.forEach((entry) => {
    const current = bySku.get(entry.sku) || { sku: entry.sku, received: 0, sent: 0, reserved: 0, location: "" };
    current.received += Number(entry.received || 0);
    current.sent += Number(entry.sent || 0);
    current.reserved += Number(entry.reserved || 0);
    current.location = entry.location || current.location;
    bySku.set(entry.sku, current);
  });
  return [...bySku.values()].map((item) => ({
    ...item,
    available: item.received - item.sent - item.reserved
  }));
}

function findByName(collection, name) {
  const normalized = String(name || "").trim().toLowerCase();
  return collection.find((item) => item.name.toLowerCase() === normalized);
}

function findProductBySku(sku) {
  const normalized = String(sku || "").trim().toLowerCase();
  return state.products.find((product) => product.sku.toLowerCase() === normalized);
}

function purchaseRemaining(order) {
  return Number(order.quantity || 0) - Number(order.sent || 0);
}

function isFirstDayOfMonth() {
  return new Date().getDate() === 1;
}

function renderMetrics() {
  const owed = state.factoryOrders.reduce((sum, order) => sum + Math.max(0, factoryBalance(order)), 0);
  const openFactoryPieces = state.factoryOrders.reduce((sum, order) => {
    return sum + Math.max(0, Number(order.quantity || 0) - Number(order.shipped || 0));
  }, 0);
  const incoming = state.shipments.reduce((sum, ship) => sum + (ship.received ? 0 : Number(ship.quantity || 0)), 0);
  const poOpen = state.purchaseOrders.reduce((sum, order) => sum + Math.max(0, purchaseRemaining(order)), 0);

  const metrics = [
    ["Factory balance", money(owed), `${state.factoryOrders.length} orders`, "red"],
    ["Open factory pcs", qty(openFactoryPieces), "not fully shipped", "gold"],
    ["Inbound pcs", qty(incoming), "awaiting receipt", "blue"],
    ["Retail pcs due", qty(poOpen), "purchase orders", "green"]
  ];

  $("metricGrid").innerHTML = metrics.map(([label, value, note, color]) => `
    <article class="metric">
      <span>${label}</span>
      <strong>${value}</strong>
      <small class="${color}">${note}</small>
    </article>
  `).join("");
}

function renderAttention() {
  const items = [];

  state.factoryOrders.forEach((order) => {
    const balance = factoryBalance(order);
    if (balance > 0) items.push({
      title: `${order.manufacturer}: ${money(balance)} still owed`,
      body: `${order.sku} · ${qty(order.quantity)} ordered · ${qty(order.shipped)} shipped`
    });
    if (Number(order.produced || 0) < Number(order.quantity || 0)) items.push({
      title: `${order.sku} production not complete`,
      body: `${qty(order.produced)} produced of ${qty(order.quantity)} ordered`
    });
  });

  state.shipments.forEach((ship) => {
    if (!ship.received) items.push({
      title: `${ship.sku} shipment needs receiving`,
      body: `${qty(ship.quantity)} pcs · tracking ${ship.tracking || "not entered"} · ETA ${ship.eta || "unknown"}`
    });
  });

  state.purchaseOrders.forEach((order) => {
    if (purchaseRemaining(order) > 0) items.push({
      title: `${order.customer} PO ${order.poNumber} still open`,
      body: `${qty(purchaseRemaining(order))} pcs left to send · invoice ${order.invoiceStatus.replace("_", " ")}`
    });
    if (order.invoiceStatus === "not_sent") items.push({
      title: `Invoice not sent for PO ${order.poNumber}`,
      body: `${order.customer} · ${money(order.invoiceAmount)}`
    });
  });

  if (isFirstDayOfMonth()) {
    state.retailStores
      .filter((store) => store.monthlySalesReminder !== false)
      .forEach((store) => {
        items.push({
          title: `Check monthly sale data: ${store.name}`,
          body: store.salesDataNote || "Ask this retailer to send last month's sale data."
        });
      });
  }

  $("attentionCount").textContent = items.length;
  $("attentionList").innerHTML = items.length ? items.slice(0, 8).map((item) => `
    <article class="attention-item">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.body)}</p>
    </article>
  `).join("") : `<p class="muted">No urgent items yet.</p>`;
}

function renderInventorySummary() {
  const rows = inventorySummary();
  $("stockCount").textContent = `${rows.length} SKUs`;
  $("inventoryList").innerHTML = rows.length ? rows.map((item) => `
    <article class="inventory-row">
      <div>
        <h3>${escapeHtml(item.sku)}</h3>
        <span>${escapeHtml(item.location || "No location")} · reserved ${qty(item.reserved)} · sent ${qty(item.sent)}</span>
      </div>
      <strong>${qty(item.available)}</strong>
    </article>
  `).join("") : `<p class="muted">Add received inventory to see stock by SKU.</p>`;
}

function renderMasterDataControls() {
  const manufacturerOptions = [`<option value="">No default manufacturer</option>`].concat(
    state.manufacturers.map((manufacturer) => `<option value="${manufacturer.id}">${escapeHtml(manufacturer.name)}</option>`)
  );
  const storeOptions = [`<option value="">No retail store</option>`].concat(
    state.retailStores.map((store) => `<option value="${store.id}">${escapeHtml(store.name)}</option>`)
  );

  $("productManufacturer").innerHTML = manufacturerOptions.join("");
  $("productStore").innerHTML = storeOptions.join("");
  $("productSkuList").innerHTML = state.products.map((product) => `<option value="${escapeHtml(product.sku)}">${escapeHtml(product.name || product.category || "")}</option>`).join("");
  $("storeNameList").innerHTML = state.retailStores.map((store) => `<option value="${escapeHtml(store.name)}">${escapeHtml(store.contact || "")}</option>`).join("");
  $("manufacturerNameList").innerHTML = state.manufacturers.map((manufacturer) => `<option value="${escapeHtml(manufacturer.name)}">${escapeHtml(manufacturer.contact || "")}</option>`).join("");
}

function renderSetupRecords() {
  const productCards = state.products.map((product) => {
    const manufacturer = state.manufacturers.find((item) => item.id === product.manufacturerId);
    const store = state.retailStores.find((item) => item.id === product.retailStoreId);
    return recordCard(
      `${product.sku} · ${product.name || "Unnamed product"}`,
      product.notes || `${product.category || "No category"} · ${manufacturer?.name || "No factory"} · ${store?.name || "No retail store"}`,
      [
        { text: product.category || "Product", color: "blue" },
        { text: manufacturer?.name || "Factory not linked", color: manufacturer ? "green" : "gold" },
        { text: store?.name || "Store not linked", color: store ? "green" : "gold" },
        { text: money(product.wholesalePrice), color: "blue" }
      ]
    );
  });

  const storeCards = state.retailStores.map((store) => recordCard(
    `Store · ${store.name}`,
    store.salesDataNote || store.address || store.email || "No address",
    [
      { text: store.contact || "No contact", color: "blue" },
      { text: store.phone || "No phone", color: "gold" },
      { text: store.monthlySalesReminder === false ? "No sales reminder" : "Monthly sales reminder", color: store.monthlySalesReminder === false ? "" : "green" }
    ]
  ));

  const manufacturerCards = state.manufacturers.map((manufacturer) => recordCard(
    `Factory · ${manufacturer.name}`,
    manufacturer.notes || manufacturer.email || "No notes",
    [
      { text: manufacturer.contact || "No contact", color: "blue" },
      { text: manufacturer.phone || "No phone", color: "gold" }
    ]
  ));

  $("setupRecords").innerHTML = [...productCards, ...storeCards, ...manufacturerCards].join("") || `<p class="muted">Add stores, products, and manufacturers to link future orders.</p>`;
}

function recordCard(title, body, pills) {
  return `
    <article class="record-card">
      <div class="record-main">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(body)}</p>
      </div>
      <div class="record-meta">
        ${pills.map((pill) => `<span class="pill ${pill.color || ""}">${escapeHtml(pill.text)}</span>`).join("")}
      </div>
    </article>
  `;
}

function renderRecords() {
  $("factoryRecords").innerHTML = state.factoryOrders.map((order) => recordCard(
    `${order.manufacturer} · ${order.sku}`,
    order.notes || `Due ${order.dueDate || "not set"}`,
    [
      { text: `${qty(order.quantity)} ordered`, color: "blue" },
      { text: `${qty(order.produced)} produced`, color: "gold" },
      { text: `${qty(order.shipped)} shipped`, color: "green" },
      { text: `${money(factoryBalance(order))} owed`, color: factoryBalance(order) > 0 ? "red" : "green" }
    ]
  )).join("");

  $("shippingRecords").innerHTML = state.shipments.map((ship) => recordCard(
    `${ship.sku} · ${ship.carrier || "Carrier not set"}`,
    ship.notes || `Tracking ${ship.tracking || "not entered"}`,
    [
      { text: `${qty(ship.quantity)} pcs`, color: "blue" },
      { text: `Ship ${ship.shipDate || "unknown"}`, color: "gold" },
      { text: `ETA ${ship.eta || "unknown"}`, color: "green" }
    ]
  )).join("");

  $("inventoryRecords").innerHTML = state.inventory.map((entry) => recordCard(
    `${entry.sku} · ${entry.location || "No location"}`,
    entry.notes || `Date ${entry.date || "not set"}`,
    [
      { text: `${qty(entry.received)} received`, color: "green" },
      { text: `${qty(entry.sent)} sent`, color: "blue" },
      { text: `${qty(entry.reserved)} reserved`, color: "gold" }
    ]
  )).join("");

  $("poRecords").innerHTML = state.purchaseOrders.map((order) => recordCard(
    `${order.customer} · PO ${order.poNumber}`,
    order.notes || `${order.sku} due ${order.dueDate || "not set"}`,
    [
      { text: `${qty(order.quantity)} ordered`, color: "blue" },
      { text: `${qty(order.sent)} sent`, color: "green" },
      { text: `${qty(purchaseRemaining(order))} remaining`, color: purchaseRemaining(order) > 0 ? "red" : "green" },
      { text: order.invoiceStatus.replace("_", " "), color: order.invoiceStatus === "paid" ? "green" : "gold" },
      { text: order.invoicedAt ? `Invoiced ${formatDateTime(order.invoicedAt)}` : "Not invoiced", color: order.invoicedAt ? "green" : "red" }
    ]
  )).join("");
}

function renderInvoiceRecords() {
  $("invoiceCount").textContent = `${state.purchaseOrders.length} POs`;
  $("invoiceRecords").innerHTML = state.purchaseOrders.length ? state.purchaseOrders.map((order) => `
    <article class="invoice-card" data-po-id="${escapeHtml(order.id)}">
      <div class="record-main">
        <h3>${escapeHtml(order.customer)} · PO ${escapeHtml(order.poNumber)}</h3>
        <p>${escapeHtml(order.sku)} · ${qty(order.quantity)} ordered · ${money(order.invoiceAmount)} · ${order.invoicedAt ? `Invoiced ${formatDateTime(order.invoicedAt)}` : "Invoice not sent"}</p>
      </div>
      <div class="invoice-controls">
        <label>Status
          <select data-invoice-field="status">
            <option value="not_sent" ${order.invoiceStatus === "not_sent" ? "selected" : ""}>Invoice not sent</option>
            <option value="sent" ${order.invoiceStatus === "sent" ? "selected" : ""}>Invoice sent</option>
            <option value="paid" ${order.invoiceStatus === "paid" ? "selected" : ""}>Paid</option>
          </select>
        </label>
        <label>Invoiced time
          <input data-invoice-field="invoicedAt" type="datetime-local" value="${escapeHtml(order.invoicedAt || "")}" />
        </label>
        <button type="button" data-action="save-invoice">Save</button>
      </div>
    </article>
  `).join("") : `<p class="muted">No purchase orders yet.</p>`;
}

function renderDocuments() {
  $("documentCount").textContent = state.documents.length;
  $("documentList").innerHTML = state.documents.length ? state.documents.map((doc) => `
    <article class="document-item">
      <h3>${escapeHtml(doc.name)}</h3>
      <p>${escapeHtml(doc.summary)}</p>
      <div class="record-meta">
        <span class="pill blue">${escapeHtml(doc.kind)}</span>
        <span class="pill">${escapeHtml(doc.createdAt)}</span>
        <span class="pill gold">${escapeHtml(doc.status)}</span>
      </div>
    </article>
  `).join("") : `<p class="muted">No documents imported yet.</p>`;
}

function renderAll() {
  renderMasterDataControls();
  renderSetupRecords();
  renderMetrics();
  renderAttention();
  renderInventorySummary();
  renderRecords();
  renderInvoiceRecords();
  renderDocuments();
}

function setAuthUi(session) {
  currentUser = session?.user || null;
  document.body.classList.toggle("auth-locked", !currentUser);
  $("authError").textContent = "";
}

async function initializeSupabase() {
  document.body.classList.add("auth-locked");
  if (!window.supabase?.createClient) {
    $("authError").textContent = "Supabase library did not load. Check your internet connection.";
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
  const { data } = await supabaseClient.auth.getSession();
  setAuthUi(data.session);

  if (currentUser) {
    isRemoteReady = true;
    await loadRemoteDatabase();
  } else {
    renderAll();
  }

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    setAuthUi(session);
    isRemoteReady = Boolean(session?.user);
    if (session?.user) await loadRemoteDatabase();
  });
}

async function signIn(event) {
  event.preventDefault();
  $("authError").textContent = "";
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: textFrom("loginEmail"),
    password: textFrom("loginPassword")
  });
  if (error) $("authError").textContent = error.message;
}

async function signOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2400);
}

function formatDateTime(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function extractFields(text) {
  const compact = text.replace(/\s+/g, " ").trim();
  const sku = match(compact, /\b(?:SKU|STYLE|ITEM|货号|款号)[:\s#-]*([A-Z0-9][A-Z0-9._-]{2,})/i);
  const qtyMatch = match(compact, /(\d{1,6})\s*(?:pcs|pieces|pc|件|个|箱)/i);
  const priceMatch = match(compact, /(?:\$|USD\s*)\s*(\d+(?:\.\d{1,2})?)|(?:price|unit price|单价)[:\s$]*(\d+(?:\.\d{1,2})?)/i);
  const po = match(compact, /\b(?:PO|P\.O\.|订单|发票|invoice)[:\s#-]*([A-Z0-9-]{3,})/i);
  const tracking = match(compact, /\b(1Z[0-9A-Z]{8,}|[A-Z]{2}\d{9}[A-Z]{2}|\d{10,24})\b/i);
  const date = match(compact, /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
  const partner = match(compact, /(?:factory|manufacturer|vendor|customer|工厂|客户)[:\s-]*([A-Za-z0-9\u4e00-\u9fff .,&-]{2,40})/i);

  return {
    sku: sku || "",
    quantity: qtyMatch || "",
    price: priceMatch || "",
    reference: po || "",
    tracking: tracking || "",
    date: date ? date.replaceAll("/", "-") : today(),
    partner: partner || "",
    notes: compact.slice(0, 600)
  };
}

function match(text, regex) {
  const found = text.match(regex);
  if (!found) return "";
  return found.slice(1).find(Boolean) || "";
}

async function handleImport(event) {
  event.preventDefault();
  const files = [...$("documentFiles").files];
  const rawText = textFrom("rawText");
  let fileText = "";

  for (const file of files) {
    const kind = file.type || file.name.split(".").pop() || "file";
    const canReadText = file.type.startsWith("text/") || /\.(txt|csv)$/i.test(file.name);
    const summary = canReadText ? "Text file read in browser" : "File saved to intake log; production OCR service needed";
    state.documents.unshift({
      id: uid("doc"),
      name: file.name,
      kind,
      size: file.size,
      status: canReadText ? "extracted" : "needs OCR",
      summary,
      createdAt: new Date().toLocaleString()
    });
    if (canReadText) fileText += `\n${await file.text()}`;
  }

  const source = `${rawText}\n${fileText}`.trim();
  if (!source && files.length === 0) return;

  if (source) {
    const draft = extractFields(source);
    $("extractSku").value = draft.sku;
    $("extractQty").value = draft.quantity;
    $("extractPrice").value = draft.price;
    $("extractReference").value = draft.reference;
    $("extractTracking").value = draft.tracking;
    $("extractDate").value = draft.date;
    $("extractPartner").value = draft.partner;
    $("extractNotes").value = draft.notes;
    $("reviewForm").classList.remove("hidden");
  }

  saveDatabase();
}

function saveReviewedRecord(event) {
  event.preventDefault();
  const type = $("extractType").value;
  const base = {
    id: uid(type),
    sku: textFrom("extractSku") || "Unknown SKU",
    quantity: numberFrom("extractQty"),
    notes: textFrom("extractNotes"),
    createdAt: today()
  };

  if (type === "manufacturing") {
    const manufacturer = findByName(state.manufacturers, textFrom("extractPartner"));
    const product = findProductBySku(textFrom("extractSku"));
    state.factoryOrders.unshift({
      ...base,
      manufacturerId: manufacturer?.id || "",
      productId: product?.id || "",
      manufacturer: textFrom("extractPartner") || "Unknown factory",
      unitPrice: numberFrom("extractPrice"),
      paid: 0,
      produced: 0,
      shipped: 0,
      dueDate: textFrom("extractDate")
    });
  }
  if (type === "shipping") {
    const product = findProductBySku(textFrom("extractSku"));
    state.shipments.unshift({
      ...base,
      productId: product?.id || "",
      tracking: textFrom("extractTracking"),
      carrier: "",
      shipDate: textFrom("extractDate"),
      eta: "",
      received: false
    });
  }
  if (type === "purchase") {
    const store = findByName(state.retailStores, textFrom("extractPartner"));
    const product = findProductBySku(textFrom("extractSku"));
    state.purchaseOrders.unshift({
      ...base,
      retailStoreId: store?.id || "",
      productId: product?.id || "",
      customer: textFrom("extractPartner") || "Unknown customer",
      poNumber: textFrom("extractReference") || "PO needed",
      sent: 0,
      invoiceAmount: numberFrom("extractPrice") * numberFrom("extractQty"),
      invoiceStatus: "not_sent",
      invoicedAt: "",
      dueDate: textFrom("extractDate")
    });
  }
  if (type === "inventory") {
    const product = findProductBySku(textFrom("extractSku"));
    state.inventory.unshift({
      ...base,
      productId: product?.id || "",
      received: numberFrom("extractQty"),
      sent: 0,
      reserved: 0,
      location: textFrom("extractPartner"),
      date: textFrom("extractDate")
    });
  }

  $("reviewForm").classList.add("hidden");
  resetForm($("reviewForm"));
  saveDatabase();
}

async function addRetailStore(event) {
  event.preventDefault();
  const remote = await insertRemoteRow("retail_stores", {
    name: textFrom("storeName"),
    contact_name: textFrom("storeContact"),
    email: textFrom("storeEmail"),
    phone: textFrom("storePhone"),
    shipping_address: textFrom("storeAddress"),
    notes: textFrom("storeSalesNote")
  });
  state.retailStores.unshift({
    id: remote?.id || uid("store"),
    name: textFrom("storeName"),
    contact: textFrom("storeContact"),
    email: textFrom("storeEmail"),
    phone: textFrom("storePhone"),
    address: textFrom("storeAddress"),
    monthlySalesReminder: $("storeSalesReminder").value === "yes",
    salesDataNote: textFrom("storeSalesNote"),
    createdAt: today()
  });
  resetForm(event.target);
  saveDatabase();
  showToast(remote ? "Retail store added successfully." : "Retail store saved in app, but Supabase table did not update.");
}

async function addManufacturer(event) {
  event.preventDefault();
  const remote = await insertRemoteRow("manufacturers", {
    name: textFrom("manufacturerName"),
    contact_name: textFrom("manufacturerContact"),
    email: textFrom("manufacturerEmail"),
    phone: textFrom("manufacturerPhone"),
    notes: textFrom("manufacturerNotes")
  });
  state.manufacturers.unshift({
    id: remote?.id || uid("mfg"),
    name: textFrom("manufacturerName"),
    contact: textFrom("manufacturerContact"),
    email: textFrom("manufacturerEmail"),
    phone: textFrom("manufacturerPhone"),
    notes: textFrom("manufacturerNotes"),
    createdAt: today()
  });
  resetForm(event.target);
  saveDatabase();
  showToast("Manufacturer added successfully.");
}

async function addProduct(event) {
  event.preventDefault();
  const remote = await insertRemoteRow("products", {
    sku: textFrom("productSku"),
    name: textFrom("productName"),
    category: textFrom("productCategory"),
    default_wholesale_price: numberFrom("productWholesale"),
    notes: textFrom("productNotes")
  });
  state.products.unshift({
    id: remote?.id || uid("product"),
    sku: textFrom("productSku"),
    name: textFrom("productName"),
    category: textFrom("productCategory"),
    manufacturerId: $("productManufacturer").value,
    retailStoreId: $("productStore").value,
    wholesalePrice: numberFrom("productWholesale"),
    notes: textFrom("productNotes"),
    createdAt: today()
  });
  resetForm(event.target);
  saveDatabase();
  showToast(remote ? "Product added successfully." : "Product saved in app, but Supabase table did not update.");
}

function addFactory(event) {
  event.preventDefault();
  const manufacturer = findByName(state.manufacturers, textFrom("factoryName"));
  const product = findProductBySku(textFrom("factorySku"));
  state.factoryOrders.unshift({
    id: uid("factory"),
    manufacturerId: manufacturer?.id || "",
    productId: product?.id || "",
    manufacturer: textFrom("factoryName"),
    sku: textFrom("factorySku"),
    quantity: numberFrom("factoryQty"),
    unitPrice: numberFrom("factoryPrice"),
    paid: numberFrom("factoryPaid"),
    produced: numberFrom("factoryProduced"),
    shipped: numberFrom("factoryShipped"),
    dueDate: textFrom("factoryDue"),
    notes: textFrom("factoryNotes"),
    createdAt: today()
  });
  resetForm(event.target);
  saveDatabase();
}

function addShipment(event) {
  event.preventDefault();
  const product = findProductBySku(textFrom("shipSku"));
  state.shipments.unshift({
    id: uid("ship"),
    productId: product?.id || "",
    sku: textFrom("shipSku"),
    quantity: numberFrom("shipQty"),
    tracking: textFrom("shipTracking"),
    carrier: textFrom("shipCarrier"),
    shipDate: textFrom("shipDate"),
    eta: textFrom("shipEta"),
    notes: textFrom("shipNotes"),
    received: false,
    createdAt: today()
  });
  resetForm(event.target);
  saveDatabase();
}

function addInventory(event) {
  event.preventDefault();
  const product = findProductBySku(textFrom("invSku"));
  state.inventory.unshift({
    id: uid("inv"),
    productId: product?.id || "",
    sku: textFrom("invSku"),
    received: numberFrom("invReceived"),
    sent: numberFrom("invSent"),
    reserved: numberFrom("invReserved"),
    location: textFrom("invLocation"),
    date: textFrom("invDate"),
    notes: textFrom("invNotes"),
    createdAt: today()
  });
  resetForm(event.target);
  saveDatabase();
}

function addPurchaseOrder(event) {
  event.preventDefault();
  const store = findByName(state.retailStores, textFrom("poCustomer"));
  const product = findProductBySku(textFrom("poSku"));
  const invoiceStatus = $("poInvoiceStatus").value;
  state.purchaseOrders.unshift({
    id: uid("po"),
    retailStoreId: store?.id || "",
    productId: product?.id || "",
    customer: textFrom("poCustomer"),
    poNumber: textFrom("poNumber"),
    sku: textFrom("poSku"),
    quantity: numberFrom("poQty"),
    sent: numberFrom("poSent"),
    invoiceAmount: numberFrom("poInvoiceAmount"),
    invoiceStatus,
    invoicedAt: textFrom("poInvoicedAt") || (invoiceStatus === "not_sent" ? "" : nowLocalInput()),
    dueDate: textFrom("poDue"),
    notes: textFrom("poNotes"),
    createdAt: today()
  });
  resetForm(event.target);
  saveDatabase();
}

function updateInvoiceStatus(event) {
  const button = event.target.closest("[data-action='save-invoice']");
  if (!button) return;
  const card = button.closest("[data-po-id]");
  const order = state.purchaseOrders.find((item) => item.id === card.dataset.poId);
  if (!order) return;

  const status = card.querySelector("[data-invoice-field='status']").value;
  const invoicedAtInput = card.querySelector("[data-invoice-field='invoicedAt']");
  order.invoiceStatus = status;
  order.invoicedAt = status === "not_sent" ? "" : (invoicedAtInput.value || nowLocalInput());
  saveDatabase();
  showToast("Invoice status updated successfully.");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lili-ops-export-${today()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function fillDefaultsFromProduct(sku, targets = {}) {
  const product = findProductBySku(sku);
  if (!product) return;

  const manufacturer = state.manufacturers.find((item) => item.id === product.manufacturerId);
  const store = state.retailStores.find((item) => item.id === product.retailStoreId);

  if (targets.manufacturer && manufacturer && !$(targets.manufacturer).value) {
    $(targets.manufacturer).value = manufacturer.name;
  }
  if (targets.store && store && !$(targets.store).value) {
    $(targets.store).value = store.name;
  }
  if (targets.price && product.wholesalePrice && !$(targets.price).value) {
    $(targets.price).value = product.wholesalePrice;
  }
}

function wireEvents() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  $("factoryForm").addEventListener("submit", addFactory);
  $("shippingForm").addEventListener("submit", addShipment);
  $("inventoryForm").addEventListener("submit", addInventory);
  $("poForm").addEventListener("submit", addPurchaseOrder);
  $("importForm").addEventListener("submit", handleImport);
  $("reviewForm").addEventListener("submit", saveReviewedRecord);
  $("exportData").addEventListener("click", exportData);
  $("loginForm").addEventListener("submit", signIn);
  $("signOutButton").addEventListener("click", signOut);
  $("storeForm").addEventListener("submit", addRetailStore);
  $("manufacturerForm").addEventListener("submit", addManufacturer);
  $("productForm").addEventListener("submit", addProduct);
  $("invoiceRecords").addEventListener("click", updateInvoiceStatus);
  $("factorySku").addEventListener("change", () => fillDefaultsFromProduct(textFrom("factorySku"), { manufacturer: "factoryName" }));
  $("poSku").addEventListener("change", () => fillDefaultsFromProduct(textFrom("poSku"), { store: "poCustomer", price: "poInvoiceAmount" }));
  document.querySelector("[data-action='clear-import']").addEventListener("click", () => resetForm($("importForm")));
  document.querySelector("[data-action='discard-review']").addEventListener("click", () => {
    $("reviewForm").classList.add("hidden");
    resetForm($("reviewForm"));
  });
}

wireEvents();
initializeSupabase();
