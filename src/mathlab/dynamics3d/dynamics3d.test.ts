import { describe, it, expect } from "vitest";
import { norm, distance } from "../linear/vector.ts";
import { type Body3D, type FieldParams, type Vec3 } from "./types.ts";
import { potentialAt, effectiveMass } from "./potential.ts";
import { fieldAt, accelerationOn, accelerations, accelerationSources } from "./field.ts";
import { stepVerlet, stepRK4 } from "./integrators.ts";
import { systemMetrics, kineticEnergy, momentum, relativeDrift } from "./metrics.ts";

let _n = 0;
function body(p: Partial<Body3D> & { position: Vec3 }): Body3D {
  return {
    id: `b${_n++}`, name: p.name ?? "body",
    position: p.position, velocity: p.velocity ?? [0, 0, 0], acceleration: [0, 0, 0],
    mass: p.mass ?? 1, radius: p.radius ?? 0.1,
    gravitationalStrength: p.gravitationalStrength ?? 1,
    type: p.type ?? "planet", active: p.active ?? true,
    softening: p.softening, absorptionRadius: p.absorptionRadius,
  };
}
const P: FieldParams = { G: 1, softening: 0.001 };

// Apply an integration result back onto bodies (mimics what the sim loop will do).
function apply(bodies: Body3D[], r: ReturnType<typeof stepVerlet>): Body3D[] {
  return bodies.map((b, i) => ({ ...b, position: r.positions[i], velocity: r.velocities[i], acceleration: r.accelerations[i] }));
}
function run(bodies: Body3D[], dt: number, steps: number, method = stepVerlet): Body3D[] {
  let s = bodies;
  for (let k = 0; k < steps; k++) s = apply(s, method(s, dt, P));
  return s;
}

describe("field & potential", () => {
  it("field points TOWARD a single attracting source", () => {
    const bodies = [body({ position: [0, 0, 0], mass: 10 })];
    const g = fieldAt([5, 0, 0], bodies, P);
    expect(g[0]).toBeLessThan(0);            // pulled back toward origin (−x)
    expect(Math.abs(g[1])).toBeLessThan(1e-9);
  });
  it("field magnitude decreases with distance", () => {
    const bodies = [body({ position: [0, 0, 0], mass: 10 })];
    expect(norm(fieldAt([2, 0, 0], bodies, P))).toBeGreaterThan(norm(fieldAt([8, 0, 0], bodies, P)));
  });
  it("potential is negative and deepens near the source", () => {
    const bodies = [body({ position: [0, 0, 0], mass: 10 })];
    expect(potentialAt([1, 0, 0], bodies, P)).toBeLessThan(potentialAt([9, 0, 0], bodies, P));
    expect(potentialAt([9, 0, 0], bodies, P)).toBeLessThan(0);
  });
  it("accelerationOn(body) == field of the others at its position", () => {
    const bodies = [body({ position: [0, 0, 0], mass: 5 }), body({ position: [3, 0, 0], mass: 5 })];
    const a = accelerationOn(bodies[1], bodies, P);
    const g = fieldAt(bodies[1].position, bodies, P, bodies[1].id);
    expect(a).toEqual(g);
  });
});

describe("Test 1 — two bodies attract", () => {
  it("separation shrinks from rest", () => {
    const b = [body({ position: [-2, 0, 0], mass: 5 }), body({ position: [2, 0, 0], mass: 5 })];
    const after = run(b, 0.01, 200);
    expect(distance(after[0].position, after[1].position)).toBeLessThan(4);
  });
});

describe("Test 2 — approximately circular orbit", () => {
  it("stays within ±15% of its radius over ~one period", () => {
    const M = 100, r = 5, v = Math.sqrt((P.G * M) / r); // circular speed (eps≪r)
    let bodies = [
      body({ position: [0, 0, 0], mass: M, type: "star" }),
      body({ position: [r, 0, 0], velocity: [0, v, 0], mass: 1e-3, type: "planet" }),
    ];
    let rmin = r, rmax = r;
    const dt = 0.002, steps = Math.round((2 * Math.PI * r) / v / dt);
    for (let k = 0; k < steps; k++) {
      bodies = apply(bodies, stepVerlet(bodies, dt, P));
      const rad = distance(bodies[1].position, bodies[0].position);
      rmin = Math.min(rmin, rad); rmax = Math.max(rmax, rad);
    }
    expect(rmin).toBeGreaterThan(0.85 * r);
    expect(rmax).toBeLessThan(1.15 * r);
  });
});

describe("Test 3 — escape", () => {
  it("a fast body recedes without bound", () => {
    const M = 100, r = 5;
    const vEsc = Math.sqrt((2 * P.G * M) / r);
    let bodies = [
      body({ position: [0, 0, 0], mass: M, type: "star" }),
      body({ position: [r, 0, 0], velocity: [0, 2 * vEsc, 0], mass: 1e-3 }),
    ];
    bodies = run(bodies, 0.002, 1500);
    expect(distance(bodies[1].position, bodies[0].position)).toBeGreaterThan(3 * r);
  });
});

