"""CLEANROOM historical analysis API. No synthetic fixture fallbacks."""
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Literal
import math
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict
from cleanroom.serve.repository import repository
from cleanroom.ml.verified_dataset import root
from cleanroom.ml.infer import get_predictor
from cleanroom.ml.stint_curves import analyse
from cleanroom.ml.scenarios import decompose, strategy
from cleanroom.ml.validation_report import build_report
from cleanroom.ml.analysis import analyse_state, result_dict, WHEELS, SIGNALS
from cleanroom.ingest.lap_data import row_to_state


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid',allow_inf_nan=False)


class Selection(Strict):
    session_id: str = Field(min_length=1,max_length=80)
    driver: str = Field(min_length=1,max_length=8)
    lap: int = Field(ge=1,le=1000)


class Wheel(Strict):
    pressure_psi: float | None = Field(default=None,ge=0,le=200)
    temp_inner_c: float | None = Field(default=None,ge=-100,le=500)
    temp_middle_c: float | None = Field(default=None,ge=-100,le=500)
    temp_outer_c: float | None = Field(default=None,ge=-100,le=500)
    wheel_slip_pct: float | None = Field(default=None,ge=-1000,le=1000)
    vertical_load_n: float | None = Field(default=None,ge=0,le=1000000)


class Sensors(Strict):
    source: Literal['MANUAL','SIMULATED'] = 'MANUAL'
    captured_at: datetime | None = None
    front_left: Wheel = Field(default_factory=Wheel)
    front_right: Wheel = Field(default_factory=Wheel)
    rear_left: Wheel = Field(default_factory=Wheel)
    rear_right: Wheel = Field(default_factory=Wheel)


class ReportRequest(Selection):
    sensors: Sensors | None = None


class CurveRequest(Selection):
    fuel_burn_kg_per_lap: float | None = Field(default=None,ge=0,le=20)
    fuel_effect_s_per_kg: float | None = Field(default=None,ge=0,le=2)


class DecomposeRequest(Selection):
    fuel_burn_kg_per_lap: float = Field(default=0,ge=0,le=20)
    fuel_effect_s_per_kg: float = Field(default=0,ge=0,le=2)
    track_gain_s_per_lap: float = Field(default=0,ge=-5,le=5)
    traffic_penalty_s: float = Field(default=0,ge=0,le=60)


Compound = Literal['SOFT','MEDIUM','HARD','INTERMEDIATE','WET']


class Candidate(Strict):
    compound: Compound
    fresh_pace_s: float = Field(ge=30,le=300)
    degradation_s_per_lap: float = Field(ge=-2,le=2)


class StrategyRequest(Strict):
    current_lap: int = Field(ge=1,le=1000)
    remaining_laps: int = Field(ge=1,le=100)
    current_pace_s: float = Field(ge=30,le=300)
    current_degradation_s_per_lap: float = Field(ge=-2,le=2)
    pit_loss_s: float = Field(ge=0,le=180)
    candidates: list[Candidate] = Field(min_length=1,max_length=5)


class BenchmarkRequest(Selection):
    repetitions: int = Field(default=30,ge=5,le=100)


@asynccontextmanager
async def lifespan(app):
    repository.refresh()
    get_predictor()  # artifact loaded once before requests; not per render
    yield


app = FastAPI(title='CLEANROOM API',version='1.0.0',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=['http://localhost:3000','http://localhost:3001','http://localhost:3100'],allow_methods=['GET','POST'],allow_headers=['Content-Type'])


def session(sid):
    try: return repository.get(sid)
    except LookupError as exc: raise HTTPException(404,str(exc)) from exc


def selected(req):
    s=session(req.session_id)
    row=s['index'].get((req.driver.strip().upper(),req.lap))
    if row is None: raise HTTPException(404,'Selected driver/lap not found in this session.')
    return s,row


@app.get('/api/health')
def health():
    return {'status':'ok','mode':'HISTORICAL_EXPORTS','hardware_connected':False}


@app.get('/api/catalog')
def catalog(): return repository.catalog()


@app.get('/api/ml/status')
def status():
    p=get_predictor()
    return {'available':p.available,'model_id':p.model_id,'algorithm':p.metadata.get('selected'),
            'load_error':p.load_error,'target':'Retrospective lap-time estimate; same-lap speed inputs'}


