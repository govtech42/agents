import pc from "picocolors";

/** Small presentation helpers shared across commands. */
export const theme = {
  title: (s: string) => pc.bold(pc.cyan(s)),
  agent: (s: string) => pc.bold(s),
  ok: (s: string) => pc.green(s),
  warn: (s: string) => pc.yellow(s),
  err: (s: string) => pc.red(s),
  dim: (s: string) => pc.dim(s),
  accent: (s: string) => pc.cyan(s),
};

export const symbols = {
  ok: pc.green("✓"),
  fail: pc.red("✗"),
  warn: pc.yellow("!"),
  bullet: pc.dim("•"),
  arrow: pc.dim("→"),
};
