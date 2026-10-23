/**
 * Regression for the real F-16CM CAD rig. Run with the server on port 4173:
 *   node tools/check-doors.mjs
 * Checks actual transformed vertices, including visible closed panels and
 * their centre seam. A hidden panel or an outward rotation must fail.
 */
import assert from 'node:assert/strict';
import { withBrowser } from './cdp.mjs';

const near = (a, b, tol = 0.004) => Math.abs(a - b) <= tol;
await withBrowser(async (api) => {
  const view = await api.open('http://127.0.0.1:4173/tools/gear-preview.html?gear=1');
  try {
    assert.ok(view.ready, 'preview loaded');
    const states = [];
    // Retract and extend, including either side of the old visibility cutoff.
    const steps = [...Array.from({ length: 21 }, (_, i) => 1 - i / 20), 0.019, 0.021,
      ...Array.from({ length: 21 }, (_, i) => i / 20)];
    for (const gear of steps) {
      const doors = await view.page.evaluate(`window.__GEAR_PREVIEW__.setGear(${gear})`);
      const front = doors.filter((d) => d.kind === 'front');
      assert.equal(front.length, 2, 'both nose panels exist');
      const [l, r] = front;
      for (const door of front) {
        assert.ok(door.visible, `nose panel stays rendered at gear=${gear}`);
        assert.ok(door.angle * door.side <= 0, 'closing swings inward beneath hinge');
        assert.ok(near(door.hinge[1], -0.864, 0.002), 'hinge stays at the bay rim');
      }
      assert.ok(near(l.bounds.min[0] + r.bounds.max[0], 0.015, 0.002), 'mirrored outer edges');
      assert.ok(near(l.bounds.max[0] + r.bounds.min[0], 0.015, 0.002), 'mirrored inner edges');
      assert.ok(near(l.bounds.min[1], r.bounds.min[1], 0.002), 'equal door heights');
      states.push({ gear, doors, front });
    }
    const open = states.find((s) => s.gear === 1);
    const closed = states.find((s) => s.gear === 0);
    for (const door of open.front) {
      assert.ok(near(door.bounds.max[0] - door.bounds.min[0], 0.310), 'exported open width');
      assert.ok(near(door.bounds.max[1] - door.bounds.min[1], 0.196), 'exported open height');
      assert.ok(near(door.bounds.max[2] - door.bounds.min[2], 1.100), 'exported open length');
      assert.equal(door.angle, 0, 'exported open angle');
    }
    const [l, r] = closed.front;
    assert.ok(near(l.bounds.max[0], 0.0075, 0.002), 'left panel reaches centre seam');
    assert.ok(near(r.bounds.min[0], 0.0075, 0.002), 'right panel reaches centre seam');
    assert.ok(Math.abs(r.bounds.min[0] - l.bounds.max[0]) < 0.002, 'centre seam under 2 mm');
    for (const door of closed.front) {
      assert.ok(door.bounds.min[0] > -0.35 && door.bounds.max[0] < 0.36, 'closed panel inside bay');
      assert.ok(near(door.bounds.min[1], -0.97, 0.015), 'free edge follows belly rim');
      assert.ok(door.bounds.max[1] - door.bounds.min[1] < 0.14, 'closed panel follows belly slope');
    }
    for (const state of states) {
      if (state.gear >= 0.20) {
        for (const door of state.doors) assert.equal(Math.abs(door.angle), 0,
          'doors stay completely open until all wheels are stowed');
      }
      for (const door of state.doors) assert.ok(door.visible, 'all doors remain rendered');
    }
    // The complete round trip must restore precisely the same CAD transforms.
    assert.deepEqual(states.at(-1).front, open.front, 'repeatable extension');
    for (let i = 1; i <= 20; i++) {
      assert.ok(states[i].front[0].angle >= states[i - 1].front[0].angle,
        'closing rotation advances continuously');
    }
    assert.equal(view.page.problems.length, 0, view.page.problems.join('; '));
    console.log(`PASS: ${steps.length} gear states; inward rotation, visible closure, <2 mm seam, symmetry, door timing, round trip`);
    console.log('Closed nose bounds:', JSON.stringify(closed.front.map((d) => d.bounds)));
  } finally {
    await view.close();
  }
});
