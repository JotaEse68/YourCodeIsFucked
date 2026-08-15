# Agent adapters

YCF keeps one canonical workflow in [`skills/ycf-quality-gate`](../skills/ycf-quality-gate). The files in this directory are short adapters for agents that use repository instructions instead of Codex skills:

- `claude-code/ycf-quality-gate.md`
- `cursor/ycf-quality-gate.md`
- `copilot/ycf-quality-gate.md`

Copy the adapter into the instruction location used by your agent, preserving the link to the canonical skill when possible. The adapter is only a bridge; update the canonical skill when safety rules change.
