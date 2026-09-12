.PHONY: harvest features model validate serve web fixtures test lint all

harvest:
	uv run python -m cleanroom.ingest.fastf1_harvest

model:
    uv run python -m cleanroom.ml.train

validate:
	uv run python -m cleanroom.validate.run

serve:
	uv run uvicorn cleanroom.serve.api:app --reload

web:
	cd web && npm run dev

fixtures:
	uv run python scripts/generate_fixtures.py

test:
	uv run pytest -q

lint:
	uv run ruff check --fix . && uv run ruff format .

all: harvest features model validate
