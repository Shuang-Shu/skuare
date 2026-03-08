import { DomainError } from "../domain/errors";

export function parseOptionValue(args: string[], option: string): string | undefined {
  const idx = args.indexOf(option);
  if (idx < 0) {
    return undefined;
  }
  const value = args[idx + 1];
  if (!value) {
    throw new DomainError("CLI_MISSING_OPTION_VALUE", `Missing value for ${option}`);
  }
  return value;
}

export function stripOptionsWithValues(args: string[], options: string[]): string[] {
  const optionSet = new Set(options);
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (optionSet.has(args[i])) {
      i += 1;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

export function parseRegexOption(args: string[]): string | undefined {
  return parseOptionValue(args, "--rgx") || parseOptionValue(args, "--regex");
}

export function stripRegexOptions(args: string[]): string[] {
  return stripOptionsWithValues(args, ["--rgx", "--regex"]);
}

export function collectPositionalArgs(
  args: string[],
  optionsWithValue: string[],
  ignoredFlags: string[] = []
): string[] {
  const optionsWithValueSet = new Set(optionsWithValue);
  const ignoredFlagsSet = new Set(ignoredFlags);
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i];
    if (optionsWithValueSet.has(value)) {
      i += 1;
      continue;
    }
    if (ignoredFlagsSet.has(value) || value.startsWith("--")) {
      continue;
    }
    out.push(value);
  }
  return out;
}
