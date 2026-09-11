import { describe, expect, it } from "vitest";
import { cartesianToSpherical, sphericalToCartesian } from "./sphericalCoords.ts";

describe("sphericalCoords", () => {
  it("round-trips spherical -> Cartesian -> spherical for a Schwarzschild/Kerr-style equatorial start", () => {
    // A click at r0=10, equatorial start (theta=pi/2), phi=0 — same shape the GR
    // panel's own trace uses (x0 = [0, r0, pi/2, 0]).
    const r0 = 10, theta0 = Math.PI / 2, phi0 = 0;
    const cart = sphericalToCartesian(r0, theta0, phi0);
    expect(cart[0]).toBeCloseTo(10, 10);
    expect(cart[1]).toBeCloseTo(0, 10);
    expect(cart[2]).toBeCloseTo(0, 10);

    const back = cartesianToSpherical(cart);
    expect(back.r).toBeCloseTo(r0, 10);
    expect(back.theta).toBeCloseTo(theta0, 10);
    expect(back.phi).toBeCloseTo(phi0, 10);
  });

  it("round-trips an off-axis point (r=5, theta=1.0, phi=2.0)", () => {
    const r0 = 5, theta0 = 1.0, phi0 = 2.0;
    const cart = sphericalToCartesian(r0, theta0, phi0);
    const back = cartesianToSpherical(cart);
    expect(back.r).toBeCloseTo(r0, 10);
    expect(back.theta).toBeCloseTo(theta0, 10);
    expect(back.phi).toBeCloseTo(phi0, 10);
  });

  it("inverts a concrete clicked Cartesian point to known spherical coordinates", () => {
    // A point clicked at (x,y,z) = (6, 8, 0) is on the equator (theta=pi/2) at r=10.
    const { r, theta, phi } = cartesianToSpherical([6, 8, 0]);
    expect(r).toBeCloseTo(10, 10);
    expect(theta).toBeCloseTo(Math.PI / 2, 10);
    expect(phi).toBeCloseTo(Math.atan2(8, 6), 10); // ~0.9273 rad
  });

  it("r=0 falls back to a defined equatorial point instead of NaN", () => {
    const { r, theta, phi } = cartesianToSpherical([0, 0, 0]);
    expect(r).toBe(0);
    expect(theta).toBe(Math.PI / 2);
    expect(phi).toBe(0);
  });
});
