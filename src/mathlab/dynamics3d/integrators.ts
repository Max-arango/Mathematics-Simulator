// Numerical integration for the N-body system (Layer 1).
//
// Two integrators, both operating on a SNAPSHOT of the bodies (pure — inputs are
// never mutated); inactive bodies are left frozen:
//
//   • VELOCITY-VERLET (leapfrog): symplectic, the right default for gravity — it
//     conserves energy far better than RK4 over long orbital integrations (§5).
//   • RK4: reuses the SHARED solver mathlab/ode/registry.solveODE("rk4") by packing
//     the state into a flat vector — NO second Runge–Kutta implementation (§35).
//
// Both return new positions/velocities plus the acceleration evaluated AT THE NEW
// state (for the inspector's acceleration vectors, §18).
import { solveODE } from "../ode/registry.ts";
import type { ODEFn } from "../ode/types.ts";
import { accelerations } from "./field.ts";
import type { Body3D, FieldParams, Vec3 } from "./types.ts";

export type Integrator = "verlet" | "rk4";

export interface IntegrationResult {
  positions: Vec3[];      // aligned to input bodies
  velocities: Vec3[];
  accelerations: Vec3[];
}

/** Snapshot the current state unchanged (used for the inactive-body / dt≤0 paths). */
function identityResult(bodies: Body3D[]): IntegrationResult {
  return {
    positions: bodies.map((b) => [...b.position] as Vec3),
    velocities: bodies.map((b) => [...b.velocity] as Vec3),
    accelerations: bodies.map((b) => [...b.acceleration] as Vec3),
  };
}

/** Velocity-Verlet step. Symplectic; preferred for gravitational systems. */
export function stepVerlet(bodies: Body3D[], dt: number, params: FieldParams): IntegrationResult {
  if (!(dt > 0)) return identityResult(bodies);
  const a0 = accelerations(bodies, params);

  // x₁ = x₀ + v₀ dt + ½ a₀ dt²  (only active bodies move)
  const moved: Body3D[] = bodies.map((b, i) =>
    b.active
      ? { ...b, position: [
          b.position[0] + b.velocity[0] * dt + 0.5 * a0[i][0] * dt * dt,
          b.position[1] + b.velocity[1] * dt + 0.5 * a0[i][1] * dt * dt,
          b.position[2] + b.velocity[2] * dt + 0.5 * a0[i][2] * dt * dt,
        ] as Vec3 }
      : b,
  );
  const a1 = accelerations(moved, params);

  const positions: Vec3[] = [];
  const velocities: Vec3[] = [];
  for (let i = 0; i < bodies.length; i++) {
    if (!bodies[i].active) {
      positions.push([...bodies[i].position] as Vec3);
      velocities.push([...bodies[i].velocity] as Vec3);
      continue;
    }
    positions.push(moved[i].position);
    // v₁ = v₀ + ½ (a₀ + a₁) dt
    velocities.push([
      bodies[i].velocity[0] + 0.5 * (a0[i][0] + a1[i][0]) * dt,
      bodies[i].velocity[1] + 0.5 * (a0[i][1] + a1[i][1]) * dt,
      bodies[i].velocity[2] + 0.5 * (a0[i][2] + a1[i][2]) * dt,
    ]);
  }
  return { positions, velocities, accelerations: a1 };
}

/** RK4 step via the shared ODE registry (state packed as [pos…, vel…] of active bodies). */
export function stepRK4(bodies: Body3D[], dt: number, params: FieldParams): IntegrationResult {
  if (!(dt > 0)) return identityResult(bodies);
  const active = bodies.filter((b) => b.active);
  const na = active.length;
  if (na === 0) return identityResult(bodies);

  // Pack y = [ x,y,z per body … | vx,vy,vz per body … ].
  const y0: number[] = new Array(6 * na);
  for (let k = 0; k < na; k++) {
    y0[3 * k] = active[k].position[0];
    y0[3 * k + 1] = active[k].position[1];
    y0[3 * k + 2] = active[k].position[2];
    y0[3 * na + 3 * k] = active[k].velocity[0];
    y0[3 * na + 3 * k + 1] = active[k].velocity[1];
    y0[3 * na + 3 * k + 2] = active[k].velocity[2];
  }

  const f: ODEFn = (_t, y) => {
    const temp = active.map((b, k) => ({
      ...b, position: [y[3 * k], y[3 * k + 1], y[3 * k + 2]] as Vec3,
    }));
    const acc = accelerations(temp, params);
    const dy = new Array<number>(6 * na);
    for (let k = 0; k < na; k++) {
      dy[3 * k] = y[3 * na + 3 * k];         // dx/dt = vx
      dy[3 * k + 1] = y[3 * na + 3 * k + 1];
      dy[3 * k + 2] = y[3 * na + 3 * k + 2];
      dy[3 * na + 3 * k] = acc[k][0];        // dv/dt = a
      dy[3 * na + 3 * k + 1] = acc[k][1];
      dy[3 * na + 3 * k + 2] = acc[k][2];
    }
    return dy;
  };

  const res = solveODE("rk4", { f, y0, t0: 0, t1: dt }, { h: dt, steps: 1 });
  const yEnd = res.y[res.y.length - 1];

  // Unpack, and evaluate acceleration at the final positions for the inspector.
  const finalActive = active.map((b, k) => ({
    ...b, position: [yEnd[3 * k], yEnd[3 * k + 1], yEnd[3 * k + 2]] as Vec3,
  }));
  const aEnd = accelerations(finalActive, params);

  const positions: Vec3[] = [];
  const velocities: Vec3[] = [];
  const accelOut: Vec3[] = [];
  let ai = 0;
  for (let i = 0; i < bodies.length; i++) {
    if (!bodies[i].active) {
      positions.push([...bodies[i].position] as Vec3);
      velocities.push([...bodies[i].velocity] as Vec3);
      accelOut.push([...bodies[i].acceleration] as Vec3);
      continue;
    }
    const k = ai++;
    positions.push([yEnd[3 * k], yEnd[3 * k + 1], yEnd[3 * k + 2]]);
    velocities.push([yEnd[3 * na + 3 * k], yEnd[3 * na + 3 * k + 1], yEnd[3 * na + 3 * k + 2]]);
    accelOut.push(aEnd[k]);
  }
  return { positions, velocities, accelerations: accelOut };
}

/** Dispatch by name. */
export function step(
  method: Integrator, bodies: Body3D[], dt: number, params: FieldParams,
): IntegrationResult {
  return method === "rk4" ? stepRK4(bodies, dt, params) : stepVerlet(bodies, dt, params);
}
