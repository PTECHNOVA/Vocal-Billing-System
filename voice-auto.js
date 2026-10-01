'use strict';
/* VoiceBill voice extension. Load AFTER script.js (see index.html note).
   Extends the existing parser/mic pipeline; script.js is not edited. */
(() => {
    const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const add = (map, keys, v) => keys.split(' ').forEach(k => { map[k] = v; map[k.normalize('NFC')] = v; });

    /* ---------- vocabulary (extends existing tables) ---------- */
    add(WORD_NUMS, 'aadha aadhaa adha aadhe आधा आधे', 0.5);
    add(WORD_NUMS, 'paun pauna पौना', 0.75);
    add(WORD_NUMS, 'derh dedh डेढ़ डेढ', 1.5);
    add(WORD_NUMS, 'dhai adhai ढाई', 2.5);
    add(WORD_NUMS, 'hundred sau सौ', 100);
    [['छः छे chhah', 6], ['ग्यारह', 11], ['बारह', 12], ['तेरह', 13], ['चौदह', 14], ['सोलह', 16], ['सत्रह', 17], ['अठारह', 18], ['उन्नीस', 19],
    ['पच्चीस पचीस', 25], ['पैंतीस', 35], ['साठ', 60], ['सत्तर', 70], ['अस्सी', 80], ['नब्बे', 90],
    ['pehla pahla first पहला', 1], ['doosra dusra doosri second दूसरा दूसरी', 2], ['teesra tisra third तीसरा तीसरी', 3],
    ['chautha fourth चौथा', 4], ['paanchva panchva fifth पांचवां पाँचवां पांचवा', 5]].forEach(([k, v]) => add(WORD_NUMS, k, v));
    [['kilo kilos किलो किलोग्राम', 'kg'], ['ग्राम', 'g'], ['लीटर', 'litre'], ['ml milliliter milliliters millilitre मिलीलीटर', 'ml'],
    ['meter metre meters मीटर', 'meter'], ['पीस', 'pcs'], ['नग nag', 'pcs']].forEach(([k, v]) => add(UNIT_NAMES, k, v));
    MIC_TEXT.listening = 'Listening for items… tap to stop.';

    const GROUPS = [['sugar', 'cheeni', 'chini', 'चीनी', 'शक्कर', 'shakkar'], ['rice', 'chawal', 'chaawal', 'चावल'], ['salt', 'namak', 'नमक'],
    ['oil', 'tel', 'तेल'], ['wheat', 'atta', 'gehu', 'आटा', 'गेहूं'], ['milk', 'doodh', 'दूध'], ['dal', 'daal', 'दाल'], ['tea', 'chai', 'चाय'], ['soap', 'sabun', 'साबुन']];
    const canon = w => { const g = GROUPS.find(g => g.includes(w)); return g ? g[0] : w; };
    const FILLER = /^(?:yes|no|ok|okay|haan|han|ha|ji|hello|hi|hmm+|uh+|um+|market|theek|thik|achha|accha)$/i;
    const isComplete = i => i.quantity > 0 && i.unitPrice !== null && i.unitPrice !== undefined && i.unitPrice >= 0;

    /* ---------- number normaliser: Hindi/Hinglish words, "ek sau bees" = 120 ---------- */
    window.normalizeSpokenNumbers = function (text) {
        text = String(text).replace(/\baur\b/gi, 'and').replace(/\b(?:rupaiye|rupay|rupiya)\b/gi, 'rupees').replace(/([A-Za-z])-(?=[A-Za-z])/g, '$1 ');
        return text.split('\n').map(line => {
            const out = [];
            for (const raw of line.split(/[ \t]+/).filter(Boolean)) {
                const m = raw.match(/^([^,;.!?]*)([,;.!?]*)$/) || [raw, raw, ''];
                const word = m[1], punct = m[2], k = word.normalize('NFC').toLowerCase();
                const v = hasOwn(WORD_NUMS, k) ? WORD_NUMS[k] : undefined, last = out[out.length - 1];
                if (v === undefined) { out.push({ s: raw }); continue; }
                if (last && last.n !== undefined && !last.p) {
                    if (v === 100 && last.n > 0 && last.n < 10) { last.n *= 100; last.h = true; last.t = false; last.p = punct; continue; }
                    if (last.h && Number.isInteger(v) && v > 0 && v < 100 && last.n % 100 === 0) { last.n += v; last.t = v >= 20 && v % 10 === 0; last.p = punct; continue; }
                    if (last.t && Number.isInteger(v) && v > 0 && v < 10) { last.n += v; last.t = false; last.p = punct; continue; }
                }
                out.push({ n: v, p: punct, t: v >= 20 && v < 100 && v % 10 === 0 });
            }
            return out.map(o => o.s !== undefined ? o.s : String(o.n) + o.p).join(' ');
        }).join('\n');
    };

    /* ---------- parsed items: strip unit words, fix gram/ml pricing, drop noise ---------- */
    let autoMode = false;
    const origAdd = addItem;
    window.addItem = function (item = {}) {
        if (item.unit) {
            const nm = String(item.name || '').split(/\s+/).filter(w => !hasOwn(UNIT_NAMES, w.toLowerCase())).join(' ') || item.name;
            item = { ...item, name: nm };
            // price given for "500 gram salt 30" is for the pack, not per gram: qty x price would be wrong
            if ((item.unit === 'g' || item.unit === 'ml') && item.quantity >= 1 && item.unitPrice !== null) { item.name += ` ${item.quantity} ${item.unit}`; item.quantity = 1; }
        }
        if (autoMode && !(isComplete(item) && !FILLER.test(String(item.name).trim()) && /\p{L}/u.test(item.name))) return;
        return origAdd(item);
    };

    /* ---------- remove commands (English / Hindi / Hinglish) ---------- */
    const RM_VERB = /^(?:remove|delete|cancel|nikal\w*|hata\w*|हटा[\u0900-\u097F]*|निकाल[\u0900-\u097F]*|डिलीट|रिमूव|कैंसिल)$/i;
    const RM_FILL = new Set(['karo', 'kardo', 'kar', 'please', 'item', 'items', 'number', 'no', 'serial', 'wala', 'wali', 'the', 'ko', 'se', 'bill', 'from', 'ka', 'ki', 'ke',
        'करो', 'कर', 'आइटम', 'आईटम', 'नंबर', 'नम्बर', 'वाला', 'वाली', 'को', 'से', 'बिल', 'का', 'की', 'के']);
    const IDX_KW = /^(?:item|items|number|no|serial|nambar|आइटम|आईटम|नंबर|नम्बर)$/;
    function parseRemove(text) {
        const toks = text.normalize('NFC').toLowerCase().replace(/[.,!?।]/g, ' ').split(/\s+/).filter(Boolean);
        if (!toks.some(t => RM_VERB.test(t))) return null;
        const rest = []; let prevVerb = false;
        for (const t of toks) {
            if (RM_VERB.test(t)) { prevVerb = true; continue; }
            if (prevVerb && /^(?:do|de|dijiye|दो|दें|दीजिए)$/.test(t)) { prevVerb = false; continue; }
            prevVerb = false;
            if (!RM_FILL.has(t)) rest.push(t);
        }
        const nt = window.normalizeSpokenNumbers(rest.join(' ')).split(/\s+/).filter(Boolean);
        const digits = nt.filter(t => /^\d+$/.test(t)), names = nt.filter(t => !/^\d+(?:\.\d+)?$/.test(t));
        if (digits.length && (!names.length || toks.some(t => IDX_KW.test(t)))) return { index: +digits[0] - 1 };
        return { name: names };
    }
    function doRemove(rm) {
        let idx = -1;
        if (rm.index !== undefined) {
            if (rm.index < 0 || rm.index >= state.items.length) return showNotification(`There is no item ${rm.index + 1} in the bill.`, 'warn');
            idx = rm.index;
        } else if (rm.name && rm.name.length) {
            const words = s => String(s).toLowerCase().split(/\s+/).map(canon), hits = [];
            state.items.forEach((it, i) => {
                const w = words(it.name);
                if (rm.name.every(t => { const c = canon(t); return w.some(x => x === c || (c.length > 3 && x.length > 3 && (x.includes(c) || c.includes(x)))); })) hits.push(i);
            });
            if (!hits.length) return showNotification(`No item matching "${rm.name.join(' ')}" found.`, 'warn');
            if (hits.length > 1) return showNotification(`More than one item matches "${rm.name.join(' ')}". Say the item number, e.g. "item ${hits[0] + 1} hatao".`, 'warn');
            idx = hits[0];
        } else return showNotification('Say which item to remove, e.g. "remove sugar" or "item 2 hatao".', 'warn');
        const nm = state.items[idx].name; removeItem(idx);
        showNotification(`Removed item ${idx + 1}: ${nm || 'item'}.`, 'ok');
    }

    /* ---------- ADD / REMOVE routing (reuses the existing parse + AI + fallback flow) ---------- */
    const origProcess = processTranscript;
    window.processTranscript = async function (text, auto) {
        text = String(text || '').trim();
        const rm = text && parseRemove(text);
        if (rm) { doRemove(rm); $('transcript').value = ''; return; }
        if (auto) {
            if (!parseWithFallback(text).items.some(isComplete)) return;   // noise/chatter: change nothing
            autoMode = true;
        }
        try { return await origProcess(text); } finally { autoMode = false; }
    };

    /* ---------- continuous listening, finals only, duplicate protection ---------- */
    const origSet = setLoadingState;
    window.setLoadingState = s => origSet(state.listening && (s === 'idle' || s === 'processing') ? 'listening' : s); // mic stays "listening" while auto-processing
    const seen = new WeakSet(); let lastKey = '', lastAt = 0, queue = Promise.resolve();
    window.handleSpeechResult = function (e) {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i], a = r[0];
            if (!r.isFinal) { interim += a.transcript; continue; }       // interim text is shown, never billed
            if (seen.has(r)) continue; seen.add(r);                     // same result object never processed twice
            const t = a.transcript.trim();
            if (t.length < 3 || (a.confidence > 0 && a.confidence < 0.4)) continue;
            const key = t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(), now = Date.now();
            if (key === lastKey && now - lastAt < 3000) continue;       // engine repeated/restarted with same text
            lastKey = key; lastAt = now;
            $('parse-source').textContent = 'Heard: ' + t;
            queue = queue.then(() => window.processTranscript(t, true)).catch(() => { });
        }
        $('transcript').value = interim.trim();
    };
    const origErr = handleSpeechError;
    window.handleSpeechError = e => { if (e.error === 'aborted' || e.error === 'no-speech') return; origErr(e); }; // keep listening through silence
    const origStart = startListening;
    window.startListening = function () { const L = state.lang; if (L === 'auto') state.lang = 'hi-IN'; try { origStart(); } finally { state.lang = L; } }; // hi-IN engine handles Hindi + English words
    window.stopListening = function () { state.listening = false; try { state.rec && state.rec.stop(); } catch (e) { } setLoadingState('idle'); }; // never bills half-heard interim text

    document.addEventListener('DOMContentLoaded', () => {
        const sel = $('language'); let saved = {};
        try { saved = JSON.parse(localStorage.getItem('voicebill-prefs') || '{}'); } catch (e) { }
        sel.insertBefore(new Option('Auto (EN / हिन्दी)', 'auto'), sel.firstChild);
        if (!saved.lang) state.lang = 'auto';
        sel.value = state.lang; $('lang-label').textContent = sel.selectedOptions[0].text;
        setLoadingState('idle');
    });
})();