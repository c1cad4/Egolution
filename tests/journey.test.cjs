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
    assert.equal(j.ready, false);
    // Complete every real chapter gate, including incubation and light costs.
    for (let goal = 0; goal < j.beacons.length; goal++) {
      j.save.energy = COSTS[stage];
      const target = j.target();
      j.x = target.x;
      j.y = target.y;
      j.resources = [];
      for (let tick = 0; tick < (stage === 3 ? 61 : 1); tick++)
        j.step(0.05, 0, 0);
    }
    j.save.energy = COSTS[stage];
    j.step(0.01, 0, 0);
    assert.equal(j.ready, true);
    assert.equal(j.evolve("paid"), false);
    assert.equal(j.evolve(["speed", "shield", "magnet"][stage % 3]), true);
    assert.equal(j.evolve("speed"), false);
  }
  assert.equal(j.counts("speed"), 2);
  assert.equal(j.rebirth(), false);
  j.resources = Array.from({ length: COSTS[6] }, () => ({ x: j.x, y: j.y }));
  j.step(0.016, 0, 0);
  assert.equal(j.rebirth(), false);
  for (let i = 0; i < 3; i++) {
    j.save.energy = COSTS[6];
    const target = j.target();
    j.x = target.x;
    j.y = target.y;
    j.resources = [];
    j.step(0.01, 0, 0);
  }
  j.save.energy = COSTS[6];
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
test("chapter gates require objectives as well as light; legacy completed stages migrate without losing progress", async () => {
  const { Journey, restore } = await import("../public/model.mjs");
  const j = new Journey();
  j.save.energy = 24;
  j.resources = [];
  j.hazards = [];
  j.step(0.01, 0, 0);
  assert.equal(j.ready, false);
  assert.equal(j.evolve("speed"), false);
  assert.equal(
    restore({ version: 1, stage: 1, energy: 30, traits: [] }).objective,
    3,
  );
  assert.equal(
    restore({ version: 1, stage: 1, energy: 30, objective: 0, traits: [] })
      .objective,
    0,
  );
});
test("egg incubation requires stillness and continuous time inside the nest", async () => {
  const { Journey } = await import("../public/model.mjs");
  const j = new Journey({ version: 1, stage: 3, energy: 42, objective: 0 });
  j.resources = [];
  j.hazards = [];
  Object.assign(j, { x: j.target().x, y: j.target().y });
  for (let i = 0; i < 30; i++) j.step(0.05, 0, 0);
  assert.equal(j.save.objective, 0);
  assert.ok(j.warmth > 1);
  j.step(0.05, 1, 0);
  assert.equal(j.warmth, 0);
  j.x = j.target().x;
  j.y = j.target().y;
  for (let i = 0; i < 61; i++) j.step(0.05, 0, 0);
  assert.equal(j.save.objective, 1);
  assert.equal(j.ready, true);
});
test("cells spend light only on the next organelle, boost expires and weather doubles collection", async () => {
  const { Journey, weather } = await import("../public/model.mjs");
  const j = new Journey({ version: 1, stage: 2, energy: 6, objective: 0 });
  j.resources = [];
  j.hazards = [];
  j.x = j.beacons[1].x;
  j.y = j.beacons[1].y;
  j.step(0.01, 0, 0);
  assert.equal(j.save.objective, 0);
  j.x = j.target().x;
  j.y = j.target().y;
  j.step(0.01, 0, 0);
  assert.equal(j.save.energy, 0);
  assert.equal(j.save.objective, 1);
  assert.equal(j.boost(), true);
  assert.equal(j.boost(), false);
  for (let i = 0; i < 121; i++) j.step(0.05, 0, 0);
  assert.equal(j.cooldown, 0);
  assert.equal(j.boostLeft, 0);
  j.time = 31;
  j.resources = [{ x: j.x, y: j.y }];
  j.step(0.01, 0, 0);
  assert.equal(j.save.energy, 2);
  assert.equal(weather(31).kind, "aurora");
  assert.equal(weather(50).kind, "storm");
  assert.equal(weather(60).kind, "calm");
});
test("chapter milestones persist across reloads and moving creature targets change over time", async () => {
  const { Journey } = await import("../public/model.mjs");
  const j = new Journey({
    version: 1,
    stage: 4,
    energy: 20,
    objective: 1,
    traits: ["speed", "shield", "magnet", "speed"],
    cycles: 2,
    total: 100,
  });
  const before = j.target();
  j.time = 4;
  const after = j.target();
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 30);
  const restored = new Journey(JSON.stringify(j.save));
  assert.equal(restored.save.objective, 1);
  assert.equal(restored.save.energy, 20);
  assert.equal(restored.save.cycles, 2);
  assert.equal(restored.beacons.length, 3);
  assert.equal(restored.finished(), false);
});
