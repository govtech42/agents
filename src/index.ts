import { Command, Option } from "commander";
import pc from "picocolors";
import { install } from "./cli/install.js";
import { list } from "./cli/list.js";
import { doctor } from "./cli/doctor.js";
import { uninstall } from "./cli/uninstall.js";
import { FlagError } from "./cli/flags.js";
import { PlanError } from "./core/compose.js";

const program = new Command();

program
  .name("aai")
  .description(
    "Unified Docker installer for personal AI agents (OpenClaw, Hermes, Paperclip) with optional GBrain memory, local or remote over SSH.",
  )
  .version("1.0.0");

/** Attach the shared remote-target options to a command. */
function withTargetOptions(cmd: Command): Command {
  return cmd
    .option("--remote", "install on a remote server over SSH (prompts for / picks a target)")
    .option("--target <label>", "use a saved remote target (targets/<label>.env)")
    .option("--host <host>", "remote host / IP (ad-hoc target)")
    .option("--user <user>", "remote SSH user")
    .option("--key <path>", "path to the SSH private key")
    .option("--port <port>", "SSH port (default 22)")
    .option("--remote-dir <dir>", "remote install directory (default ~/aai)")
    .addOption(
      new Option("--sudo <mode>", "use sudo for docker on the remote").choices([
        "auto",
        "always",
        "never",
      ]),
    )
    .option("--label <name>", "label to save an ad-hoc target under");
}

withTargetOptions(
  program
    .command("install", { isDefault: true })
    .description("Install agents (interactive by default, or via flags; local or remote).")
    .option("--agents <ids>", "comma-separated agent ids (e.g. hermes,openclaw)")
    .option("--extras <pairs>", "comma-separated agent:extra pairs (e.g. hermes:gbrain)")
    .option("--dry-run", "print the compose file and commands without writing or running")
    .option("--yes", "skip the confirmation prompt"),
).action(async (opts) => {
  await install(opts);
});

withTargetOptions(
  program
    .command("list")
    .description("List available agents and extras, with install status (local or remote)."),
).action(async (opts) => {
  await list(opts);
});

withTargetOptions(
  program
    .command("doctor")
    .description("Check the Docker environment (local, or a remote target via SSH)."),
).action(async (opts) => {
  await doctor(opts);
});

withTargetOptions(
  program
    .command("uninstall <agent>")
    .description("Remove an installed agent (optionally its volume data); local or remote.")
    .option("--volumes", "also delete the agent's persisted data (destructive)")
    .option("--dry-run", "print the commands without writing or running")
    .option("--yes", "skip the confirmation prompt"),
).action(async (agent, opts) => {
  await uninstall(agent, opts);
});

main();

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof FlagError || err instanceof PlanError) {
      console.error(pc.red(`Error: ${err.message}`));
      process.exitCode = 1;
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(pc.red(`Error: ${message}`));
    process.exitCode = 1;
  }
}
