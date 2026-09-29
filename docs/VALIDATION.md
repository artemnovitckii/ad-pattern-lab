# Verification record

Version 0.1.0, September 30, 2026. This is a local beta.

## Actually checked

- Dependency installation with the committed lockfile; npm audit reported zero vulnerabilities at installation.
- JavaScript syntax checks.
- Nine automated tests covering normalization, exact fingerprints, unknown dates, active/dated denominators, classification evidence boundaries, response validation, URL restrictions, no retry on an uncertain paid launch, Jev caching with a mock response, and explicit outline fallback.
- Actual Tesseract.js English OCR on a generated PNG reading “NOTEBOOKS FOR YOUR NEXT IDEA / SHOP THE TWO PACK.” This proves the local OCR path works on clear text, not its accuracy on every ad.
- Chromium checks of simultaneous demo progress, pause, pattern filtering, source dialog, desktop/portrait/mobile layouts and no horizontal overflow at 390 px.
- No-key text import and classification failure with retained evidence.
- Script-like source copy renders as text; a cross-origin write is rejected.
- Verified the public image-pack command on five cached images with no paid calls and no duplicate files added.
- Imported and compressed 2,136 distinct public creative image files locally (336 Meta images and 1,800 additional gallery images after exact-file deduplication). Multiple images can come from one ad.
- A recording of the actual demo UI is included in `docs/demo.mp4`.

## Implemented, not verified with paid live calls

- Apify Actor launch, polling, dataset import and attaching an existing run.
- Jev live classification and brief scoring. Request shape and response parsing follow the provider's documented API; tests use mocked responses.
- Fireworks / Groq speech transcription.
- Optional OpenAI-compatible brief writing.
- An end-to-end paid run combining these providers.

Do not interpret a configured key, passing test or successful app installation as a successful real provider run. Start with five imported ads; inspect the evidence and labels. Then try a small collection and check actual billing.

## Known limits

- One saved local batch. Imports replace it; export first.
- English-only OCR, four sampled frames per video, no automatic visual reasoning model.
- Family grouping is exact evidence fingerprinting, not perceptual or semantic deduplication.
- An active snapshot cannot measure survival probability or profitability.
- Demo analysis is synthetic, even when using real public artwork. It is not a benchmark or marketing case study.
- Jev cost display estimates only known returned token usage, excluding other stages and lost responses.
