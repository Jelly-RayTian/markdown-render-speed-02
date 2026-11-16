An optimized fork of marked 18.1.3 for the [make.fun Markdown rendering competition](https://make.fun/bounty/markdown-render-speed-02).

[![make.fun · markdown-render-speed-02](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![rank](https://make.fun/badge/markdown-render-speed-02/Jelly-RayTian/markdown-render-speed-02/rank.svg)](https://make.fun/bounty/markdown-render-speed-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)
[![reward](https://make.fun/badge/markdown-render-speed-02/Jelly-RayTian/markdown-render-speed-02/reward.svg)](https://make.fun/bounty/markdown-render-speed-02?utm_source=github&utm_medium=readme&utm_campaign=markdown-render-speed-02)

`parse.js` exports dependency-free `parse(markdown)` with marked's default HTML behavior. `main.ts` renders `/input/cases.json` to `/output/html.json` on Node 22. Optimizations reduce list scanning and avoid impossible inline tokenizer work. MIT licensed; see LICENSE and NOTICE.
