# CLEANROOM — Tech Stack & Architecture Decisions

Companion to `CLEANROOM_Project_Spec.pdf` and `CLEANROOM_Features_Roadmap.pdf`
Every technology choice, the constraint that drives it, and what was rejected.

---

## Reading guide

Each decision is stated as: **the constraint** → **the choice** → **what was rejected and why**.

Nothing here is chosen because it is popular. Every dependency must be justified by a constraint that actually exists in this project. The final stack is roughly a dozen real dependencies with no service to stand up, no cluster, no message broker, and nothing that can fail on stage.

---

# 1. Storage — the most important decision

## 1.1 The workload profile

Before choosing anything, characterise the data honestly:

| Property | Reality |
|---|---|
| Write pattern | **Write-once, read-many.** Harvest once, query thousands of times. |
| Mutation | **Zero.** Nothing is updated after ingest. |
| Concurrency | **One user, one process.** No transactions, no locking. |
| Access pattern | **Columnar analytical.** 3 columns out of 30, across 40 sessions. |
| Volume — laps | Tiny. Roughly 500k rows across four seasons. |
| Volume — telemetry | Large. Millions of rows per session across 20 drivers. |
| Referential integrity | Not required. Join keys are natural and stable. |

This is an **OLAP** profile. A row-store transactional database is the wrong tool on every single axis.

## 1.2 The choice: Parquet + DuckDB

```
data/
├── raw/
│   ├── fastf1_cache/          # FastF1 manages this. Never touch it.
│   └── openf1/                # raw JSON dumps
├── interim/
│   └── laps/year=2025/circuit=ESP/session=FP2/*.parquet
├── processed/
│   └── features/year=2025/circuit=ESP/session=FP2/*.parquet
└── manifest.json              # content hashes, provenance, harvest timestamps
```

Hive-partitioned by `year / circuit / session` so DuckDB prunes partitions before reading a single byte.

```python
import duckdb

con = duckdb.connect()
df = con.execute("""
    SELECT driver, compound, tyre_life, E_cum, lap_time, m_hat_kg, m_hat_se
    FROM 'data/processed/features/**/*.parquet'
    WHERE clean_flag
      AND compound = 'MEDIUM'
      AND year = 2025
""").df()
```

No import step. No server process. No ORM. No migrations. No schema drift.

## 1.3 Why DuckDB specifically

- **Reads Parquet natively.** Zero-copy. There is no loading phase.
- **Out-of-core execution.** Handles datasets larger than RAM transparently. This matters the moment you touch telemetry.
- **Full SQL including window functions.** You need these constantly:
  `LAG(lap_time) OVER (PARTITION BY driver, stint ORDER BY lap_number)` is half the feature engineering in this project.
- **Predicate pushdown and column pruning.** You read only the columns and partitions you asked for.
- **Zero-copy Arrow and pandas interop.** `.df()` and `.arrow()` are effectively free.
- **Embedded.** Nothing to deploy, nothing to configure, nothing to fail during a demo.

## 1.4 Rejected alternatives

| Option | Why not |
|---|---|
| **PostgreSQL** | Row-store, wrong for columnar scans. Costs a day on schema design, migrations, and ORM wiring. Requires a running server, so the demo now has a network dependency. You gain transactions, concurrency control, and constraints — you need none of the three. |
| **SQLite** | Acceptable for the lap table, poor for telemetry. Row-store, no native Parquet reading, no vectorized execution. You would end up loading everything into pandas anyway, which defeats the purpose. |
| **MongoDB** | Schemaless is the precise opposite of the requirement. This project depends on schemas being *enforced* at every write boundary. No columnar analytics. No SQL. |
| **TimescaleDB / InfluxDB** | Designed for high-frequency ingest, retention policies, and continuous aggregates on live streams. Your data is historical and static. You would pay operational cost for capabilities you never exercise. |
| **BigQuery / Snowflake** | Cloud dependency, per-query cost, network latency, and a hard external dependency during a live demo. Absurd for roughly 2 GB of data. |
| **Raw CSV** | No types, no compression, no predicate pushdown, 10–50x slower on scans, and floats do not round-trip cleanly. You will silently lose precision in the physics layer. |

