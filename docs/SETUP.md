# Full setup

## 1. Run the simulation first

Install Node.js 22.9+ from https://nodejs.org/en/download. Download the GitHub ZIP, extract it, and open a terminal in the folder containing `package.json`. Or clone using the README commands.

```sh
npm ci
npm run setup
npm run doctor
npm start
```

Open http://127.0.0.1:5194. Keep the terminal open. The default Simulation tab works without any keys. `npm run setup` will not overwrite an existing `.env` file. Doctor reports configuration presence, not successful API access.

For the light-mode recording demo, open http://127.0.0.1:5194/variations.html?variant=reference&clean=1&duration=20. Choose 20, 40 or 80 seconds in the controls. Each tile crossing the scan line increments the processed count; this is animation playback, not a provider benchmark. Other variants offer portrait framing. Press C for controls, R to restart, and Space to pause. [Recording guide](RECORDING.md).

## 2. Add only the providers you need

Open `.env` in a text editor. Never share this file. Restart the server after changing it.

| Variable | When needed |
| --- | --- |
| `TYPESAFE_API_KEY` | Classify real imported evidence and review briefs |
| `JEV_MODEL` | Defaults to `jev-1.13.0`; choose an available model from TypeSafe docs |
| `APIFY_TOKEN` | Launch or attach a Meta collection run |
| `TRANSCRIPTION_PROVIDER` | `fireworks` (default) or `groq` |
| `FIREWORKS_API_KEY` | Fireworks speech transcription |
| `GROQ_API_KEY` | Groq speech transcription |
| `LLM_BASE_URL` | Optional HTTPS OpenAI-compatible API base ending in `/v1` |
| `LLM_API_KEY` | Optional brief writer key |
| `LLM_MODEL` | Your provider's exact available writer model ID |
| `PORT` | Defaults to 5194 |

