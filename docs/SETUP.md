# Set up Ad Lab

## 1. Install and open the demo

Use Node.js 22.9 or newer. Download the ZIP from GitHub or clone:

```sh
git clone https://github.com/artemnovitckii/ad-pattern-lab.git
cd ad-pattern-lab
npm ci
npm run setup
npm start
```

Open http://127.0.0.1:5194. The demo needs no keys. Keep the terminal open; Ctrl+C stops the server. `npm run setup` creates `.env` without replacing an existing file.

For image/video analysis, install FFmpeg, including ffprobe:

```sh
# Mac with Homebrew
brew install ffmpeg
```

```powershell
# Windows PowerShell with WinGet
winget install --id Gyan.FFmpeg --exact
```

```sh
# Ubuntu / Debian
sudo apt update
sudo apt install ffmpeg
```

Reopen the terminal after installation. Alternatively use the builds linked by [FFmpeg](https://ffmpeg.org/download.html).

## 2. Add your Jev key

Create an API key in your [TypeSafe account](https://typesafe.ai/). Open `.env` in a text editor:

```dotenv
ANALYSIS_PROVIDER=jev
TYPESAFE_API_KEY=your_typesafe_key
JEV_MODEL=jev-latest
PORT=5194
```

Save, restart, and run `npm run doctor`. It reports key presence, not verified access, and never prints the keys. Never commit `.env` or share it with your project ZIP.

Jev receives native image assets through `POST /v1/systemone`. Its image feature is experimental and uses the `TypeSafe-Danger-Zone-Images: true` header, which the app sets automatically. FFmpeg rotates/converts media to standard JPEG, limits the longest side to 1280 pixels and pads smaller sides to at least 280 pixels. Up to four images share one state and seven classification questions. No local OCR engine is installed or run. [Official image API documentation](https://docs.typesafe.ai/images).

## 3. Try 5 to 10 ads

Choose **Import ads**. You can:

- Paste ad copy for text-only classification.
- Upload a JPEG, PNG or WebP image, or a video up to 10 minutes.
- Import JSON in the format below. [sample-ads.json](../examples/sample-ads.json) contains fictional examples.

```json
[
  {
    "id": "your-ad-id",
    "brand": "Your brand",
    "text": "The actual ad copy",
    "headline": "An optional headline",
    "url": "https://www.facebook.com/ads/library/?id=YOUR_AD_ID",
    "imageUrl": "https://your-allowed-meta-cdn/creative.jpg",
    "kind": "image",
    "active": true,
    "startDate": "2026-09-01",
    "collectedAt": "2026-10-27T00:00:00Z",
    "transcript": "Optional actual speech transcript",
    "visualNotes": "Optional factual notes"
  }
]
```

For JSON media, use actual Meta or Apify CDN URLs accepted by the app, or upload the file. The placeholder URL above illustrates the field; it is not a downloadable example. File uploads append. JSON and pasted-copy imports replace the current local batch, so export first.

Press **Analyze / retry unfinished**. Open a few completed ads and compare their saved image frames, seven labels and source text against the originals. Errors stay visible and unfinished work can be resumed. Cached matching images, text, schema and model reuse the saved result. Changing the image pixels invalidates its classification cache.

## 4. Optional speech transcription

Jev analyses images and text. It does not accept raw audio or watch the whole video. Video evidence contains up to four sampled frames, including the opening. Add speech transcription if the spoken message matters.

Choose one provider:

```dotenv
TRANSCRIPTION_PROVIDER=fireworks
FIREWORKS_API_KEY=your_fireworks_key
```

or:

```dotenv
TRANSCRIPTION_PROVIDER=groq
GROQ_API_KEY=your_groq_key
```

Create keys in [Fireworks](https://app.fireworks.ai/) or [Groq Console](https://console.groq.com/keys). Confirm speech access and quota. FFmpeg extracts mono 16 kHz FLAC, limited to 25 MB. Fireworks uses `whisper-v3-turbo`; Groq uses `whisper-large-v3-turbo`. Supplied transcripts are reused. If speech is unavailable, the app records a warning and still uses the frames and copy. Set `TRANSCRIPTION_PROVIDER=none` to skip speech explicitly.

## 5. Optional Meta collection with Apify

Add `APIFY_TOKEN` from [Apify Console](https://console.apify.com/) to `.env` and restart. The connector uses [curious_coder/facebook-ads-library-scraper](https://apify.com/curious_coder/facebook-ads-library-scraper).

Choose **Meta collection**, enter the public Meta Ad Library URL or Facebook page URL, request a small count and set an Apify dollar cap. Start with 10 ads and a small cap that you are comfortable spending. Confirm the Actor's current pricing before launching.

Collection is a paid external run. The cap applies only to Apify, not Jev, transcription or the brief writer. It may stop before the requested count. Availability, country, filters and public library coverage affect results; a requested count is not proof you collected an entire market or account.

If the launch reply is lost, find the run ID in Apify Console and **attach the existing run**. Do not launch a duplicate. Signed media URLs can expire; fresh collection or manual uploads may be needed. Actor output changes can require normalization updates in `lib/data.mjs`.

## 6. Find a pattern and inspect the examples

Use Format and Hook together. Compare the group's dated active sample with the rest of your collected batch. The 60+ day share is descriptive age in an active snapshot, not survival probability or ad profitability.

Open **Explore examples** in a finding. Browse all matching ads, sort by age, and inspect individual breakdowns and original links. The creative landscape groups label similarities; the alternate map shows observed age and family size. Nearby cards are not necessarily better ads.

Check several distinct creative families and weaker examples before writing a new test. Use the structure with your own facts, product and evidence.

## 7. Optional original brief writer

Supply your product, audience and verified claims in the app. Without a writer, the app creates editable outlines. To generate prose drafts, configure an OpenAI-compatible chat endpoint:

```dotenv
LLM_BASE_URL=https://api.fireworks.ai/inference/v1
LLM_API_KEY=your_writer_key
LLM_MODEL=your_available_chat_model
```

Jev reviews clarity, brand fit and claim support. Scores are model judgments, not predicted ROAS or sales. Writer and review calls have separate costs.

## Recording and your own demo images

The main dashboard can replay saved results without rerunning providers. The simulation at `/variations.html` uses fictional fixture results. Neither playback timer is a live API benchmark.

### Use hundreds or thousands of your own demo images

```sh
npm run demo:images -- /absolute/path/to/images
```

Requires FFmpeg. The script compresses and deduplicates local thumbnails. Or run `npm run demo:download` for curated public marketing examples with source links. These files stay local. Replacing images does not convert synthetic labels, dates, graph positions or scores into real findings. See [RECORDING.md](RECORDING.md) and [IMAGE-SOURCES.md](IMAGE-SOURCES.md).

## Troubleshooting

- **Missing key / 401 / 403:** check the spelling in `.env`, provider access and billing, then restart. Use `.env`, not `.env.txt`.
- **429 or 529:** check quota/capacity, wait and resume unfinished work. Reduce `ANALYSIS_CONCURRENCY` (1 to 6). Paid Jev requests are not silently retried after a lost response.
- **Image rejected:** retry extraction, confirm FFmpeg works and use a valid image. TypeSafe's image feature is experimental; check its current limits/status.
- **A label is unknown:** inspect the evidence. Four video frames can miss key action. Add an actual transcript or factual notes rather than forcing a label.
- **No media available:** public CDN URLs can expire. Upload the creative or collect fresh accessible media.
- **No briefs:** supply your brand facts and request outlines/drafts. Research findings and brief generation are separate actions.
- **Port busy:** stop your previous server or change `PORT` in `.env` and use that URL.

`data/run.json` saves the current batch. Keys, data and provider caches are ignored by Git. Exports omit local file paths and signed media URLs, but include ad copy, labels, briefs, source links and brand facts. Read [PRIVACY.md](PRIVACY.md) before sharing.
