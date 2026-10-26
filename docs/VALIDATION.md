# Verification record

## Native Jev image integration

Checked for this release:

- The real TypeSafe image endpoint accepted one prepared image from the saved ad archive with copy and seven typed questions.
- The response identified `jev-1.14.0` and returned seven classifications, 5,721 input tokens and an estimated input charge of $0.000240282 at $0.042 per million tokens. Local request elapsed time was 911 ms. This is one request, not an average or full-pipeline speed/cost estimate. Provider billing is authoritative.
- The app sends multipart image assets with the documented opt-in header. No local OCR engine or separate OCR pass is installed.
- Actual FFmpeg preparation is tested on a small image and a video. Frames meet the minimum 280-pixel side requirement; image conversion also handles even JPEG dimensions.
- Tests cover image references, seven typed answers, omission of age/outcomes, in-flight request sharing, cache invalidation when pixels change, unknown token usage, and no automatic retry after an uncertain paid response.
- Pipeline tests cover persistence, public frame URLs, sanitized exports, explicit provider switching, preserved historical costs, and saved-result reuse.
- Findings, example browsing, copy breakdowns, thumbnail layouts and replay timing have automated coverage.

## Evidence boundaries

The complete 1,214-record historical Hormozi archive has not been reanalysed with the new native Jev image integration. Its earlier labels and original provider/cost metadata remain preserved. The published visual is saved archive playback, not a live native Jev benchmark.

The live check above covers one image request. A newly paid Apify collection, new speech transcription and paid brief writing were not rerun for this release. Those are separate optional services with separate billing and access requirements.

The no-key demo and recording variants use synthetic fixtures. Fictional dates, costs, scores and labels are not measurements about the public inspiration images you may add locally.

## Run locally

```sh
npm run check
npm test
npm run doctor
```

Doctor checks key presence and executable availability without printing secrets or making paid requests. It does not verify provider access. Start real research with a small batch and inspect the originals, labels, evidence and billing before scaling up.
