# Record the light-mode demo

This is a visual simulation. It makes no Jev, Apify, speech, or writer requests. Imported and collected ads use the separate analysis app.

## Start

```sh
npm ci
npm run setup
npm start
```

Open:

```text
http://127.0.0.1:5194/variations.html?variant=reference&clean=1&duration=20
```

The default recording uses a light background, blue accents, a Meta Ads header, and a wide three-column composition.

- **R:** restart from zero.
- **Space:** pause or resume.
- **C:** show or hide controls.
- In the controls, choose **20, 40, or 80 seconds** and scrub the timeline.
- **Download preview** downloads the included 20-second MP4; it does not render your current image pool or duration. Screen-record playback to capture your own version.
- The other three variations also support portrait framing.

Each thumbnail crossing the scan line adds one to the processed counter and one point to the map. The scan rate is crossings in the preceding second. Three illustrative judgments are counted per processed tile; illustrative cost follows that same count. The pattern strips scroll independently, and their multiples and bars vary. Brief cards arrive as their count increases. These displayed metrics are synthetic, not API measurements or real ad outcomes.

## Add image variety

The no-key starter includes 16 generated creative examples. A full external image cache is not shipped in the repository.

Install FFmpeg, then download public reference thumbnails:

```sh
npm run demo:download -- 100
```

Omit `-- 100` to try the entire included gallery URL list. Availability can change. This downloads inspiration images from Swipefile, not a verified current Meta campaign dataset. It makes no paid API calls.

Or import your own folder:

```sh
npm run demo:images -- /absolute/path/to/your/images
```

Reload the preview when the import finishes. Images and source links stay in ignored `data/`. Keep source attribution. One image file is not necessarily one unique ad: carousels can contain several files.

## Get actual analysis

Open http://127.0.0.1:5194 and choose **Import ads**. Start with five ads you can inspect, add your own Jev key, and run classification. Optional Apify collection, speech transcription, and brief writing require their own configurations. See [SETUP.md](SETUP.md) and the [verification record](VALIDATION.md).
