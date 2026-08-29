import { describe, it, expect } from "vitest";
import { buildRefLines, vertexCount } from "./refLines.ts";

describe("buildRefLines", () => {
  it("emits 6 floats per vertex and an even vertex count (segments)", () => {
    const buf = buildRefLines(6, null);
    expect(buf.length % 6).toBe(0);
    expect(vertexCount(buf) % 2).toBe(0);
  });

  it("adds the probe marker (stick + 3-axis cross = 4 extra segments)", () => {
    const without = vertexCount(buildRefLines(6, null));
    const withProbe = vertexCount(buildRefLines(6, { x: 1, y: 1, z: 2 }));
    expect(withProbe - without).toBe(8); // 4 segments * 2 verts
  });

  it("skips the probe when z is non-finite", () => {
    const a = vertexCount(buildRefLines(6, null));
    const b = vertexCount(buildRefLines(6, { x: 1, y: 1, z: NaN }));
    expect(b).toBe(a);
  });

  it("adds a bounding cube (12 edges) when box is enabled", () => {
    const without = vertexCount(buildRefLines(6, null, { box: false }));
    const withBox = vertexCount(buildRefLines(6, null, { box: true }));
    expect(withBox - without).toBe(24); // 12 edges * 2 verts
  });

  it("toggles let each layer be omitted", () => {
    expect(buildRefLines(6, null, { grid: false, axes: false, box: false }).length).toBe(0);
  });
});
