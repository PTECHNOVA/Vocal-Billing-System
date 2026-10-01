# Vocal Billing System – Speak. Calculate. Bill.

A browser-based voice billing assistant for shops. Say what the customer bought, and the items appear in the Current Bill with totals, tax and discount. Works in English, Hindi, Hinglish and mixed speech. Bills can be printed or saved as PDF.

---

## 1. Project structure

```
voicebill/
├── index.html      Page layout, styles, buttons, invoice and settings dialogs
├── script.js       Core app: bill state, calculations, parser, AI call, invoice, PDF
├── voice-auto.js   Voice add-on: auto-add, continuous mic, Hindi/Hinglish, voice remove
└── README.md       This file
```

### Load order (important)

At the bottom of `index.html` the scripts must be in this order:

```html
<script src="script.js"></script>
<script src="voice-auto.js"></script>
```

`voice-auto.js` does **not** work alone. It extends functions defined in `script.js` (`state`, `addItem`, `removeItem`, `processTranscript`, `parseWithFallback` and others), so it must load after it. Do not replace `script.js` with `voice-auto.js`.

---

## 2. How to run

1. Put the three files in one folder.
2. Open the folder with a local server, or open `index.html` directly in **Chrome or Edge**. Voice input needs a browser that supports the Web Speech API.
3. Allow microphone access when asked.

Notes:
- Microphone permission is most reliable on `https://` or `http://localhost`. If the mic does not work from a `file://` address, run a local server in the folder, for example `python -m http.server 8000`, then open `http://localhost:8000`.
- Tailwind CSS and jsPDF load from a CDN, so an internet connection is needed for styling and PDF download.
- Voice recognition in Chrome sends audio to the browser vendor's speech service, so it also needs internet.

---

## 3. File guide

### `index.html`
- Layout: header (business type, language, settings), the voice panel on the left and the Current Bill on the right.
- Styles for the mic button, the bill table (responsive, becomes cards on phones), invoice print rules.
- Dialogs: invoice preview (Print / Download PDF) and Settings (shop name, address, GSTIN, customer details, dark mode).

### `script.js` (core, unchanged by the voice add-on)
- **State and bill:** `state.items` holds the bill. `addItem`, `updateItem`, `removeItem`, `clearBill` change it; `renderBillItems` and `renderBillSummary` redraw it.
- **Calculations:** `calculateItemTotal` and `calculateBillTotals` handle quantity × price, item discount, tax (per item or default), bill discount (% or ₹) and round-off.
- **Speech:** `initializeSpeechRecognition`, `startListening`, `stopListening`, `handleSpeechResult`, `handleSpeechError`.
- **Parsing:** `parseWithFallback` is the built-in regex parser (no internet or key needed). `parseWithAI` is an optional Gemini call. `validateParsedData` cleans either result.
- **Invoice:** `generateBill`, `printBill`, `downloadPDF`.
- **Manual flow:** the **Add to Bill** button and **+ Add item** still work as before.

### `voice-auto.js` (add-on)
Overrides or wraps the voice-related functions of `script.js` without editing that file:

| Feature | How it works |
|---|---|
| Auto-add | Each final speech result goes through the existing parser and is added to the bill without clicking Add to Bill |
| Continuous mic | Mic stays on after each item; silence and `aborted` / `no-speech` events do not stop it |
| Duplicate protection | Only final results are billed; each result object is processed once; identical text within 3 seconds is ignored |
| Hindi / Hinglish numbers | Extends the number and unit tables; `ek sau bees` = 120, `डेढ़ सौ` = 150, `aadha` = 0.5 |
| Remove commands | Detected before add parsing, then call the existing `removeItem()` |
| Noise filtering | Ignores low-confidence results, very short text, filler words and any speech without a quantity and price |
| Language | Adds an **Auto (EN / हिन्दी)** option, now the default for new users |

---

## 4. Using voice billing

Tap the microphone once, then speak one item at a time and pause. Each item is added automatically.

### Adding items

