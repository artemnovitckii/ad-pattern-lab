# Data flow and sharing

The server binds to 127.0.0.1. This is a local development app, not an authenticated hosted service. It rejects unexpected hosts and cross-origin requests. Do not publish the server or bind it to a public interface without a separate security review.

## What leaves the computer

- **Simulation:** no API calls, analytics or remote image assets. It uses bundled fictional data.
- **Optional demo image pack:** downloads public thumbnails from cdn.swipefile.com, with no API key. Their original source links are retained; dates, labels and scores shown in Simulation mode remain illustrative.
- **OCR:** Tesseract.js processes images locally. First use fetches an English language model; subsequent use uses a local cache.
- **Apify:** receives selected public library/page URLs and the collection configuration.
- **Media retrieval:** downloads from restricted Meta/Apify CDN hosts; signed URLs may contain source access parameters.
- **Fireworks or Groq speech:** receives extracted audio when that stage is enabled.
- **Jev:** receives ad copy, OCR, transcripts and supplied visual notes, or your brief and brand facts for review.
- **Optional writer:** receives ad copy, labels and brand facts through your configured provider.

Provider retention and billing policies apply. The app does not guarantee how external providers retain submitted content.

## What stays in files

Keys live in `.env`, never browser JavaScript. Runtime data, uploads, transcripts, OCR and classification caches live in `data/`. Both are Git-ignored. The latest batch is saved as `data/run.json`. Export before replacing it. Delete the data folder while the server is stopped to remove local batches and caches; this does not delete provider-side data.

Exports deliberately omit local file paths and signed media URLs, but include ad text, labels, original source links, generated briefs and your brand facts. Review exports before sharing. Do not include private customer information, credentials or material you cannot use.

The bundled atlas in `public/assets/demo-creatives.jpg` is AI-generated illustrative artwork. Demo brands, ages, labels, counts and scores are fictional, not endorsements or measured campaign results.