## 1.5 Where a database *is* correct

Job state, if you build the on-demand fit endpoint (feature F73). One table:

```sql
CREATE TABLE jobs (
  job_id TEXT PRIMARY KEY,
  status TEXT,           -- queued | running | done | failed
  created_at TIMESTAMP,
  result_path TEXT,
  error TEXT
);
```

Use **SQLite**. Transactional, embedded, one file, zero configuration. Do not stand up PostgreSQL for one table.

## 1.6 Storage discipline

**Do not persist raw telemetry.** Persist only per-lap *derived features*, and keep raw telemetry in the FastF1 cache. If you need to recompute, recompute from cache.

This keeps `processed/` in the tens of megabytes rather than hundreds of gigabytes, and it keeps the repository small enough that a judge can actually clone it.

---

# 2. Data processing

| Layer | Choice | Reasoning |
|---|---|---|
| FastF1 boundary | **pandas** | FastF1 returns pandas DataFrames natively. Fighting that adds friction and gains nothing. |
| Aggregation, joins, group-bys | **DuckDB** | Faster than pandas, expressed in SQL, no memory blowups on telemetry-scale data. |
| Physics numerics | **numpy + scipy** | Curvature, integration, filtering, robust regression. |

### Rejected: polars

Polars is genuinely faster than pandas on telemetry-scale data. It is still the wrong call here: it is a second DataFrame API to learn under a 15-day deadline, and DuckDB already handles the heavy aggregation. Adding it optimises something that is not the bottleneck.

### The single highest-leverage line in the physics module

Use `scipy.signal.savgol_filter` for derivatives. **Never `np.diff`.**

You are computing `dv/dt` and curvature from telemetry sampled at a few Hz with real sensor noise. Naive finite differences amplify that noise into garbage and will quietly destroy both the fuel estimator (F28) and the tyre-energy integrator (F33) without producing an obvious error.

Savitzky-Golay fits a local polynomial and differentiates the polynomial, giving a smooth, physically sensible derivative.

```python
from scipy.signal import savgol_filter

# velocity in m/s on a uniform distance grid
dv_dt = savgol_filter(v, window_length=11, polyorder=3, deriv=1, delta=dt)
```

Tune `window_length` against a known-smooth reference lap before trusting it.

---

# 3. Modelling

## 3.1 Primary: NumPyro (JAX backend)

| Alternative | Why not |
|---|---|
| **Stan / CmdStanPy** | Best diagnostics available, but 30–60 second recompilation on every model change. Across 15 days of iteration that is hours lost, plus toolchain setup friction. |
| **PyMC** | Good and pythonic, but slower NUTS on hierarchical models, and the PyTensor backend can be difficult to debug under time pressure. |
| **NumPyro** | JIT-compiled NUTS, fast on CPU, uses GPU automatically if one is present, model code is plain Python. Best iteration speed per unit of correctness. |

## 3.2 Fallback: statsmodels MixedLM

Frequentist mixed-effects model. No sampler, therefore no divergences, therefore it always returns. Bootstrap for intervals.

**Build this first, on Day 9 morning.** It is the reason the project ships regardless of what the sampler does on Day 10.

## 3.3 Challenger: LightGBM

Not the main model. Run it, compare honestly, and report the result even if it wins on a metric.

## 3.4 Why not just use a neural network or gradient boosting for everything

This is the question a technical judge will ask, and the answer is the entire thesis of the project.

The brief is a **deconfounding** problem, not a prediction problem.

A gradient-boosted model will happily learn the *confounded* relationship, post an excellent in-sample MAE, and hand you a physically impossible negative degradation slope — because "lap time falls as the session progresses" is a genuine, strong pattern in the data. The model has no mechanism for knowing that fuel burn and track evolution are nuisance terms while tyre wear is the estimand.

You need a **structural model** in which each confounder is a separate, interpretable term that can be zeroed out and reasoned about. That is what makes the deconfounding waterfall possible at all. You cannot decompose a GBM prediction into "0.31 s of this was fuel, 0.06 s was track evolution."