Get a Jev key from [TypeSafe](https://typesafe.ai/), an Apify token from [Apify Console](https://console.apify.com/), and speech access from [Fireworks](https://app.fireworks.ai/) or [Groq](https://console.groq.com/keys). A provider key does not guarantee model access or quota.

The default writer base is `https://api.fireworks.ai/inference/v1`. Copy your Fireworks key into `LLM_API_KEY` and your chosen text model's exact ID into `LLM_MODEL` to enable it. The speech key alone does not enable writing. The selected writer must support chat completions and JSON-object response format. No writer configuration gives editable outlines, clearly labeled in the UI.

## 3. Import a small batch

Start with 5 to 10 ads you can check against originals.

- **Copy:** paste the ad's actual words and advertiser name.
- **JSON:** choose an array or an object with an `ads` array. See `examples/sample-ads.json`.
- **Image:** upload JPEG, PNG or WebP. English OCR runs locally.
- **Video:** upload MP4 or MOV, up to 60 MB and 10 minutes. Install FFmpeg first.

Importing copy or JSON replaces the current batch. Uploads append. Export first if you need the previous batch. Up to 1,000 JSON records are accepted. IDs are deduplicated.

Supported native fields:

```json
{
  "id": "your-source-ad-id",
  "brand": "Advertiser",
  "text": "Actual ad copy",
  "headline": "Actual headline",
  "kind": "image",
  "imageUrl": "https://scontent.example.fbcdn.net/path/to/image.jpg",
  "mediaUrl": "https://scontent.example.fbcdn.net/path/to/image.jpg",
  "transcript": "Optional existing transcript",
  "ocr": "Optional existing OCR",
  "visualNotes": "Optional factual observations of what is visible",
  "url": "https://www.facebook.com/ads/library/?id=REAL_ID",
  "startDate": "2026-07-01T00:00:00Z",
  "collectedAt": "2026-09-29T00:00:00Z",
  "active": true
}
```

The URL above illustrates a field, not a working asset. Omit unknown dates and active status. Do not replace unknowns with zero or invented dates. Remote media downloads are restricted to Meta and Apify CDN hosts. Upload other files directly. Media URLs may expire.

Click **Analyze / retry unfinished**. OCR and provider results are cached. Click any creative for labels, source text and errors. A format can remain unknown when visual notes are missing. Review OCR on small, stylized or low-contrast text. The current worker is English-only.

## 4. Video setup

Mac with Homebrew:

```sh
brew install ffmpeg
```

Windows with WinGet, then reopen PowerShell:

```powershell
winget install --id Gyan.FFmpeg --exact
```

Ubuntu / Debian:

```sh
sudo apt update
sudo apt install ffmpeg
```

Alternative installers: https://ffmpeg.org/download.html. Both `ffmpeg` and `ffprobe` must be on PATH.

Four frames are sampled, not every frame. FFmpeg extracts mono 16 kHz FLAC audio. Fireworks uses `whisper-v3-turbo`; Groq uses `whisper-large-v3-turbo`. Audio is limited to 25 MB. If no speech key is present, the app keeps the sampled OCR and marks speech as skipped. Existing supplied transcripts are reused. Provider access, limits and model availability may change.

## 5. Optional Meta collection

**Status: implemented, not yet verified with a paid live run.** You can use imported records while this remains unverified.

1. Add `APIFY_TOKEN`, restart, and choose **Meta collection**.
2. Paste 1 to 10 public Facebook page or Meta Ad Library URLs.
3. Start with 20 ads and a small Apify spending cap, such as $1.
4. Click **Start paid collection**. This launches `curious_coder/facebook-ads-library-scraper` using your account.
5. Check the Actor run in Apify Console. Inspect returned fields and actual charges.
6. When the records are ready, press **Analyze collected ads** separately. Collection never automatically starts Jev or speech requests.

The cap applies to Apify, not OCR hardware costs, Jev, speech or the writer. A cap may stop the Actor before the requested count. The Actor's `count` is a requested total, not a guarantee of complete market coverage. Actor changes can require adapting `lib/data.mjs`.

If a launch response is lost, **check Apify Console before starting again**. Paste the existing run ID into **Load existing run**. The app does not automatically retry a failed launch request. Polling eventually times out; attach the same run to continue. An existing run import can replace the current ads; export first.

No public Ad Library data here contains your actual CTR, CPA, ROAS, lead quality or conversions. Ad age is a research clue, not proof the ad works.

## 6. Make the research useful

Choose one category and a comparable collection window. Filter a hook, format, angle or offer. Check the sample size, number of families and original ads, including examples that differ from the apparent pattern. Repeated ad IDs do not prove multiple independent experiments.

Open **Your product → original briefs**. Add the audience, actual offer and facts you can support. The app drafts up to six briefs from distinct classified families, or creates outlines without a writer. Jev reviews clarity, fit and claim support. Scores are rubric judgments scaled to 0–100, not the probability of success. Confirm every claim and make your own creative before testing.

## 7. Recovery and costs

- **No key:** extraction/import can still save evidence; add the missing key, restart and retry unfinished work.
- **401 / 403:** check provider credentials and model permissions. Errors do not print your key.
- **429 / 5xx:** bounded retries back off. Check quota; retry only unfinished records.
- **No readable words:** supply copy or a transcript. OCR is not a visual reasoning model.
- **Video inspection failed:** check FFmpeg and file validity.
- **Media unavailable:** signed source URLs may have expired. Refresh collection or upload the file.
- **Interrupted server:** local state is saved after processing each record. Restart and choose Analyze / retry unfinished. In-flight provider work can have been charged even if its response was lost.
- **Only one saved batch:** export before importing another. This version is not a multi-project archive.
- **Port busy:** change `PORT` in `.env`, restart and open the new port.

Tesseract.js has no per-image API fee; it consumes local compute. The app estimates known Jev input-token cost at $0.042 per million tokens, based on TypeSafe's published price when implemented. Cached calls show no new Jev cost. This estimate excludes failed or lost responses and every other provider. Use billing dashboards as the authority; there is no total end-to-end cost meter.

## Ask your coding assistant to help

> Set up this repository locally. Read README.md, docs/SETUP.md and docs/PRIVACY.md first. Run the no-key simulation, doctor, syntax checks and tests. Do not read or print secret values. Ask me to add keys to my local .env only when needed. Start with a five-ad import and tell me which parts were actually verified. Do not launch paid collection without my instruction.

## References

- [TypeSafe API](https://docs.typesafe.ai/api) and [models/pricing](https://docs.typesafe.ai/models)
- [Apify Actor and input schema](https://apify.com/curious_coder/facebook-ads-library-scraper/input-schema)
- [Tesseract.js](https://github.com/naptha/tesseract.js)
- [Groq speech documentation](https://console.groq.com/docs/speech-to-text)
- [Fireworks documentation](https://docs.fireworks.ai/)

## Use hundreds or thousands of your own demo images

The public starter includes 16 generated fictional creatives. You can replace that image pool with a local folder of real creative images. This only changes the visual simulation; it does not classify the images or validate its synthetic results.

Install FFmpeg. For the included public-gallery URL list, run:

```sh
npm run demo:download
```

This retrieves small public reference thumbnails from Swipefile with source-page links. It does not scrape Meta, use Apify, or call Jev. The examples span digital, print and other marketing formats; they are not verified current Meta campaigns. Unavailable URLs are skipped. Use `npm run demo:download -- 100` for a smaller pack.

Or bring your own local image folder:

```sh
npm run demo:images -- /path/to/your/image-folder
```

The command builds compressed thumbnails under `data/demo-images/`, removes exact file duplicates, and writes `data/demo-library.json`. Reload the app. The library count reflects unique image files. In Reference / Light, the processed counter counts tiles that actually cross the scan edge during playback, so a 20-second clip does not claim to scan the entire library. Only the current window of cards is rendered; the entire library is not loaded as full-size image elements.

For source attribution, the command also accepts a JSON array of local files:

```json
[
  {
    "path": "/absolute/path/to/ad-image.jpg",
    "brand": "Advertiser name",
    "sourceUrl": "https://www.facebook.com/ads/library/?id=ACTUAL_ID",
    "text": "Optional source description"
  }
]
```

```sh
npm run demo:images -- your-image-manifest.json
```

Keep images and source records in your ignored `data/` folder. These third-party assets are not covered by this project's code license and are not bundled in the public starter. An image pack can include multiple images from the same carousel ad. Image counts are not ad counts. The simulation badge remains visible; its labels, dates, graph positions, timing and brief scores are illustrative, not Jev results. To get real labels, use **Import ads** and the actual analysis workflow instead.