describe("Test 4 — symmetry", () => {
  it("point-symmetric initial data stays point-symmetric", () => {
    let bodies = [
      body({ position: [2, 0, 0], velocity: [0, 0.5, 0], mass: 1 }),
      body({ position: [-2, 0, 0], velocity: [0, -0.5, 0], mass: 1 }),
    ];
    bodies = run(bodies, 0.005, 300);
    for (let c = 0; c < 3; c++) expect(bodies[1].position[c]).toBeCloseTo(-bodies[0].position[c], 6);
  });
});

describe("Test 5 — genuine N-body (all-to-all)", () => {
  it("a third body changes the acceleration on the first", () => {
    const two = [body({ position: [0, 0, 0], mass: 1 }), body({ position: [4, 0, 0], mass: 1 })];
    const three = [...two, body({ position: [0, 4, 0], mass: 1 })];
    const a2 = accelerationOn(two[0], two, P);
    const a3 = accelerationOn(three[0], three, P);
    expect(a3).not.toEqual(a2);
    // all three feel non-zero acceleration
    expect(accelerations(three, P).every((a) => norm(a) > 0)).toBe(true);
  });
});

describe("Test 6 — mass modification changes acceleration", () => {
  it("heavier source pulls harder", () => {
    const target = body({ position: [3, 0, 0], mass: 1e-6 });
    const light = [body({ position: [0, 0, 0], mass: 1 }), target];
    const heavy = [body({ position: [0, 0, 0], mass: 10 }), target];
    expect(norm(accelerationOn(target, heavy, P))).toBeGreaterThan(norm(accelerationOn(target, light, P)));
  });
});

describe("Test 7 — gravitationalStrength is separate from mass", () => {
  it("effectiveMass = mass × strength scales the field", () => {
    const s1 = [body({ position: [0, 0, 0], mass: 2, gravitationalStrength: 1 })];
    const s5 = [body({ position: [0, 0, 0], mass: 2, gravitationalStrength: 5 })];
    expect(effectiveMass(s5[0])).toBeCloseTo(10, 9);
    const ratio = norm(fieldAt([3, 0, 0], s5, P)) / norm(fieldAt([3, 0, 0], s1, P));
    expect(ratio).toBeCloseTo(5, 6);
  });
});

describe("Test 8 — singularity stays finite (no NaN)", () => {
  it("field at and near a softened singularity is finite", () => {
    const s = [body({ position: [0, 0, 0], mass: 1e6, type: "singularity", softening: 0.1, gravitationalStrength: 5 })];
    for (const x of [[0, 0, 0], [1e-9, 0, 0], [0.001, 0, 0]] as Vec3[]) {
      const g = fieldAt(x, s, P);
      expect(g.every(Number.isFinite)).toBe(true);
    }
    expect(Number.isFinite(potentialAt([0, 0, 0], s, P))).toBe(true);
  });
});

describe("Test 9 — energy & momentum diagnostics", () => {
  it("Velocity-Verlet keeps energy drift small on a bound orbit", () => {
    let bodies = [
      body({ position: [0, 0, 0], mass: 100, type: "star" }),
      body({ position: [5, 0, 0], velocity: [0, Math.sqrt(100 / 5), 0], mass: 1e-2 }),
    ];
    const e0 = systemMetrics(bodies, P).total;
    for (let k = 0; k < 3000; k++) bodies = apply(bodies, stepVerlet(bodies, 0.002, P));
    const e1 = systemMetrics(bodies, P).total;
    expect(relativeDrift(e1, e0)).toBeLessThan(0.05);
  });
  it("symmetric-force system conserves total momentum (strength=1)", () => {
    let bodies = [
      body({ position: [0, 0, 0], mass: 2 }),
      body({ position: [5, 0, 0], velocity: [0, 1, 0], mass: 1 }),
    ];
    const p0 = momentum(bodies);
    for (let k = 0; k < 500; k++) bodies = apply(bodies, stepVerlet(bodies, 0.005, P));
    const p1 = momentum(bodies);
    for (let c = 0; c < 3; c++) expect(Math.abs(p1[c] - p0[c])).toBeLessThan(1e-6);
  });
});

describe("RK4 reuses the shared solver and agrees with Verlet short-term", () => {
  it("two-body positions match between integrators over a short span", () => {
    const b = () => [body({ position: [0, 0, 0], mass: 10 }), body({ position: [4, 0, 0], velocity: [0, 1, 0], mass: 1 })];
    const v = run(b(), 0.001, 200, stepVerlet);
    const r = run(b(), 0.001, 200, stepRK4);
    expect(distance(v[1].position, r[1].position)).toBeLessThan(0.05);
  });
});

describe("accelerationSources — dominant contributors", () => {
  it("ranks sources by share, summing to ~1", () => {
    const target = body({ position: [1, 0, 0], mass: 1e-6 });
    const bodies = [
      body({ position: [0, 0, 0], mass: 100, name: "star" }),
      body({ position: [10, 0, 0], mass: 1, name: "far" }),
      target,
    ];
    const src = accelerationSources(target, bodies, P);
    expect(src[0].name).toBe("star");
    expect(src.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 6);
  });
});

describe("kinetic energy sanity", () => {
  it("½mv² for a single mover", () => {
    expect(kineticEnergy([body({ position: [0, 0, 0], velocity: [3, 4, 0], mass: 2 })])).toBeCloseTo(0.5 * 2 * 25, 9);
  });
});
