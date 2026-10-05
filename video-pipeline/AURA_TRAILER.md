# AU-RA FP · investor trailer, v7 («Introducing AU-RA FP»), English and Spanish

**Format:** 9:16, 1080×1920, 30 fps, 63 s, English.

**Direction:**
- One voice only: AURA's English voice (`NPil3puXYP3J45yudmVD`). The system talks; there is no outside narrator.
- Claudio and ANT-ONIO don't speak. They appear as the app's real 3D models (GLB).
- References:
  - Apple «Introducing Apple Creator Studio»: black background, glossy 3D icons in a carousel, big titles.
  - «Introducing Muse»: a grid of everyday 3D objects.
- Everything is built in code (three.js + HTML/CSS) and rendered frame by frame. That includes the logo, the text, the interface, the 3D gold, the glass «A» and the carousel. The AI made only one image: the sheet of objects (20 objects, no text).
- Real gold in 3D (PBR metal in a product studio), replacing the photo that was rejected.

## Script

| s | Image | AURA (VO) |
|---|---|---|
| 0–6 | Black. A cyan dot lights up; the glass «A» forms around it. «Introducing» → **AU-RA FP** | — |
| 6–11 | Grid of 20 objects from daily life (clock, calendar, cake, gift, mail, card, wallet…). They all fall into the dot | «Your day is full of little things.» |
| 11–15 | The orb is born from the dot as particles and writes **Hi.** | «Hi, I'm AURA.» |
| 15–25 | The orb rises; Claudio (`saludar`) and ANT-ONIO (`celebrar`) come in from the sides. «One mind. Three ways to help.» | «One mind, three ways to help. Claudio creates. ANT-ONIO gets it done. And I take care of you.» |
| 25–35 | Phone montage: 6:00 call **Calls.** · agenda with Mom's birthday **Remembers.** · inbox sorted into piles **Organizes.** · Claudio's 3 posts **Creates.** · AURA's live cloud computer comparing suppliers, ending in **Payment ready · Accept & sign** **Works.** | «I wake you up, I remember what matters, I clear your inbox, I write your next post, and I work on my own computer.» |
| 35–46 | «Send 110 ORIGEN to Mom» → send sheet in Veta Wallet → formula **110 × 1/55 g = 2 g of gold** → hero shot of the 3D gold bar → **✓ Signed** → «Verified on the Orden Global chain» → Visa card turns, balance in ORIGEN, **Freeze card** (the card frosts over) | «Every ORIGEN is gold. I prepare it, you sign it. Always. And your Visa card lives right here.» |
| 46–50 | The phone leaves; the laptop arrives; the **notch** opens with «Your day» (Calendar/Outlook, WhatsApp, Spotify) | «From your phone to your desktop.» |
| 50–56 | Ring carousel of the ecosystem (Veta Wallet, Visa, PULSE2CHAT, Calendar, Mail, ORIGEN, AUKA, AGKA, ONDK). Each one comes to the front on its word | «Your wallet, your card, your chats, your day… all in one place.» |
| 56–63 | Everything collapses into the dot; the glass «A» returns. **AU-RA FP · POWERED BY ORDEN GLOBAL** | «AURA FP.» |

**Guardrails kept:**
- AURA never pays or buys on its own: it prepares, and you sign.
- No iPhone, NFC/Google Wallet, or official WhatsApp claims.
- Data is fictional.
- No competitors named.

## Production

- `aura/trailer.html`: the whole piece, driven by `window.setT(t)`. `aura/tiempos.json` holds each moment's seconds, aligned to the words of the voice (checked with faster-whisper).
- `aura/render.py DESDE HASTA DIR`: Playwright + swiftshader, 3 processes in parallel.
- `aura/mezcla6.py`: voice + music (`musica_b`, the drop lands at the start of the montage) + SFX, with sidechain, at −14 LUFS.
- Cost of v6: music ≈ 0.5 USD, sheet of objects ≈ 0.6 USD, voice included in the plan.

## v7 (October 4): current avatars and ElevenLabs shots

- **Claudio and ANT-ONIO as they look today in the app:** the videos in `mobile/assets/avatares/video/*.mp4` (`CuerpoElegido` prefers video over 3D). The old GLB models no longer appear.
- **9 cinematic shots** (ElevenLabs):
  - Keyframes with gpt-image-2, using frames from the current videos as references.
  - Animated with MiniMax H3 Max.
  - Shots: C3 (both with the orb), C1 (Claudio), C2 (ANT-ONIO), C4 (6:00 call), C5 (ANT-ONIO sorts mail), C6 (Claudio's posts), C7 (gold), C8 (phone to laptop), C9 (farewell).
- **Code** handles the glass «A», the grid, the orb, the app interface (call, agenda, live computer, sending ORIGEN, Visa card, notch), the carousel and the logo.
- **Two versions.** Same visuals; the text and voice change.
  - `tiempos_en.json`: voice `NPil3puXYP3J45yudmVD`.
  - `tiempos_es.json`: AURA's Spanish voice from the app, `AoT6sxPBYB0OGpSnIiwc`.
  - The UI text uses the app's real Spanish labels.
- `montar7.py` derives every scene time from the words of each voice. `mezcla7.py en|es` does the mix.
- **Cost of v7:** keyframes ≈ 2.4 USD (including one discarded run in 16:9), 9 shots × 0.40 = 3.6 USD. The voice is included in the plan.

## v8 (October 5): conversation, memory, chat and the new send flow

The English version comes first; the Spanish one follows once this is approved. Total length is 82 s.

**Corrections and new scenes:**
- **ORIGEN:** the narration now says «pegged to the price of gold», and the screen shows «Price referenced to gold». The gold bar and the grams formula are gone.
- **Natural conversation after the «Hi»:** the user's words appear on screen; AURA answers with a laugh (shown with an «♪ [laughs softly]» chip). The narration says «I think with my own brain. I remember what matters to you…», and chips show what it remembers about you, with the note that you can see, edit or delete anything.
- **PULSE2CHAT:** AURA writes the draft (highlighted in gold, as in the app) and sends it after «Yes, send».
- **Sending ORIGEN:** you speak the request, then Veta Wallet shows the bottom sheet, you sign with your fingerprint (an animated ring), and the receipt is verified on the chain.
- **Reminders:** the phone shows «Reminders» instead of a calendar, because the mobile app has no calendar integration.

**Pending:** the official PULSE2CHAT logo, which isn't in any of the repos.
