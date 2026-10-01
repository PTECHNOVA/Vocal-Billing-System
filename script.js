'use strict';
/* ================= CONFIG (DEV/DEMO ONLY) =================
   Any key placed here is visible to everyone who opens the page.
   For production, call the AI through your own server instead. */
const CONFIG = {
    AI_ENABLED: true,

    AI_API_URL:
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',

    AI_API_KEY: '',

    AI_MODEL: 'gemini-3.8-flash'
};

const BUSINESS = {
    kirana: ['Kirana / General Store', 'Item', '2 Maggi 15 each, 3 Pepsi 40 each'],
    supermarket: ['Supermarket', 'Item', '2 rice 60 each and 1 oil 150'],
    restaurant: ['Restaurant / Cafe', 'Food item', '2 masala dosa 120 each and 3 tea 30 each'],
    electronics: ['Electronics', 'Product', '1 keyboard 1200 and 2 mouse 500 each'],
    medical: ['Medical Store', 'Product', 'Say clear product names; medicine names are always confirmed'],
    clothing: ['Clothing', 'Product', '2 shirt 500 each and 1 jeans 1200'],
    hardware: ['Hardware', 'Product', '10 screws 2 each and 1 hammer 250'],
    other: ['Other', 'Item', '1 item 100 and 2 item 50 each']
};
const $ = id => document.getElementById(id);
const state = { items: [], listening: false, rec: null, lang: 'en-IN', biz: 'kirana', bill: null };

/* ---------- helpers ---------- */
function escapeHTML(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function formatCurrency(n) { return '₹' + (Number.isFinite(n) ? n : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
const num = v => (v === '' || v === null || v === undefined) ? null : (Number.isFinite(+v) ? +v : null);
let noteTimer;
function showNotification(msg, type = 'info') {
    const n = $('notice');
    n.textContent = msg;
    n.className = 'mb-3 p-3 rounded-lg text-sm border ' + ({ error: 'bg-red-50 border-red-300 text-red-800', warn: 'bg-amber-50 border-amber-300 text-amber-900', ok: 'bg-green-50 border-green-300 text-green-900' }[type] || 'bg-sky-50 border-sky-300 text-sky-900');
    n.textContent = ({ error: 'Error: ', warn: 'Check: ', ok: 'Done: ' }[type] || '') + msg; // text prefix so colour isn't the only cue
    clearTimeout(noteTimer); noteTimer = setTimeout(() => n.classList.add('hidden'), 7000);
}
const MIC_TEXT = { idle: 'Ready. Tap the microphone.', listening: 'Listening… tap to stop.', processing: 'Working out your items…', error: 'Microphone problem. See message above.' };
function setLoadingState(s) {
    const m = $('mic'); m.dataset.state = s; $('mic-status').textContent = MIC_TEXT[s]; $('stop-btn').disabled = s !== 'listening';
    m.setAttribute('aria-label', s === 'listening' ? 'Stop listening' : 'Start listening');
}

/* ---------- speech recognition ---------- */
function initializeSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showNotification('Speech recognition is not supported in this browser. Please use Chrome/Edge or enter items manually.', 'warn'); return; }
    const r = new SR();
    r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = handleSpeechResult; r.onerror = handleSpeechError;
    r.onend = () => { if (state.listening) { try { r.start(); } catch (e) { } } }; // browsers stop after silence; restart while user wants to listen
    state.rec = r;
}
let finalText = '';
function startListening() {
    if (!state.rec) { showNotification('Speech recognition is not supported in this browser. Please use Chrome/Edge or enter items manually.', 'warn'); return; }
    state.rec.lang = state.lang; finalText = $('transcript').value ? $('transcript').value.trim() + ' ' : '';
    state.listening = true;
    try { state.rec.start(); setLoadingState('listening'); } catch (e) { /* already started */ }
}
function stopListening() {
    state.listening = false;
    if (state.rec) try { state.rec.stop(); } catch (e) { }
    setLoadingState('idle');
    if ($('transcript').value.trim()) processTranscript($('transcript').value);
}
function handleSpeechResult(e) {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + ' '; else interim += t;
    }
    $('transcript').value = (finalText + interim).trim();
}
function handleSpeechError(e) {
    const msg = {
        'not-allowed': 'Microphone permission is required for voice billing.', 'service-not-allowed': 'Microphone permission is required for voice billing.',
        'no-speech': 'No speech was detected. Please try again.', 'network': 'Speech recognition could not connect. Please try again or enter items manually.'
    }[e.error] || 'Speech error: ' + e.error;
    if (e.error === 'no-speech') return showNotification(msg, 'warn');
    state.listening = false; setLoadingState('error'); showNotification(msg, 'error');
}

