// Tests for the shared gravity-model seam (gravityModel.ts) — TASK-002 phase 4.
import { describe, it, expect } from "vitest";
import { norm } from "../linear/vector.ts";
import type { Body3D, FieldParams, Vec3 } from "./types.ts";
import { DEFAULT_FIELD } from "./types.ts";
import { fieldAt, accelerationOn } from "./field.ts";
import { potentialAt } from "./potential.ts";
import { systemMetrics, energyConfidence } from "./metrics.ts";
import { gravityField, gravityPotential, resolveModel, EXACT_MIN_R } from "./gravityModel.ts";

let _n = 0;
function body(p: Partial<Body3D> & { position: Vec3 }): Body3D {
  return {
    id: `gb${_n++}`, name: p.name ?? "body",
    position: p.position, velocity: p.velocity ?? [0, 0, 0], acceleration: [0, 0, 0],
    mass: p.mass ?? 1, radius: p.radius ?? 0.1,
    gravitationalStrength: p.gravitationalStrength ?? 1,
    type: p.type ?? "planet", active: p.active ?? true,
    softening: p.softening, absorptionRadius: p.absorptionRadius,
  };
}

const EXACT: FieldParams = { G: 1, softening: 0.05, model: "exact" };
const SOFT: FieldParams = { G: 1, softening: 0.05, model: "softened" };

describe("resolveModel", () => {
  it("defaults to softened when `model` is omitted (regression-safe default)", () => {
    expect(resolveModel({ G: 1, softening: 0.05 })).toBe("softened");
    expect(resolveModel(DEFAULT_FIELD)).toBe("softened");
  });
});

describe("exact model — analytic inverse-square law", () => {
  it("field magnitude matches GM/r² exactly at several radii", () => {
    const M = 10, G = 1;
    const source = body({ position: [0, 0, 0], mass: M });
    for (const r of [1, 2, 5, 10, 50]) {
      const g = fieldAt([r, 0, 0], [source], EXACT);
      expect(norm(g)).toBeCloseTo((G * M) / (r * r), 9);
    }
  });
  it("field magnitude scales as 1/r² across a range of radii (regression-style)", () => {
    const M = 10;
    const source = body({ position: [0, 0, 0], mass: M });
    const radii = [0.5, 1, 2, 4, 8, 16, 32];
    for (const r of radii) {
      const mag = norm(fieldAt([r, 0, 0], [source], EXACT));
      expect(mag * r * r).toBeCloseTo(M, 6); // g·r² is constant (=GM) for 1/r²
    }
  });
});

describe("two-body symmetry — equal masses, gravitationalStrength=1", () => {
  for (const [name, params] of [["exact", EXACT], ["softened", SOFT]] as const) {
    it(`${name}: forces are equal and opposite`, () => {
      const bodies = [
        body({ position: [-3, 0, 0], mass: 4 }),
        body({ position: [3, 0, 0], mass: 4 }),
      ];
      const a0 = accelerationOn(bodies[0], bodies, params);
      const a1 = accelerationOn(bodies[1], bodies, params);
      for (let c = 0; c < 3; c++) expect(a0[c]).toBeCloseTo(-a1[c], 9);
    });
  }
});

describe("softened limit — byte-identical regression against the pre-existing Plummer formula", () => {
  it("field matches GM·delta/(r²+ε²)^1.5 exactly", () => {
    const source = body({ position: [0, 0, 0], mass: 10 });
    const x: Vec3 = [3, 4, 0];
    const eps = 0.05;
    const r2 = 3 * 3 + 4 * 4;
    const denom = Math.pow(r2 + eps * eps, 1.5);
    const f = (1 * 10) / denom;
    const expected: Vec3 = [f * -3, f * -4, 0]; // delta = source − x
    const g = fieldAt(x, [source], SOFT);
    for (let c = 0; c < 3; c++) expect(g[c]).toBeCloseTo(expected[c], 12);
  });
  it("potential matches −GM/√(r²+ε²) exactly", () => {
    const source = body({ position: [0, 0, 0], mass: 10 });
    const x: Vec3 = [3, 4, 0];
    const eps = 0.05;
    const d = Math.sqrt(3 * 3 + 4 * 4 + eps * eps);
    expect(potentialAt(x, [source], SOFT)).toBeCloseTo(-10 / d, 12);
  });
});

