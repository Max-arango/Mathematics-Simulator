export type Tok =
  | { k: "num"; v: number }
  | { k: "id"; v: string }
  | { k: "op"; v: "+" | "-" | "*" | "/" | "^" }
  | { k: "lparen" }
  | { k: "rparen" }
  | { k: "comma" }
  | { k: "eq" };

const ID_START = /[A-Za-zπφτ_]/;
const ID_CONT = /[A-Za-z0-9_]/;

// Unicode operator/symbol aliases folded to ASCII names.
const ALIAS: Record<string, string> = { "π": "pi", "φ": "phi", "τ": "tau", "∞": "Infinity" };

export function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }
    if (ch === "(") { toks.push({ k: "lparen" }); i++; continue; }
    if (ch === ")") { toks.push({ k: "rparen" }); i++; continue; }
    if (ch === ",") { toks.push({ k: "comma" }); i++; continue; }
    if (ch === "=") { toks.push({ k: "eq" }); i++; continue; }
    if (ch === "*" && src[i + 1] === "*") { toks.push({ k: "op", v: "^" }); i += 2; continue; } // ** -> ^
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^") {
      toks.push({ k: "op", v: ch as "+" }); i++; continue;
    }
    if (ch === "·") { toks.push({ k: "op", v: "*" }); i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < n && /[0-9.]/.test(src[j])) j++;
      // scientific notation: 1e-3
      if ((src[j] === "e" || src[j] === "E") && /[0-9+\-]/.test(src[j + 1] ?? "")) {
        j++;
        if (src[j] === "+" || src[j] === "-") j++;
        while (j < n && /[0-9]/.test(src[j])) j++;
      }
      const v = Number(src.slice(i, j));
      if (Number.isNaN(v)) throw new Error(`Invalid number: ${src.slice(i, j)}`);
      toks.push({ k: "num", v });
      i = j;
      continue;
    }
    if (ID_START.test(ch)) {
      let j = i + 1; // first char already matched ID_START (may be a unicode symbol)
      while (j < n && ID_CONT.test(src[j])) j++;
      let name = src.slice(i, j).trim();
      name = ALIAS[name] ?? name;
      toks.push({ k: "id", v: name });
      i = j;
      continue;
    }
    if (ALIAS[ch]) { toks.push({ k: "id", v: ALIAS[ch] }); i++; continue; }
    throw new Error(`Unexpected character '${ch}' at ${i}`);
  }
  return toks;
}
