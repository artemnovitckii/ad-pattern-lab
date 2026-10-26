import test from "node:test";
import assert from "node:assert/strict";
import { replayDuration, replayFrame, revealedLabels, visualFrame } from "../public/replay.mjs";

test("close-up reveals visual frames and all labels before its ad is counted or plotted", () => {
  assert.equal(replayDuration(1214, "close"), 1942.4);
  const early = replayFrame(1214, .2, "close");
  assert.equal(early.completed, 0);
  assert.equal(early.active, 0);
  assert.equal(revealedLabels(early.phase, 7), 0);
  assert.equal(visualFrame(early.phase, 4), 1);
  const labelled = replayFrame(1214, 1.4, "close");
  assert.equal(labelled.completed, 0);
  assert.equal(revealedLabels(labelled.phase, 7), 7);
  assert.equal(visualFrame(labelled.phase, 4), 3);
  assert.deepEqual(replayFrame(1214, 1.6, "close"), {
    duration: 1942.4, completed: 1, active: 1, phase: 0,
  });
});

test("each timelapse completion is shared by the wall, count and plot, including the last ad", () => {
  for (const seconds of [20, 40, 80]) {
    for (let i = 1; i <= 1214; i++) {
      const boundary = seconds * i / 1214;
      assert.equal(replayFrame(1214, boundary - .000001, "timelapse", seconds).completed, i - 1);
      assert.equal(replayFrame(1214, boundary, "timelapse", seconds).completed, i);
    }
    assert.deepEqual(replayFrame(1214, seconds + 5, "timelapse", seconds), {
      duration: seconds, completed: 1214, active: null, phase: 1,
    });
  }
});

test("replay is stable at a paused timestamp and handles empty or negative time", () => {
  const paused = replayFrame(1214, 12.345, "timelapse", 40);
  assert.deepEqual(replayFrame(1214, 12.345, "timelapse", 40), paused);
  assert.deepEqual(replayFrame(0, 500), { duration: 0, completed: 0, active: null, phase: 1 });
  assert.equal(replayFrame(1214, -5).completed, 0);
  assert.equal(visualFrame(1, 0), 0);
  assert.equal(revealedLabels(0, 7), 0);
  assert.equal(revealedLabels(1, 7), 7);
});