| Language | Example |
|---|---|
| English | `1 kg sugar 100` |
| Hindi | `एक किलो चीनी सौ रुपये` |
| Hindi | `दो किलो चावल एक सौ बीस रुपये` |
| Hinglish | `ek kilo cheeni 100` |
| Mixed | `ek kg sugar 100 rupaye` |
| Several at once | `1 kg sugar 100, 2 kg rice 120` |

Quantity words supported include एक, दो, तीन … दस, आधा, पौना, डेढ़, ढाई and their Hinglish spellings. Units include kg, kilo, gram, litre, ml, meter, pcs, किलो, ग्राम, लीटर, मीटर, पीस, नग.

### Removing items

| Type | Example |
|---|---|
| By number | `remove item 2`, `delete number 2`, `item 2 hatao`, `दूसरा आइटम हटाओ` |
| By name | `remove sugar`, `rice hatao`, `cheeni hatao`, `चीनी हटाओ`, `salt remove karo` |

If more than one bill item matches a name, nothing is deleted and you are asked to say the item number instead.

### Pricing rules to know
- Price is treated **per unit**: `2 kg rice 120` = 2 × 120 = ₹240 (this is the original app behaviour).
- For **gram and ml**, the price is treated as the price of that pack: `500 gram salt 30` becomes `salt 500 g`, quantity 1, ₹30.
- Voice items are added only when quantity and price are both understood. `sugar 100` is added as quantity 1 and marked **Please confirm**.
- The bill table has no unit column, so units such as kg are not displayed.

---

## 5. Optional AI parsing

AI parsing is off in practice until you add a key. In `script.js`:

```js
const CONFIG = {
    AI_ENABLED: true,
    AI_API_URL: '...',
    AI_API_KEY: '',     // empty = built-in parser is used
    AI_MODEL: '...'
};
```

- With an empty key the app uses the built-in parser and shows "Basic parser (no AI)".
- Any key written in `script.js` is visible to everyone who opens the page. Use it for testing only. For production, call the AI through your own server.
- If the AI call fails, the app falls back to the built-in parser automatically.

---

## 6. Settings and bill output

- **Settings:** shop name, address, GSTIN, customer name and phone, dark mode. These print on the bill.
- **Generate bill:** checks that every item has a name, quantity and price, then opens the invoice preview.
- **Print / Download PDF:** the PDF uses "Rs." instead of ₹ because built-in PDF fonts lack that symbol.
- Preferences (business type, language, dark mode) are saved in the browser's local storage.

---

## 7. Troubleshooting

| Problem | What to try |
|---|---|
| Mic button does nothing | Use Chrome or Edge; allow microphone permission; serve from `localhost` or `https` |
| "Speech recognition is not supported" | The browser lacks the Web Speech API; use Chrome/Edge or enter items manually |
| Item not added | It probably lacked a quantity or price; say it fully, for example `2 kg rice 120` |
| Wrong Hindi word recognised | Check the Transcript box or Current Bill and correct the row by hand |
| Page unstyled or no PDF | Internet needed for the Tailwind and jsPDF CDNs |
| Nothing happens after adding the script | Confirm `voice-auto.js` loads **after** `script.js` and the file name matches |

---

## 8. Limitations

- Background noise can be eliminated. The add-on filters unreliable results but does not clean the audio.
- If the engine splits one item into two fragments (for example `1 kg sugar` then `100`), neither fragment is added.
- Hindi item names stay as spoken (for example चीनी); they are not translated to English.
- Voice add-on status: syntax-checked only. Microphone behaviour and real noisy-environment performance have **not** been tested; please test the examples in section 4 before using it with customers.

---

## 9. Safety checklist after changes

- [ ] Manual **Add to Bill** and **+ Add item** work
- [ ] Totals, tax, discount and round-off match your expectation
- [ ] Voice: one spoken item gives one bill row
- [ ] Voice: `remove item 2` and `cheeni hatao` remove the correct row
- [ ] Generate bill, Print and PDF work