Run LightGBM anyway (F43). Showing that you tested the obvious approach and explaining precisely why it is wrong for this problem is worth more than winning on MAE.

---

# 4. Backend

## 4.1 FastAPI + uvicorn

- **Async**, which the live replay stream requires.
- **Pydantic validation** pairs naturally with pandera schemas — one type system from ingest to API response.
- **Auto-generated OpenAPI docs at `/docs`.** This is a demo asset. Judges poking at a live, self-documenting API reads as production-grade engineering.

| Rejected | Why |
|---|---|
| **Flask** | No native async, manual validation, manual OpenAPI. |
| **Django** | ORM, admin, auth, migrations — all overhead for a read-only analytics API. |
| **Node / Express** | The entire model layer is Python. Splitting runtimes for one service adds a serialization boundary and a second deployment for zero benefit. |

## 4.2 Job handling: precompute, do not queue

Model fits take 30 seconds to a few minutes. **Precompute every session overnight into `results/` and serve static JSON.** Zero latency, zero failure modes on stage.

Add `BackgroundTasks` plus the SQLite job table only for the optional "fit a new session live" feature.

| Rejected | Why |
|---|---|
| **Redis** | Redis exists to share state across processes. You have one process. Use `functools.lru_cache` and on-disk Parquet. |
| **Celery** | Same reasoning, and it drags in a broker as a new deployment and a new failure mode. |
| **RabbitMQ / Kafka** | Not remotely applicable at this scale. |

---

# 5. Frontend

## 5.1 Next.js (App Router) + TypeScript + Tailwind

Chosen primarily because **you already move fast in it.** Fifteen days is not the time to learn a framework. That reasoning outranks any marginal technical argument.

## 5.2 Charts — this deserves real thought, because the charts are the product

| Chart | Library | Reasoning |
|---|---|---|
| Degradation curves with credible bands | **Recharts** | `<Area>` for the band plus `<Line>` for the mean. Ten minutes of work. |
| Sandbagging leaderboard | **Recharts** | Standard bar chart with error bars. |
| Live replay | **Recharts** + TanStack Query | Re-render on poll. |
| **Deconfounding waterfall** | **Hand-rolled SVG** | Do not fight Recharts into a shape it does not have. Roughly 150 lines of SVG gives total control, and this is the money shot — it must look exactly right. Good delegation target for Claude Code. |
| **Reliability diagram** | **visx** or hand-rolled SVG | Diagonal reference line, binned points, confidence ribbons. Recharts makes this awkward. |

| Rejected | Why |
|---|---|
| **Plotly** | Heavy bundle, generic default aesthetic that reads as "notebook screenshot". |
| **Chart.js** | Imperative API, awkward inside React's render model. |
| **D3 for everything** | You would lose three days to chart plumbing. Use it only where hand-rolled SVG is already the answer. |

## 5.3 State: TanStack Query only

Server state with caching, deduplication, and background refetch is 95% of what this application does.

Skip Redux entirely. Add Zustand only if genuine cross-component client state appears, which it probably will not.

---

# 6. LLM layer

**Claude API with schema-constrained output.**

The model receives typed JSON state and emits claims against a fixed schema — never free prose containing numbers. Every numeric claim is verified against model state before rendering. Anything unverified falls back to a deterministic template.

| Rejected | Why |
|---|---|
| **Local models** | Quality is insufficient for the briefing task and it adds a heavy dependency for a peripheral feature. |
| **LangChain** | You have one prompt and one verifier. A framework adds indirection and new failure modes for zero benefit. |
| **Free-text generation** | The documented failure mode is fabrication of drivers, gaps, and compounds precisely when the grounding state is sparse. Schema constraint plus verification makes you immune by construction, and that immunity is a slide in the pitch. |

---

# 7. Developer tooling

| Tool | Replaces | Reasoning |
|---|---|---|
| **uv** | pip + venv + pip-tools | 10–100x faster installs, proper lockfile, single binary. Makes "clone and run" genuinely fast for a judge. |
| **ruff** | black + flake8 + isort + pyupgrade | One tool, one config file, near-instant. |
| **pytest + hypothesis** | — | Property tests on the physics estimators: generate synthetic telemetry with known mass, assert the estimator recovers it. |
| **pandera** | — | Schema enforcement at every write. This is what makes the "fail loudly" project rule real rather than aspirational. |
| **make** | Airflow / Prefect / Dagster | The pipeline is linear and run by one person. Orchestrators solve scheduling, retries, and monitoring across teams — none of which you have. |

