# data/

- `priors.json` — hook-formula → measured retention. Starts empty; `ingest --csv` fills it.
  Read by `hooks` so A/B ranking stops being pure opinion. Entries carry `n` and are
  shrunk toward editorial seeds by `n/(n+5)` — one lucky video cannot own the channel.
- `hook-plan.json` — last plan written by `hooks` (audit trail: what we published against what).
- `metrics.example.csv` — the exact CSV shape `ingest` / `dashboard --csv` accept.
  Headers: `id,views,avg_view_sec,duration_sec[,retention_3s,formula]`.
  `formula` is optional; when absent it is read from `projects/<id>/director.json`.
