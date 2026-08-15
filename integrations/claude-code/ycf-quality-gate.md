# YCF Quality Gate for Claude Code

Use the canonical workflow in `skills/ycf-quality-gate/SKILL.md` whenever the user asks to audit, clean, refactor, understand, or release this repository.

Run read-only commands first (`ycf audit .`, `ycf map .`, `ycf impact <module> .`). Explain findings and risks before proposing edits. Require explicit approval before `ycf cleanup . --yes` or any manual source change. Preserve Git checkpoints, show the diff, run verification, and report rollback if verification fails.