| Rejected | Why |
|---|---|
| **DVC** | A content-hash manifest in JSON is sufficient and adds no tool. |
| **MLflow / Weights & Biases** | Write one JSON per experiment run containing seed, config, and metrics. That *is* your ablation grid, and it is version-controlled alongside the code. |
| **Full mypy coverage** | Not worth the deadline cost. Consider typing `schemas.py` only — typed contracts, untyped internals. |

---

# 8. Deployment

| Component | Platform | Reasoning |
|---|---|---|
| Frontend | **Vercel** | Native Next.js, one command, free tier is sufficient. |
| Backend | **Railway** or **Fly.io** | Docker, one command, generous free tier. |
| **Insurance** | **`docker compose up`** | Runs everything locally with zero network access. |

The offline path is **not optional**. Venue wifi fails. Build it on Day 14 and verify it in airplane mode before you sleep.

---

# 9. The complete stack

```
INGEST      fastf1 · httpx · tenacity (backoff)
STORAGE     Parquet (pyarrow) · DuckDB · SQLite (job state only)
VALIDATE    pandera
PROCESS     pandas (boundary) · DuckDB (aggregation) · numpy · scipy
PHYSICS     scipy.signal.savgol_filter · scipy.interpolate
MODEL       NumPyro/JAX (primary) · statsmodels MixedLM (fallback)
            · LightGBM (challenger)
API         FastAPI · uvicorn · pydantic
FRONTEND    Next.js · TypeScript · Tailwind · Recharts
            · TanStack Query · hand-rolled SVG
LLM         Claude API, schema-constrained + claim verifier
TOOLING     uv · ruff · pytest · hypothesis · make
DEPLOY      Vercel + Railway · docker compose (offline fallback)
```

## 9.1 pyproject.toml

```toml
[project]
name = "cleanroom"
requires-python = ">=3.11"
dependencies = [
  "fastf1>=3.4",
  "httpx",
  "tenacity",
  "pandas",
  "pyarrow",
  "duckdb",
  "pandera",
  "numpy",
  "scipy",
  "statsmodels",
  "numpyro",
  "jax",
  "lightgbm",
  "fastapi",
  "uvicorn[standard]",
  "pydantic",
  "anthropic",
]

[project.optional-dependencies]
dev = ["pytest", "hypothesis", "ruff", "matplotlib"]

[tool.ruff]
line-length = 100
target-version = "py311"
```

## 9.2 Makefile

```make
.PHONY: harvest features model validate serve all

harvest:
	uv run python -m cleanroom.ingest.fastf1_harvest

features:
	uv run python -m cleanroom.clean.pipeline
	uv run python -m cleanroom.physics.pipeline

model:
	uv run python -m cleanroom.model.fit

validate:
	uv run python -m cleanroom.validate.run

serve:
	uv run uvicorn cleanroom.serve.api:app --reload

all: harvest features model validate

test:
	uv run pytest -q

lint:
	uv run ruff check --fix . && uv run ruff format .
```

---

# 10. The three decisions to defend in Q&A

**"Why no database?"**
Because this is a write-once analytical workload with one user and no mutation. Parquet plus DuckDB gives columnar scans, predicate pushdown, and out-of-core execution with zero operational surface. A transactional database would cost setup time and deliver slower queries on exactly the access pattern we have.

**"Why Bayesian rather than deep learning?"**
Because the task is identification, not prediction. A learned model fits the confounded relationship and produces a physically impossible negative wear slope. A structural model lets us zero out each nuisance term and decompose the result — which is what the waterfall chart is. We ran gradient boosting as a challenger; here is the comparison.

**"How do we know this is reproducible?"**
Content-hashed immutable raw store, module-level seeds, schema validation at every boundary, and `make all` from a clean clone regenerates every number in the report.

---

*Tech stack decisions v1.*