describe("potential/field gradient consistency: g ≈ −∇Φ (finite difference)", () => {
  for (const [name, params] of [["exact", EXACT], ["softened", SOFT]] as const) {
    it(`${name}`, () => {
      const source = body({ position: [0, 0, 0], mass: 20 });
      const points: Vec3[] = [[3, 0, 0], [0, 4, 2], [-5, 1, 1]];
      const h = 1e-4;
      for (const p of points) {
        const g = fieldAt(p, [source], params);
        for (let c = 0; c < 3; c++) {
          const pPlus = [...p] as Vec3; pPlus[c] += h;
          const pMinus = [...p] as Vec3; pMinus[c] -= h;
          const dphi = (potentialAt(pPlus, [source], params) - potentialAt(pMinus, [source], params)) / (2 * h);
          expect(-dphi).toBeCloseTo(g[c], 4);
        }
      }
    });
  }
});

describe("near-r=0 safety — exact model clamps instead of blowing up or faking softened", () => {
  it("stays finite and does NOT silently match the softened value", () => {
    const source = body({ position: [0, 0, 0], mass: 1e6 });
    const xNear: Vec3 = [1e-9, 0, 0];
    const gExact = fieldAt(xNear, [source], EXACT);
    const gSoft = fieldAt(xNear, [source], SOFT);
    expect(gExact.every(Number.isFinite)).toBe(true);
    expect(gSoft.every(Number.isFinite)).toBe(true);
    expect(norm(gExact)).not.toBeCloseTo(norm(gSoft), 3);

    const phiExact = potentialAt(xNear, [source], EXACT);
    const phiSoft = potentialAt(xNear, [source], SOFT);
    expect(Number.isFinite(phiExact)).toBe(true);
    expect(phiExact).not.toBeCloseTo(phiSoft, 3);
  });

  it("gravityField reports hitFloor near/at r=0, and false once clear of the floor", () => {
    const atZero = gravityField([0, 0, 0], 0, 1, 1e6, 0.05, "exact");
    expect(atZero.hitFloor).toBe(true);
    expect(atZero.g.every(Number.isFinite)).toBe(true);

    const near = gravityField([EXACT_MIN_R / 2, 0, 0], (EXACT_MIN_R / 2) ** 2, 1, 1e6, 0.05, "exact");
    expect(near.hitFloor).toBe(true);
    expect(near.g.every(Number.isFinite)).toBe(true);

    const far = gravityField([5, 0, 0], 25, 1, 1e6, 0.05, "exact");
    expect(far.hitFloor).toBe(false);
  });

  it("gravityPotential clamps r at the floor for the exact model", () => {
    const exact = gravityPotential(0, 1, 1e6, 0.05, "exact");
    expect(exact.hitFloor).toBe(true);
    expect(Number.isFinite(exact.phi)).toBe(true);
    expect(exact.phi).toBeCloseTo(-1e6 / EXACT_MIN_R, 6);

    const soft = gravityPotential(0, 1, 1e6, 0.05, "softened");
    expect(exact.phi).not.toBeCloseTo(soft.phi, 3);
  });
});

describe("Confidence tagging (§17 honesty)", () => {
  it("uniform gravitationalStrength=1 → energy/momentum are 'numerical', kinetic is 'exact'", () => {
    const bodies = [body({ position: [0, 0, 0], mass: 5 }), body({ position: [3, 0, 0], mass: 2 })];
    expect(energyConfidence(bodies)).toBe("numerical");
    const m = systemMetrics(bodies, SOFT);
    expect(m.kineticConfidence).toBe("exact");
    expect(m.energyConfidence).toBe("numerical");
    expect(m.momentumConfidence).toBe("numerical");
  });
  it("any body with gravitationalStrength ≠ 1 → energy confidence downgrades to 'proxy'", () => {
    const bodies = [
      body({ position: [0, 0, 0], mass: 5, gravitationalStrength: 2 }),
      body({ position: [3, 0, 0], mass: 2 }),
    ];
    expect(energyConfidence(bodies)).toBe("proxy");
    expect(systemMetrics(bodies, SOFT).energyConfidence).toBe("proxy");
  });
});
