# markdown-render-speed-02 entry

[![make.fun · markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/Jelly-RayTian/markdown-render-speed-02/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/Jelly-RayTian/markdown-render-speed-02/reward.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)

An optimized fork of [marked](https://github.com/markedjs/marked) 18.1.3, built for the make.fun competition
[markdown-render-speed-02](https://make.fun/bounty/markdown-render-speed-02). `parse(markdown)` in `parse.js`
returns the same HTML that `marked.parse(markdown)` returns with marked's default options, using less CPU.

- `parse.js`: a dependency-free ES module, a gfm-only specialization of marked with a fused inline lexer and
  renderer, first-character dispatch for block and inline rules, a setext-heading prefilter, a lazy
  emphasis mask, and link and text fast paths. See `NOTICE` for the full list of changes.
- `main.ts`: the driver run as `node /bot/main.ts`. It reads `/input/cases.json` and writes `/output/html.json`.

Licensed under MIT, as marked is (see `LICENSE` and `NOTICE`).