/* ---------- parsing ---------- */
const WORD_NUMS = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
    panch: 5, paanch: 5, paanchh: 5, ek: 1, do: 2, teen: 3, char: 4, chaar: 4, cheh: 6, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
    gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15, solah: 16, satrah: 17, atharah: 18, unnis: 19,
    bees: 20, baees: 22, teis: 23, chaubees: 24, pachis: 25, pachees: 25, chhabbees: 26, sattais: 27, atthais: 28, untis: 29,
    tees: 30, chalis: 40, chaalis: 40, pachas: 50, pachhas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90,
    'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10, 'पंद्रह': 15, 'बीस': 20, 'तीस': 30, 'चालीस': 40, 'पचास': 50, 'सौ': 100
};
const UNIT_NAMES = {
    kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
    g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g',
    litre: 'litre', litres: 'litre', liter: 'litre', liters: 'litre', ltr: 'litre', ltrs: 'litre', l: 'litre',
    packet: 'packet', packets: 'packet', pack: 'packet', packs: 'packet',
    pc: 'pcs', pcs: 'pcs', piece: 'pcs', pieces: 'pcs'
};
function normalizeSpokenNumbers(text) {
    const tens = Object.entries(WORD_NUMS).filter(([word, value]) => value >= 20 && value < 100 && value % 10 === 0 && /^[a-z]+$/.test(word));
    const ones = Object.entries(WORD_NUMS).filter(([word, value]) => value > 0 && value < 10 && /^[a-z]+$/.test(word));
    for (const [tensWord, tensValue] of tens) {
        const suffixPattern = ones.map(([word]) => word).join('|');
        text = text.replace(new RegExp(`\\b${tensWord}[ -](${suffixPattern})\\b`, 'gi'), (_, oneWord) => String(tensValue + WORD_NUMS[oneWord.toLowerCase()]));
    }
    return text.replace(/[A-Za-z\u0900-\u097F]+(?:-[A-Za-z\u0900-\u097F]+)*/g, word => {
        const normalized = word.toLowerCase();
        return normalized in WORD_NUMS ? String(WORD_NUMS[normalized]) : word;
    });
}
function parseWithFallback(text) {
    const items = [], warnings = [];
    const digitText = normalizeSpokenNumbers(text.replace(/[०-९]/g, d => '०१२३४५६७८९'.indexOf(d)));
    const segs = digitText.split(/[,;\n]+|\s+(?:and|और)\s+(?=\d)/i)
        .map(s => s.trim()).filter(Boolean);
    for (const seg of segs) {
        let body = seg.replace(/₹|(?:rs\.?|rupees?|rupaye)\b|रुपये|रुपए|रुपया/gi, ' ');
        const discountMatch = body.match(/(?:discount|off)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:%|percent)|(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:discount|off)/i);
        const taxMatch = body.match(/(?:tax|gst)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*(?:%|percent)|(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:tax|gst)/i);
        const percentageValue = match => match ? +(match[1] || match[2]) : 0;
        body = body.replace(/(?:discount|off)\s*(?:of\s*)?\d+(?:\.\d+)?\s*(?:%|percent)|\d+(?:\.\d+)?\s*(?:%|percent)\s*(?:discount|off)|(?:tax|gst)\s*(?:of\s*)?\d+(?:\.\d+)?\s*(?:%|percent)|\d+(?:\.\d+)?\s*(?:%|percent)\s*(?:tax|gst)/gi, ' ');
        const toks = body.split(/\s+/).filter(Boolean).map(t => {
            const word = t.replace(/[.,!?]/g, '').toLowerCase();
            return word in WORD_NUMS ? String(WORD_NUMS[word]) : t.replace(/[.,!?]/g, '');
        });
        const unit = toks.map(token => UNIT_NAMES[token.toLowerCase()]).find(Boolean) ?? null;
        const ignored = /^(?:of|packet|packets|pack|packs|piece|pieces|pcs?|kg|kgs|kilogram|kilograms|g|gm|gms|gram|grams|litre|litres|liter|liters|ltr|ltrs|l|each|per|unit|units|a|an|the|at|for|qty|quantity|price|rate|cost|x|i|bought|buy|add|please|bill|and|और|की|का|के|में|को|पर)$/i;
        const numIdx = toks.map((t, i) => /^\d+(?:\.\d+)?$/.test(t) ? i : -1).filter(i => i >= 0);
        const name = toks.filter((t, i) => !numIdx.includes(i) && !ignored.test(t)).join(' ').trim();
        const nums = numIdx.map(i => +toks[i]);
        if (!name) { warnings.push(`Could not find an item name in "${seg}".`); continue; }
        let quantity = null, unitPrice = null, needs = false;
        const beginsWithQuantity = numIdx[0] === 0 || (numIdx[0] === 1 && ignored.test(toks[0]));
        if (nums.length >= 2) {
            quantity = beginsWithQuantity ? nums[0] : nums[nums.length - 2];
            unitPrice = beginsWithQuantity ? nums[1] : nums[nums.length - 1];
        } else if (nums.length === 1) {
            if (beginsWithQuantity) quantity = nums[0];
            else { quantity = 1; unitPrice = nums[0]; needs = true; }
        }
        if (quantity === null || quantity <= 0) { quantity = null; needs = true; }
        if (unitPrice === null || unitPrice < 0) needs = true;
        const discount = percentageValue(discountMatch), taxRate = taxMatch ? percentageValue(taxMatch) : null;
        items.push({ name, quantity, unitPrice, discount, taxRate, unit, confidence: needs ? 0.6 : 0.9, needsConfirmation: needs });
        if (quantity === null) warnings.push(`Quantity for "${name}" was not stated. Please fill it in.`);
        if (unitPrice === null) warnings.push(`Price for "${name}" was not stated. Please fill it in.`);
    }
    return { items, warnings, requiresConfirmation: true };
}
async function parseWithAI(text) {
    const prompt = `You are a billing data extraction assistant. Convert the user's natural-language shopping/billing statement into structured JSON. Extract only information explicitly provided. Never invent prices, quantities, tax rates, discounts, product names or totals. If missing or ambiguous, return null and explain in warnings. Do not calculate totals. Return valid JSON only.\nSchema: {"items":[{"name":string,"quantity":number|null,"unitPrice":number|null,"discount":number|null,"taxRate":number|null,"unit":string|null,"confidence":number,"needsConfirmation":boolean}],"warnings":[string],"requiresConfirmation":boolean}\nBusiness type: ${BUSINESS[state.biz][0]}\nLanguage: ${state.lang}\nUser speech: ${text}\nReturn only the requested JSON structure.`;
    const url = CONFIG.AI_API_URL.replace('{MODEL}', CONFIG.AI_MODEL);
    const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': CONFIG.AI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } })
    });
    if (!res.ok) throw new Error('AI HTTP ' + res.status);
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const m = raw.replace(/```json|```/g, '').match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No JSON in AI response');
    return JSON.parse(m[0]);
}
function validateParsedData(d) {
    if (!d || !Array.isArray(d.items)) return null;
    const items = [];
    for (const it of d.items) {
        const name = String(it?.name ?? '').trim();
        if (!name) continue;
        let quantity = num(it.quantity), unitPrice = num(it.unitPrice);
        if (quantity !== null && quantity <= 0) quantity = null;   // invalid quantity is rejected, user must re-enter
        if (unitPrice !== null && unitPrice < 0) unitPrice = null;
        const conf = Math.min(1, Math.max(0, num(it.confidence) ?? 0.5));
        items.push({
            name, quantity, unitPrice, discount: Math.max(0, num(it.discount) ?? 0), taxRate: num(it.taxRate) !== null && it.taxRate >= 0 ? +it.taxRate : null,
            unit: it.unit ? String(it.unit) : null, confidence: conf, needsConfirmation: !!it.needsConfirmation || conf < 0.8
        });
    }
    return { items, warnings: (Array.isArray(d.warnings) ? d.warnings : []).map(String), requiresConfirmation: !!d.requiresConfirmation };
}
async function processTranscript(text) {
    text = text.trim(); if (!text) return showNotification('Nothing to add yet. Speak or type your items.', 'warn');
    setLoadingState('processing');
    let result = null, source = 'Basic parser (no AI): please verify every item.';
    const aiReady = CONFIG.AI_ENABLED && CONFIG.AI_API_KEY && !CONFIG.AI_API_KEY.startsWith('YOUR_');
    if (aiReady) {
        try { result = validateParsedData(await parseWithAI(text)); if (result) source = 'Parsed by AI: please verify every item.'; }
        catch (err) { console.warn('AI parsing failed:', err.message); showNotification('AI unavailable, used basic parser instead.', 'warn'); }
    }
    if (!result) { result = validateParsedData(parseWithFallback(text)); }
    $('parse-source').textContent = source;
    setLoadingState('idle');
    result.items.forEach(addItem);
    if (!result.items.length) showNotification('No items found. Try "2 Maggi 15 each" or add manually.', 'warn');
    else if (result.warnings.length) showNotification(result.warnings.join(' '), 'warn');
    else showNotification(`${result.items.length} item(s) added. Please review.`, 'ok');
    $('transcript').value = ''; finalText = '';
}