@app.get('/api/ml/validation-report')
def validation(): return build_report(get_predictor(),root()/'models')


@app.post('/api/analyze')
def report(req: ReportRequest):
    started=time.perf_counter()
    s,row=selected(req)
    state=row_to_state(row)
    sensor_age=None
    if req.sensors:
        state['sensor_source']=req.sensors.source
        for wheel in WHEELS:
            for key,value in getattr(req.sensors,wheel).model_dump().items(): state[f'{wheel}_{key}']=value
        captured=req.sensors.captured_at
        if captured:
            if captured.tzinfo is None: raise HTTPException(422,'Sensor timestamp must include timezone.')
            sensor_age=(datetime.now(timezone.utc)-captured).total_seconds()
            if sensor_age < -5: raise HTTPException(422,'Sensor timestamp is in the future.')
    p=get_predictor().predict(state)
    curves=analyse(s['rows'],req.session_id,req.driver,req.lap)
    result={**result_dict(analyse_state(state,p.predicted_lap_time_s)),
            'selection':req.model_dump(exclude={'sensors'}),'source_row':row,'provenance':s['provenance'],
            'prediction':asdict(p),'curves':curves,
            'sensor_context':{'hardware_connected':False,'age_seconds':sensor_age,
                              'timestamp_status':'NOT_SUPPLIED' if sensor_age is None else 'INPUT_TIMESTAMP',
                              'note':'Manual/simulated readings are not historical tyre measurements or trained model features.'},
            'processing_time_ms':round((time.perf_counter()-started)*1000,3)}
    return result


@app.post('/api/tyre-curves')
def curves(req: CurveRequest):
    s,_=selected(req)
    try:
        return {**analyse(s['rows'],req.session_id,req.driver,req.lap,req.fuel_burn_kg_per_lap,req.fuel_effect_s_per_kg),'provenance':s['provenance']}
    except ValueError as exc: raise HTTPException(422,str(exc)) from exc


@app.post('/api/decompose')
def decomposition(req: DecomposeRequest):
    s,_=selected(req)
    return decompose(s['rows'],req.session_id,req.driver,req.lap,req.fuel_burn_kg_per_lap,
                     req.fuel_effect_s_per_kg,req.track_gain_s_per_lap,req.traffic_penalty_s)


@app.post('/api/strategy')
def pit_strategy(req: StrategyRequest):
    candidates=[c.model_dump() for c in req.candidates]
    if len({c['compound'] for c in candidates}) != len(candidates): raise HTTPException(422,'Each compound must be unique.')
    # Reject implausible extrapolated pace instead of emitting a negative race time.
    sequences=[(req.current_pace_s,req.current_degradation_s_per_lap)]+[(c['fresh_pace_s'],c['degradation_s_per_lap']) for c in candidates]
    if any(not 30 <= pace+deg*(req.remaining_laps-1) <= 300 for pace,deg in sequences):
        raise HTTPException(422,'These slopes extrapolate beyond the supported 30–300 s lap-time range.')
    return strategy(req.current_lap,req.remaining_laps,req.current_pace_s,req.current_degradation_s_per_lap,req.pit_loss_s,candidates)


@app.post('/api/benchmark')
def benchmark(req: BenchmarkRequest):
    _,row=selected(req)
    state=row_to_state(row);p=get_predictor()
    warm=p.predict(state)
    if warm.model_id is None: raise HTTPException(409,'Load a trained model before benchmarking prediction.')
    samples=[];sources={}
    for _ in range(req.repetitions):
        t=time.perf_counter();r=p.predict(state);samples.append((time.perf_counter()-t)*1000)
        sources[r.source]=sources.get(r.source,0)+1
    samples.sort()
    return {'repetitions':len(samples),'median_ms':samples[len(samples)//2],
            'p95_ms':samples[math.ceil(len(samples)*.95)-1], 'min_ms':samples[0],'max_ms':samples[-1],
            'model_id':warm.model_id,'sources':sources,
            'scope':'Warm single-row inference, sequential calls in one backend process. Excludes HTTP, data loading, cold model load and dashboard rendering.'}
