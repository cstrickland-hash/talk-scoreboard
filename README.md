# Talk Realty Monthly Scoreboard (always-on copy)

Live board: https://cstrickland-hash.github.io/talk-scoreboard/ (TV: add `?tv=1`)

- Hosted free on GitHub Pages, no office computer needed.
- `.github/workflows/refresh.yml` runs every ~10 minutes on GitHub's free runners, reads Follow Up Boss (GET only)
  with the `FUB_API_KEY` repository secret, and redeploys the page. A failed pull deploys nothing, so the last good board stays up.
- The page re-reads `data/leaderboard.json` every 30 s and shows LAST SYNC time.
- Optional: the office box pushes `ci/engine_state.json` (card counts, play log) and `data/company_calendar.json`
  when they change (`the-draw/tools/pages_push.sh`). Without it the board still runs on the last pushed copy.
- Output contains agent names, counts and points only. No lead data. The key never leaves the secret store.