/* ---------- billing engine (pure, no DOM) ---------- */
function calculateItemTotal(item) {
    const q = item.quantity ?? 0, p = item.unitPrice ?? 0;
    const subtotal = q * p, discount = subtotal * (item.discount || 0) / 100;
    const taxable = subtotal - discount;
    const rate = item.taxRate ?? num($('default-tax').value) ?? 0;
    const tax = taxable * rate / 100;
    return { subtotal, discount, taxable, tax, rate, total: taxable + tax };
}
function calculateBillTotals() {
    let subtotal = 0, itemDiscount = 0, taxTotal = 0, taxable = 0, net = 0;
    state.items.forEach(i => { const c = calculateItemTotal(i); subtotal += c.subtotal; itemDiscount += c.discount; taxTotal += c.tax; taxable += c.taxable; net += c.total; });
    const bd = Math.max(0, num($('bill-discount').value) ?? 0);
    const billDiscount = Math.min(net, $('bill-discount-type').value === 'percentage' ? net * bd / 100 : bd);
    const exact = net - billDiscount;
    const grandTotal = Math.round(exact);
    return { subtotal, discountTotal: itemDiscount + billDiscount, taxable, taxTotal, roundOff: grandTotal - exact, grandTotal };
}
const itemProblems = i => { const p = []; if (!i.name.trim()) p.push('name'); if (!(i.quantity > 0)) p.push('quantity'); if (i.unitPrice === null || !(i.unitPrice >= 0)) p.push('price'); return p; };

