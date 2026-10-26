# Data flow and sharing

Ad Lab binds to 127.0.0.1. It is a local development app, not an authenticated hosted service. It rejects unexpected hosts and cross-origin requests. Do not expose it publicly without adding appropriate authentication and a security review.

## What leaves your computer

- **Bundled simulation:** no provider calls. Artwork and results are fictional local fixtures.
- **Optional demo reference pack:** downloads public thumbnails from cdn.swipefile.com with source links. Its simulated labels and findings remain synthetic.
- **Apify:** receives the selected public library/page URLs and collection settings.
- **Media retrieval:** downloads creative files from restricted Meta/Apify CDN hosts. Signed URLs can contain access parameters.
- **Jev:** receives resized creative images or up to four sampled video frames, plus ad copy, any transcript and supplied notes. Native image assets are uploaded to TypeSafe. Age and outcome metrics are not sent for classification. Brief review sends your draft and brand facts.
- **Fireworks or Groq speech, if enabled:** receives extracted audio.
- **Optional brief writer:** receives ad copy, classifications and your brand facts through your configured chat API.
- **Archived optional provider connector:** only runs if explicitly selected; receives the same kind of creative evidence. It is not required for Jev.

Provider retention, access and billing policies apply. Image preparation happens locally with FFmpeg; no local OCR engine or language-model download is used.

## Files and exports

Keys stay in your ignored `.env`, never browser JavaScript. Uploads, prepared frames, transcripts, current batch and classification caches live in ignored `data/`. `data/run.json` stores the latest batch. Export before replacing it.

Exports omit local file paths and signed media URLs, but include text, labels, original source links, briefs and brand facts. Review them before sharing. Do not include credentials or private customer data.

Delete `data/` while the server is stopped to remove local batches and caches. This does not remove data already submitted to providers. Third-party creative material remains the property of its owners; the code license does not grant rights to republish it.
