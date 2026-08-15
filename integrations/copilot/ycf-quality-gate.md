# YCF Quality Gate for GitHub Copilot

Use `skills/ycf-quality-gate/SKILL.md` as the repository quality policy. In chat or code review, recommend `ycf audit .`, `ycf map .`, and `ycf impact <module> .` before suggesting edits. Classify findings as safe, review-only, or architectural. Never apply cleanup or refactoring without user approval, a Git checkpoint, a visible diff, and post-change verification.
