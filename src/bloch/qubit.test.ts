import { describe, it, expect } from "vitest";
import { KET0, applyGate, blochVector, rotation, applyMat, normalize, arc, pulseAxisAngle, probabilities, type State } from "./qubit.ts";

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
const bloch = (name: string, s: State) => blochVector(applyGate(name, s));

describe("qubit gates (Bloch action)", () => {
  it("|0⟩ sits at the north pole (+z)", () => {
    expect(blochVector(KET0)).toEqual([0, 0, 1]);
  });
  it("X flips |0⟩ to |1⟩ (−z)", () => {
    const [x, y, z] = bloch("X", KET0);
    near(x, 0); near(y, 0); near(z, -1);
  });
  it("H sends |0⟩ to |+⟩ (+x)", () => {
    const [x, y, z] = bloch("H", KET0);
    near(x, 1); near(y, 0); near(z, 0);
  });
  it("Y sends |0⟩ to −z as well but via +y arc", () => {
    const [, , z] = bloch("Y", KET0);
    near(z, -1);
  });
  it("S rotates |+⟩ to |i⟩ (+x → +y)", () => {
    const plus = applyGate("H", KET0);
    const [x, y, z] = blochVector(applyGate("S", plus));
    near(x, 0); near(y, 1); near(z, 0);
  });
  it("Z takes |+⟩ to |−⟩ (+x → −x)", () => {
    const plus = applyGate("H", KET0);
    const [x] = blochVector(applyGate("Z", plus));
    near(x, -1);
  });
  it("T then T equals S on |+⟩", () => {
    const plus = applyGate("H", KET0);
    const tt = applyGate("T", applyGate("T", plus));
    const s = applyGate("S", plus);
    blochVector(tt).forEach((v, i) => near(v, blochVector(s)[i]));
  });
});

describe("rotations", () => {
  it("Rz keeps z fixed and advances φ", () => {
    const plus = applyGate("H", KET0);
    const rz = normalize(applyMat(rotation(0, 0, 1, Math.PI / 2), plus));
    const [x, y, z] = blochVector(rz);
    near(z, 0); near(x, 0); near(y, 1); // +x rotated 90° about z -> +y
  });
  it("stays on the unit sphere", () => {
    let s = KET0;
    for (const g of ["H", "T", "X", "S", "Y"]) s = applyGate(g, s);
    const r = Math.hypot(...blochVector(s));
    near(r, 1);
  });
  it("arc starts adjacent to the source and ends at the gate result", () => {
    const path = arc(KET0, [1, 0, 0], Math.PI, 16);
    expect(path).toHaveLength(16);
    blochVector(applyGate("X", KET0)).forEach((v, i) => near(path[15][i], v));
  });
});

describe("measurement probabilities", () => {
  it("|0⟩ is certain in Z, unbiased in X and Y", () => {
    const p = probabilities(KET0);
    near(p.z0, 1); near(p.z1, 0);
    near(p.xPlus, 0.5); near(p.yPlus, 0.5);
  });
  it("|+⟩ is certain in X, 50/50 in Z", () => {
    const p = probabilities(applyGate("H", KET0));
    near(p.xPlus, 1); near(p.xMinus, 0);
    near(p.z0, 0.5); near(p.z1, 0.5);
  });
  it("each basis pair sums to 1", () => {
    let s = KET0;
    for (const g of ["H", "T", "S", "X"]) s = applyGate(g, s);
    const p = probabilities(s);
    near(p.z0 + p.z1, 1); near(p.xPlus + p.xMinus, 1); near(p.yPlus + p.yMinus, 1);
  });
});

describe("drive pulses", () => {
  it("resonant φ=0 pulse rotates about +x; a π pulse flips |0⟩→|1⟩", () => {
    const { axis, angle } = pulseAxisAngle(1, 0, 0, Math.PI); // Ω=1, Δ=0, t=π
    near(axis[0], 1); near(axis[1], 0); near(axis[2], 0);
    near(angle, Math.PI);
    const s = normalize(applyMat(rotation(axis[0], axis[1], axis[2], angle), KET0));
    near(blochVector(s)[2], -1);
  });
  it("φ=90° drives about +y", () => {
    const { axis } = pulseAxisAngle(1, 0, Math.PI / 2, 1);
    near(axis[0], 0); near(axis[1], 1); near(axis[2], 0);
  });
  it("detuning tilts the effective axis toward z and speeds up the rotation", () => {
    const { axis, angle } = pulseAxisAngle(1, 1, 0, 1); // Ω=Δ=1
    near(axis[2], 1 / Math.SQRT2); // 45° tilt
    near(angle, Math.SQRT2); // Ω_eff = √2
  });
});
