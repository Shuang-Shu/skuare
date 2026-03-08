import type { Command, CommandContext } from "./types";

export class AliasCommand implements Command {
  constructor(
    readonly name: string,
    readonly description: string,
    private readonly targetFactory: () => Command,
    private readonly injectedArgs: string[] = []
  ) {}

  async execute(context: CommandContext): Promise<void> {
    const target = this.targetFactory();
    await target.execute({
      ...context,
      args: [...this.injectedArgs, ...context.args],
    });
  }
}
