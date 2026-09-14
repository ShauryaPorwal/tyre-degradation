# CLEANROOM — integrated hackathon prototype

## Easiest installation: use a separate folder

Keep your existing project as a backup. You do not need to delete it or merge dozens of files.

1. Extract this ZIP to a new folder such as `Downloads/cleanroom-final`.
2. Open the extracted folder containing `pyproject.toml` and `SETUP.cmd` in VS Code.
3. Stop your OLD backend and frontend terminals with Ctrl+C so ports 8000 and 3000 are free.
4. Double-click `SETUP.cmd`. Internet is needed once to install dependencies. This uses uv (which you already installed) and Node/npm.
5. Double-click `START-BACKEND.cmd` and keep that window open.
6. Double-click `START-FRONTEND.cmd` and keep that window open.
7. Open http://localhost:3000. API documentation is http://127.0.0.1:8000/docs.

Equivalent terminal commands, from the extracted project root:

```powershell
uv sync --python 3.12 --extra model
uv run --extra model python -m uvicorn cleanroom.serve.api:app --host 127.0.0.1 --port 8000
```

In a SECOND terminal:

```powershell
cd web
npm ci
npm run dev
```

No retraining is needed: a rebuilt model, metadata and the verified session exports are included. No API key is needed for the included historical data.

## What changed

- One session/driver/lap selection is shared by all historical pages and retained locally in your browser.
- FP1, FP2 and race exports are available in Session archive. Each export must match its provenance hash and row count. Repeated exports are deduplicated.
- Pit Wall reports actual lap data and model estimates with explicit source labels.
- Telemetry shows actual throttle/braking/speed summaries where present. Four-wheel pressure/temperature/slip/load inputs are independent, optional and labelled manual or simulated. This is an input interface, not a hardware receiver.
- Tyre curves use eligible laps through the cutoff, with separate fits per stint and compound. Negative slopes remain visible. Missing compounds are shown with zero coverage.
- Deconfounding is a sensitivity tool for fuel/track/traffic assumptions. It is NOT a proven causal wear estimator.
- Pit scenarios compare stay-out against every one-stop timing for your selected replacement compounds. All pace, slope, remaining-lap and pit-loss values are editable assumptions.
- Model & timing shows the loaded algorithm and repeated warm inference median/P95.
- Validation displays saved validation and race test metrics, session partitions and compound coverage. It never tunes on the test data.
- Demo mode offers explicitly synthetic strategy presets. It does not modify the historical exports.
- Old Live Sim points to Demo mode. Removed background animation, hardcoded weather, uptime, green-flag badges, placeholder fixture APIs and fake job IDs.

## If you insist on updating the existing folder

Back it up first. Replace `web/src` as a WHOLE, not a merge: otherwise obsolete routes/components remain. Replace `src/cleanroom` with this package's source. Replace `web/package.json`, `web/package-lock.json`, `web/tsconfig.json` and `pyproject.toml`. Copy the included models and verified data. Run setup again. Keep any additional raw caches or data outside the replaced source folders.

This package's frontend and API use the same new contracts and should be installed together. Older panels posting year/circuit fields to `/api/analyze` are not compatible with the new session-ID contract. The old `test_stint_curves.py` is replaced by the `tests` folder.

## What the model actually is

The upload contained `latest.json` but not its corresponding model binary or metadata. A new artifact was trained once using the uploaded `train_verified.py` procedure on the supplied exports: FP1 for training, FP2 for selection, race for evaluation. CatBoost and a regularized linear baseline were compared using validation RMSE. The baseline won and is included, labelled `learned_baseline`. CatBoost remains available in the training code; the interface does not falsely label a baseline prediction as CatBoost.

The model estimates completed-lap pace using same-lap speed traps. It is not a next-lap forecast. The race test has already been inspected during project development; do not describe this as a new untouched external test. This is one weekend, not broad motorsport validation. No intermediate or wet laps appear in this training set, so no wet-compound predictive accuracy is claimed.

The selected artifact is local trusted joblib output generated for this package. Only load model artifacts you trust. Python model dependencies are pinned to the versions used for this artifact.

## Important limits

The software is a working historical-analysis and scenario prototype. It does not establish true rubber wear, automatically measure fuel load, connect to car hardware, or issue validated race strategy. Missing private sensor fields remain missing. Fuel effects, track corrections and pit inputs are assumptions, not calibrated values. Weather and traffic impacts are not learned here. Before a real next-lap model, change the feature timing and validate on unseen weekends; simply moving the current same-lap model into a stream does not make it prospective.

## Adding more real data later

The exporter remains available. For example, from the project root:

```powershell
uv run --extra model python -m cleanroom.ingest.export_verified --year 2025 --round 9 --session FP3 --code ESP --circuit Barcelona
```

Click Refresh in the dashboard after an export. New valid `data/verified/*/laps.json` folders appear automatically; you do not manually move model files into `data/raw`. Exports and model training are separate operations. Keep a deliberately unseen evaluation weekend before improving/training a new model.

Optional planned training command (not required to launch this package):

```powershell
uv run --extra model python -m cleanroom.ml.train_verified --validation-session 2025_ESP_FP2 --test-session 2025_ESP_R --activate
```

Repeatedly using the same race result to choose changes invalidates an untouched-test claim.

## Checks

```powershell
uv run --extra model python -m unittest discover -s tests -v
cd web
npm run build
```

The test fixtures are controlled synthetic inputs solely for testing. They are not loaded by the dashboard. See `VERIFICATION.md` for measured results and limits.

## Troubleshooting

- Backend unavailable: run START-BACKEND and read its terminal error; check no old API occupies port 8000.
- Wrong page or stale interface: stop the old frontend; use the URL printed by the new frontend terminal.
- Missing model: keep the included `models` folder intact, with the matching metadata and latest pointer, then restart the API.
- Hash mismatch: re-export the session; do not edit the provenance hash to bypass validation.
- No fitted curve: choose a later cutoff or a different driver. Six eligible laps and four tyre ages are required within a single stint; more data is not automatically reliable data.