/* ---------- item operations ---------- */
function addItem(item = {}) {
    state.items.push({
        name: item.name ?? '', quantity: item.quantity ?? null, unitPrice: item.unitPrice ?? null, discount: item.discount ?? 0,
        taxRate: item.taxRate ?? null, unit: item.unit ?? null, confidence: item.confidence ?? 1, needsConfirmation: !!item.needsConfirmation
    });
    renderBillItems(); renderBillSummary();
}
function updateItem(index, field, value) {
    const it = state.items[index]; if (!it) return;
    if (field === 'name') it.name = value;
    else { const n = num(value); it[field] = (n === null || n < 0) ? (field === 'discount' ? 0 : null) : n; if (field === 'quantity' && n !== null && n <= 0) it.quantity = null; }
    it.needsConfirmation = false;
    renderBillSummary();
    const amt = document.querySelector(`[data-amt="${index}"]`); if (amt) amt.textContent = formatCurrency(calculateItemTotal(it).total);
    refreshItemRow(index);
}
function removeItem(index) { state.items.splice(index, 1); renderBillItems(); renderBillSummary(); }
function clearBill() { state.items = []; $('bill-discount').value = 0; renderBillItems(); renderBillSummary(); }

/* ---------- rendering ---------- */
function renderBillItems() {
    $('empty').classList.toggle('hidden', state.items.length > 0);
    $('items').innerHTML = state.items.map((it, i) => {
        const prob = itemProblems(it), flag = it.needsConfirmation;
        const f = (label, field, val, bad, extra = '') => `<label><span class="sr-only">${label}</span><input class="fld ${field === 'name' ? 'item-input' : ''} ${bad ? 'missing' : ''}" data-i="${i}" data-f="${field}" type="${field === 'name' ? 'text' : 'number'}" ${field === 'name' ? '' : 'min="0" step="any" inputmode="decimal"'} value="${escapeHTML(val ?? '')}" ${bad ? 'aria-invalid="true"' : ''} ${extra}></label>`;
        return `<tr class="row ${flag || prob.length ? 'bill-row-warning' : ''}">
      <td>${f('Item', 'name', it.name, prob.includes('name'))}${prob.length ? `<p class="text-xs text-red-700 mt-1">⚠ Enter ${prob.join(' & ')}</p>` : flag ? '<p class="text-xs text-amber-800 mt-1">⚠ Please confirm</p>' : ''}</td>
      <td><div class="bill-qty"><button class="btn qty-btn" data-dec="${i}" aria-label="Decrease quantity of ${escapeHTML(it.name)}">−</button>${f('Qty', 'quantity', it.quantity, prob.includes('quantity'))}<button class="btn qty-btn" data-inc="${i}" aria-label="Increase quantity of ${escapeHTML(it.name)}">+</button></div></td>
      <td>${f('Price ₹', 'unitPrice', it.unitPrice, prob.includes('price'))}</td><td>${f('Disc %', 'discount', it.discount, false)}</td>
      <td>${f('Tax %', 'taxRate', it.taxRate, false, `placeholder="${num($('default-tax').value) ?? 0}"`)}</td>
      <td class="font-semibold whitespace-nowrap" data-amt="${i}">${formatCurrency(calculateItemTotal(it).total)}</td>
      <td><button class="btn remove-item" data-rm="${i}" aria-label="Remove ${escapeHTML(it.name || 'item')}">Remove</button></td></tr>`;
    }).join('');
}
function refreshItemRow(index) {
    const item = state.items[index], row = $('items').querySelector(`[data-amt="${index}"]`)?.closest('.row');
    if (!item || !row) return;
    const problems = itemProblems(item), problemFields = { name: 'name', quantity: 'quantity', price: 'unitPrice' };
    row.classList.toggle('bill-row-warning', item.needsConfirmation || problems.length > 0);
    row.querySelectorAll('input[data-f]').forEach(input => {
        const field = input.dataset.f;
        const isInvalid = Object.entries(problemFields).some(([problem, inputField]) => inputField === field && problems.includes(problem));
        input.classList.toggle('missing', isInvalid);
        if (isInvalid) input.setAttribute('aria-invalid', 'true');
        else input.removeAttribute('aria-invalid');
    });
    const details = row.firstElementChild;
    details.querySelector('p')?.remove();
    if (problems.length || item.needsConfirmation) {
        const message = document.createElement('p');
        message.className = problems.length ? 'text-xs text-red-700 mt-1' : 'text-xs text-amber-800 mt-1';
        message.textContent = problems.length ? `⚠ Enter ${problems.join(' & ')}` : '⚠ Please confirm';
        details.append(message);
    }
}
function renderBillSummary() {
    const t = calculateBillTotals();
    const row = (l, v, big) => `<div class="flex justify-between ${big ? 'text-xl font-bold pt-1 border-t' : ''}"><dt>${l}</dt><dd>${formatCurrency(v)}</dd></div>`;
    $('summary').innerHTML = row('Subtotal', t.subtotal) + row('Discount', -t.discountTotal) + row('Taxable amount', t.taxable) + row('Tax', t.taxTotal) + (t.roundOff ? row('Round off', t.roundOff) : '') + row('Grand total', t.grandTotal, true);
}
function applyBusinessType() {
    const [name, label, ex] = BUSINESS[state.biz];
    $('h-item').textContent = label; $('example').textContent = '“' + ex + '”';
}

