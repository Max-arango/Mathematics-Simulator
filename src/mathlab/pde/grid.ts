// Shared uniform-grid construction for the 1D PDE solvers. heat1d and wave1d both
// discretise the same way (nx points including both boundaries, dx = span/(nx−1)),
// so the grid validation lives once here instead of being copied per solver — one
// place decides what a legal grid is and how a bad one fails.
import { MAX_GRID } from "../core/constants.ts";
import { InvalidInputError, ResourceLimitError } from "../core/errors.ts";
import type { Grid1D } from "./types.ts";

// Space-time storage budget for time-marching solvers: the whole (steps+1)×nx surface
// is retained, so cap the total cell count and reject a huge steps·nx request up front
// (ResourceLimitError) instead of exhausting memory mid-run.
export const MAX_CELLS = MAX_GRID * MAX_GRID; // ≈ 4.2M doubles ≈ 34 MB

/** Validate a Grid1D and return its node coordinates x[0..nx-1] (endpoints snapped). */
export function buildGrid({ xMin, xMax, nx }: Grid1D): number[] {
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) throw new InvalidInputError("grid xMin/xMax must be finite");
  if (xMax <= xMin) throw new InvalidInputError(`grid xMax must exceed xMin (got xMin=${xMin}, xMax=${xMax})`);
  if (!Number.isInteger(nx) || nx < 3) throw new InvalidInputError(`grid nx must be an integer ≥ 3 (got ${nx})`);
  if (nx > MAX_GRID) throw new ResourceLimitError(`grid nx=${nx} exceeds MAX_GRID=${MAX_GRID}`);
  const dx = (xMax - xMin) / (nx - 1);
  const x = new Array<number>(nx);
  for (let i = 0; i < nx; i++) x[i] = xMin + i * dx;
  x[nx - 1] = xMax; // snap endpoint (avoid float drift)
  return x;
}
