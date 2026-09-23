# Generated API instructions

- Regenerate resources through Actions and review the resulting artifact before committing it.
- Preserve all six source sections, category ordering, empty shards, stable symbol IDs, aggregate
  counts, and exact upstream commit/line provenance. Do not execute upstream source material.
- Set documentation state from the presence of source Markdown. Keep layout metadata independent
  of narrative text. Unsupported nonempty RST must fail with a useful source location.
- Use the manifest's pinned revision for reproducible verification. A refresh to a new revision is
  an explicit generated-data change. Do not refresh unrelated Lua/LuaJIT content during EEex work;
  those inputs are pinned in `packages/tools/upstream-pins.json` and move only as their own change.
- Keep hover text exactly as published. Do not substitute characters, invent parameter names, or
  leave links that cannot be followed from an editor; `tests/hover-fidelity.json` pins examples.
- Exclude local game files from commits and release archives. Use synthetic fixtures in CI.
