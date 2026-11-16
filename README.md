# markdown-render-speed-02 entry: a faster marked

[![make.fun · markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/Jelly-RayTian/markdown-render-speed-02/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/Jelly-RayTian/markdown-render-speed-02/reward.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)

An optimized fork of [marked](https://github.com/markedjs/marked) 18.1.3 for the make.fun bounty
[markdown-render-speed-02](https://make.fun/bounty/markdown-render-speed-02).
`parse(markdown)` in `parse.js` returns exactly the HTML that `marked.parse(markdown)` returns with
marked's default options (GFM on), with less CPU time. It has no dependencies.

- `parse.js`: the parser, a dependency-free ES module specialized to marked's defaults.
- `main.ts`: the driver. It reads `/input/cases.json`, renders each case and writes `/output/html.json`.

What changed relative to marked is listed in `NOTICE`. Licence: MIT (see `LICENSE`).
