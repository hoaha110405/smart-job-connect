// src/utils/parseSkills.ts
export type RawSkillInput =
  | undefined
  | null
  | string
  | string[]
  | Array<{ name?: any; level?: any; years?: any }>
  | { name?: any; level?: any; years?: any };

export type SkillNormalized = {
  name: string;
  level?: string;
  years?: number;
};

export function parseSkills(input: RawSkillInput): SkillNormalized[] {
  if (input === undefined || input === null) return [];

  // Array case
  if (Array.isArray(input)) {
    const out: SkillNormalized[] = [];
    for (const item of input) {
      if (!item) continue;
      if (typeof item === "string") {
        const name = item.trim();
        if (name) out.push({ name });
      } else if (typeof item === "object") {
        const name = (item.name ?? "").toString().trim();
        if (!name) continue;
        const level = item.level ? item.level.toString().trim() : undefined;
        const yearsRaw = item.years;
        const years =
          yearsRaw !== undefined && yearsRaw !== null && yearsRaw !== ""
            ? Number(yearsRaw)
            : undefined;
        out.push({
          name,
          level,
          years: Number.isNaN(years) ? undefined : years,
        });
      }
    }
    return out;
  }

  // Single object case
  if (typeof input === "object") {
    const name = (input as any).name
      ? (input as any).name.toString().trim()
      : "";
    if (!name) return [];
    const level = (input as any).level
      ? (input as any).level.toString().trim()
      : undefined;
    const yearsRaw = (input as any).years;
    const years =
      yearsRaw !== undefined && yearsRaw !== null && yearsRaw !== ""
        ? Number(yearsRaw)
        : undefined;
    return [{ name, level, years: Number.isNaN(years) ? undefined : years }];
  }

  // String case (CSV / newline / semicolon separated)
  if (typeof input === "string") {
    const parts = input
      .split(/\r?\n|,|;/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.map((p) => ({ name: p }));
  }

  return [];
}