/* ---------- invoice ---------- */
function generateBill() {
    if (!state.items.length) return showNotification('Add at least one item first.', 'warn');
    const bad = state.items.findIndex(i => itemProblems(i).length);
    if (bad >= 0) { renderBillItems(); return showNotification(`"${state.items[bad].name || 'Item ' + (bad + 1)}" is missing ${itemProblems(state.items[bad]).join(' & ')}. Please fill it in.`, 'error'); }
    if (state.biz === 'medical' && state.items.some(i => i.needsConfirmation) && !confirm('Please confirm every medicine name is correct before billing.')) return;
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const no = `VB-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const totals = calculateBillTotals();
    state.bill = { no, date: d.toLocaleDateString('en-IN'), time: d.toLocaleTimeString('en-IN'), totals, lines: state.items.map(i => ({ ...i, ...calculateItemTotal(i) })) };
    const s = id => escapeHTML($(id).value);
    $('invoice').innerHTML = `<div class="text-center"><h2 class="text-xl font-bold">${s('s-name')}</h2><p class="text-sm">${escapeHTML(BUSINESS[state.biz][0])}</p>
    ${$('s-addr').value ? `<p class="text-sm">${s('s-addr')}</p>` : ''}${$('s-gstin').value ? `<p class="text-sm">GSTIN: ${s('s-gstin')}</p>` : ''}</div>
    <div class="flex justify-between text-sm my-3"><span>Bill: ${no}</span><span>${state.bill.date} ${state.bill.time}</span></div>
    ${$('s-cust').value || $('s-phone').value ? `<p class="text-sm mb-2">Customer: ${s('s-cust')} ${s('s-phone')}</p>` : ''}
    <div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="border-b text-left"><th>Item</th><th class="text-right">Qty</th><th class="text-right">Price</th><th class="text-right">Disc</th><th class="text-right">Tax</th><th class="text-right">Amount</th></tr></thead><tbody>
    ${state.bill.lines.map(l => `<tr class="border-b"><td>${escapeHTML(l.name)}</td><td class="text-right">${l.quantity}</td><td class="text-right">${formatCurrency(l.unitPrice)}</td><td class="text-right">${formatCurrency(l.discount)}</td><td class="text-right">${l.rate}% (${formatCurrency(l.tax)})</td><td class="text-right">${formatCurrency(l.total)}</td></tr>`).join('')}
    </tbody></table></div>
    <dl class="mt-3 text-sm space-y-1"><div class="flex justify-between"><dt>Subtotal</dt><dd>${formatCurrency(totals.subtotal)}</dd></div><div class="flex justify-between"><dt>Total discount</dt><dd>-${formatCurrency(totals.discountTotal)}</dd></div>
    <div class="flex justify-between"><dt>Total tax</dt><dd>${formatCurrency(totals.taxTotal)}</dd></div><div class="flex justify-between text-lg font-bold border-t pt-1"><dt>Grand total</dt><dd>${formatCurrency(totals.grandTotal)}</dd></div></dl>
    <p class="text-center text-xs mt-4">Thank you! Generated with VoiceBill</p>`;
    $('invoice-modal').classList.add('open');
}
function printBill() { window.print(); }
function downloadPDF() {
    const b = state.bill; if (!b) return;
    if (!window.jspdf) return showNotification('PDF library could not load (offline?). Use Print → Save as PDF.', 'warn');
    const doc = new window.jspdf.jsPDF(), money = n => 'Rs. ' + n.toFixed(2); // built-in PDF fonts lack the ₹ glyph
    let y = 15; doc.setFontSize(16); doc.text($('s-name').value || 'My Store', 105, y, { align: 'center' });
    doc.setFontSize(10); y += 8; doc.text(`Bill ${b.no}   ${b.date} ${b.time}`, 15, y); y += 8;
    doc.text('Item', 15, y); doc.text('Qty', 100, y); doc.text('Price', 125, y); doc.text('Amount', 195, y, { align: 'right' }); y += 2; doc.line(15, y, 195, y); y += 6;
    b.lines.forEach(l => { if (y > 270) { doc.addPage(); y = 15; } doc.text(l.name.slice(0, 40), 15, y); doc.text(String(l.quantity), 100, y); doc.text(money(l.unitPrice), 125, y); doc.text(money(l.total), 195, y, { align: 'right' }); y += 6; });
    y += 2; doc.line(15, y, 195, y); y += 6;
    [['Subtotal', b.totals.subtotal], ['Discount', -b.totals.discountTotal], ['Tax', b.totals.taxTotal]].forEach(([l, v]) => { doc.text(l, 125, y); doc.text(money(v), 195, y, { align: 'right' }); y += 6; });
    doc.setFontSize(12); doc.text('Grand total', 125, y); doc.text(money(b.totals.grandTotal), 195, y, { align: 'right' });
    doc.save(`VoiceBill-Invoice-${b.no}.pdf`);
}

/* ---------- init ---------- */
function initializeApp() {
    $('business-type').innerHTML = Object.entries(BUSINESS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('');
    try { const p = JSON.parse(localStorage.getItem('voicebill-prefs') || '{}'); if (p.biz in BUSINESS) state.biz = p.biz; if (p.lang) state.lang = p.lang; if (p.dark) $('s-dark').checked = true; } catch (e) { }
    const savePrefs = () => { try { localStorage.setItem('voicebill-prefs', JSON.stringify({ biz: state.biz, lang: state.lang, dark: $('s-dark').checked })); } catch (e) { } };
    const applyDark = () => document.documentElement.style.filter = $('s-dark').checked ? 'invert(1) hue-rotate(180deg)' : '';
    $('business-type').value = state.biz; $('language').value = state.lang; $('lang-label').textContent = $('language').selectedOptions[0].text;
    applyBusinessType(); applyDark(); initializeSpeechRecognition(); renderBillItems(); renderBillSummary();

    $('mic').onclick = () => state.listening ? stopListening() : startListening();
    $('stop-btn').onclick = stopListening;
    $('parse-btn').onclick = () => { if (state.listening) stopListening(); else processTranscript($('transcript').value); };
    $('clear-transcript').onclick = () => { $('transcript').value = ''; finalText = ''; };
    $('business-type').onchange = e => { state.biz = e.target.value; applyBusinessType(); savePrefs(); };
    $('language').onchange = e => { state.lang = e.target.value; $('lang-label').textContent = e.target.selectedOptions[0].text; if (state.listening) { stopListening(); } savePrefs(); };
    $('add-item').onclick = () => { addItem({ name: '', quantity: 1, unitPrice: 0, discount: 0, taxRate: 0, confidence: 1 }); document.querySelector('#items > div:last-child input')?.focus(); };
    $('generate').onclick = generateBill; $('clear-bill').onclick = () => { if (!state.items.length || confirm('Clear the whole bill?')) clearBill(); };
    $('print-btn').onclick = printBill; $('pdf-btn').onclick = downloadPDF; $('close-modal').onclick = () => $('invoice-modal').classList.remove('open');
    ['bill-discount', 'bill-discount-type', 'default-tax'].forEach(id => $(id).addEventListener('input', () => { renderBillSummary(); document.querySelectorAll('[data-amt]').forEach(el => el.textContent = formatCurrency(calculateItemTotal(state.items[+el.dataset.amt]).total)); }));
    $('settings-btn').onclick = () => { $('settings-modal').classList.remove('hidden'); $('settings-modal').classList.add('flex'); };
    $('s-close').onclick = () => { $('settings-modal').classList.add('hidden'); $('settings-modal').classList.remove('flex'); applyDark(); savePrefs(); };
    window.addEventListener('beforeprint', () => document.documentElement.style.filter = ''); window.addEventListener('afterprint', applyDark);

    const list = $('items');
    list.addEventListener('input', e => { const t = e.target; if (t.dataset.f) updateItem(+t.dataset.i, t.dataset.f, t.value); });
    list.addEventListener('change', e => {
        const input = e.target;
        if (input.dataset.i !== undefined) refreshItemRow(+input.dataset.i);
    });
    list.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.rm !== undefined) removeItem(+b.dataset.rm);
        else if (b.dataset.inc !== undefined) { const it = state.items[+b.dataset.inc]; updateItem(+b.dataset.inc, 'quantity', (it.quantity || 0) + 1); renderBillItems(); }
        else if (b.dataset.dec !== undefined) { const it = state.items[+b.dataset.dec]; if ((it.quantity || 0) > 1) { updateItem(+b.dataset.dec, 'quantity', it.quantity - 1); renderBillItems(); } }
    });
}
document.addEventListener('DOMContentLoaded', initializeApp);