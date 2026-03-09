export function compareVersions(left: string, right: string): number {
  const leftTokens = tokenizeVersion(left);
  const rightTokens = tokenizeVersion(right);
  const length = Math.max(leftTokens.length, rightTokens.length);

  for (let i = 0; i < length; i += 1) {
    const leftToken = leftTokens[i];
    const rightToken = rightTokens[i];
    if (!leftToken && !rightToken) {
      return 0;
    }
    if (!leftToken) {
      return -1;
    }
    if (!rightToken) {
      return 1;
    }

    if (leftToken.kind === "number" && rightToken.kind === "number") {
      if (leftToken.value !== rightToken.value) {
        return leftToken.value < rightToken.value ? -1 : 1;
      }
      continue;
    }

    if (leftToken.kind === "number" && rightToken.kind !== "number") {
      return 1;
    }
    if (leftToken.kind !== "number" && rightToken.kind === "number") {
      return -1;
    }

    if (leftToken.value !== rightToken.value) {
      return leftToken.value < rightToken.value ? -1 : 1;
    }
  }

  return 0;
}

export function maxVersion(versions: string[]): string {
  const trimmed = versions.map((value) => value.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return "";
  }
  return trimmed.reduce((currentMax, candidate) => compareVersions(candidate, currentMax) > 0 ? candidate : currentMax);
}

export function suggestNextVersion(currentMax: string): string {
  const trimmed = currentMax.trim();
  if (!trimmed) {
    return "0.0.1";
  }
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) {
    return `${trimmed}.1`;
  }
  const prefix = match[1];
  const lastNumber = match[2];
  const next = String(Number(lastNumber) + 1).padStart(lastNumber.length, "0");
  return `${prefix}${next}`;
}

type VersionToken =
  | { kind: "number"; value: number }
  | { kind: "text"; value: string };

function tokenizeVersion(input: string): VersionToken[] {
  return input
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((token) => /^\d+$/.test(token)
      ? { kind: "number", value: Number(token) }
      : { kind: "text", value: token.toLowerCase() });
}
