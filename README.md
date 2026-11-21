[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Aboys25/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Aboys25/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# Read broken CSV files faster

`solve.js` is a dependency-free ES module whose `run(input)` returns
exactly what csv-reader 1.0.0 returns for every case: csv-reader's
reading of `{text, header}` as `{columns, rows, errors}`. `main.ts`
reads every case from `/input/cases.json`, answers each with `run`,
and writes `/output/answers.json`. Locally verified on the practice
set: 6/6 cases pass, answers byte-identical across runs, and the
parser runs ~4.9x faster than the csv-reader 1.0.0 baseline on
`run()` CPU time.

make.fun entry for
[csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121).
