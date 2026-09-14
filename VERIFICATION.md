# Verification record

Checked on 13 September 2026 in a Linux Python 3.12 / Node 24 environment.

| Check | Result |
|---|---|
| Python calculation and FastAPI integration tests | 15 passed |
| Next.js production build, including TypeScript checking | Passed, Next.js 15.5.25 |
| Nine dashboard page HTTP checks | All returned 200 |
| Next.js proxy to FastAPI | Selected 2025 ESP race, VER lap 40 returned correctly |
| Python dependency lock resolution | Passed; uv.lock included |
| Export hashes and row counts | FP1 515, FP2 581, race 1203; all matched |
| Independent four-wheel inputs | Verified FL values do not populate FR/RL/RR |
| Invalid pressure, unavailable lap, incomplete fuel assumptions | Correctly rejected |
| Missing model | Returns unavailable, not an invented 80-second lap |
| Future lap changes | Do not change a curve fitted at an earlier cutoff |
| Browser visual/interaction automation | Not completed: Chromium download timed out |
| Windows setup scripts | Written for Windows; not executed on Windows here |

## Rebuilt model evidence

Trained once using the uploaded training procedure, without tuning changes against the race results. The old selected model binary was not supplied, so this is a newly generated artifact, not a claim to reproduce its exact file.

| Candidate | FP2 validation MAE / s | FP2 validation RMSE / s |
|---|---:|---:|
| CatBoost | 1.8741 | 4.0658 |
| Regularized baseline — selected by lowest RMSE | 2.1515 | 3.3397 |

Selected baseline race-test MAE: **1.8002 s**; RMSE: **2.2400 s**; signed bias: **−0.7357 s**.

Training: FP1, 293 clean laps. Validation: FP2, 344 clean laps. Test: race, 980 clean laps. Only soft, medium and hard are represented. These are retrospective lap-time scores on a single weekend, not tyre-wear accuracy or unseen-weekend evidence. Previous project work has already inspected this race, so the package makes no new untouched-test claim.

No minimum latency is promised. The Model page measures median/P95 on the user's machine. Its timing scope excludes network transit, cold loading and dashboard rendering. A successful HTTP response or fast inference does not establish predictive accuracy.

Implementation references: [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route), [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/).
