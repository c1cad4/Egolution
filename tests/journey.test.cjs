const test = require("node:test"),
  assert = require("node:assert/strict");
test("all seven stages are reachable, adaptations stack, a new universe retains discovery history", async () => {
  const { Journey, COSTS } = await import("../public/model.mjs");
  const j = new Journey(null, () => 0.5);
  for (let stage = 0; stage < 6; stage++) {
    assert.equal(j.save.stage, stage);
    j.resources = Array.from({ length: COSTS[stage] }, () => ({
      x: j.x,
      y: j.y,
    }));
    j.hazards = [];
    j.step(0.016, 0, 0);
    assert.equal(j.ready, true);
    assert.equal(j.evolve("paid"), false);
    assert.equal(j.evolve(["speed", "shield", "magnet"][stage % 3]), true);
    assert.equal(j.evolve("speed"), false);
  }
  assert.equal(j.counts("speed"), 2);
  assert.equal(j.rebirth(), false);
  j.resources = Array.from({ length: COSTS[6] }, () => ({ x: j.x, y: j.y }));
  j.step(0.016, 0, 0);
  assert.equal(j.rebirth(), true);
  assert.equal(j.save.cycles, 1);
  assert.equal(j.save.stage, 0);
  assert.ok(j.save.total > 200);
});
test("corrupt saves cannot skip bounds or inject arbitrary traits", async () => {
  const { restore } = await import("../public/model.mjs");
  assert.equal(restore("{").stage, 0);
  const s = restore({
    version: 1,
    stage: 99,
    energy: Infinity,
    cycles: -7,
    traits: ["script", "speed", "shield"],
    total: NaN,
  });
  assert.equal(s.stage, 6);
  assert.equal(s.energy, 0);
  assert.equal(s.cycles, 0);
  assert.deepEqual(s.traits, ["shield", "speed", "shield"]);
  assert.equal(s.total, 0);
});
test("hazards have a cooldown, diagonal motion is normalized and delta spikes are clamped", async () => {
  const { Journey } = await import("../public/model.mjs");
  const j = new Journey();
  j.save.energy = 20;
  j.resources = [];
  j.hazards = [{ x: j.x, y: j.y }];
  assert.equal(j.step(0, 0, 0).hit, true);
  assert.equal(j.save.energy, 16);
  assert.equal(j.step(0, 0, 0).hit, false);
  const x = j.x,
    y = j.y;
  j.step(500, 1, 1);
  assert.ok(Math.hypot(j.x - x, j.y - y) < 9.26);
});
