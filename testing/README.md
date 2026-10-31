# Performance checks

These scripts use the service running locally at `http://localhost:3000` by default.
Set `BASE_URL` to target another deployment.

1. Generate a pool of redirect links (this setup run is not part of the measured baseline):

   ```sh
   npm run data:generate
   ```

   `COUNT` defaults to 1,000. Successful records are written to `testing/links.csv`;
   failed requests are recorded separately in `testing/links.failures.csv`.

2. Run the 1 RPS baseline with k6:

   ```sh
   K6_SUMMARY_TREND_STATS='avg,min,med,max,p(90),p(95),p(99)' \
     k6 run --summary-export testing/results-summary.json testing/baseline.js
   ```

   Set `DURATION` to change the default five-minute measurement window, and
   `LINKS_CSV` to use a different input file (relative paths are resolved from
   `testing/`; absolute paths are also accepted). The arrival-rate executor schedules
   one request per second; one creation is scheduled for every 20 scenario
   iterations (approximately 95% redirects and 5% creations). Review the
   observed mix and request rate in the k6       output. Redirects are not followed. `med` is P50; the configured trend
   statistics include P90 and P99. The summary JSON is written to
   `testing/results-summary.json` for later review.
   The report includes P50/P90/P99 latency
   trends, successful request counts, endpoint errors, and dropped iterations.
   Thresholds enforce redirect P90 < 100 ms, creation P90 < 500 ms, and error
   rates below 1%.

3. Check that creation and click events reach the graph within the 30-second
   freshness target:

   ```sh
   npm run test:freshness
   ```

   Set `FRESHNESS_TIMEOUT_MS` to override the default 30-second deadline. Run
   this check while the service is under load to measure freshness during a
   baseline run.
