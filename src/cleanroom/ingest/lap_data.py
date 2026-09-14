"""Cached lookup with data-source integrity metadata; no fixture fallback."""
import hashlib
import json
from functools import lru_cache
from pathlib import Path


def root():
    for p in Path(__file__).resolve().parents:
        if (p/'pyproject.toml').exists(): return p
    raise FileNotFoundError('Cannot locate project root containing pyproject.toml')


def fingerprint(path):
    if not path.exists(): return None
    stat = path.stat()
    return stat.st_mtime_ns, stat.st_size


@lru_cache(maxsize=2)
def cached(path_string, data_stamp, meta_stamp):
    path = Path(path_string)
    content = path.read_bytes()
    rows = json.loads(content.decode('utf-8-sig'))
    if not isinstance(rows,list) or any(not isinstance(r,dict) for r in rows):
        raise ValueError('laps.json must contain a list of lap objects')
    sidecar = path.with_name('laps.provenance.json')
    provenance = {'status':'UNVERIFIED', 'reason':'No matching export provenance file.'}
    if sidecar.exists():
        metadata = json.loads(sidecar.read_text(encoding='utf-8'))
        matches = metadata.get('sha256') == hashlib.sha256(content).hexdigest()
        provenance = {
            'status':'FASTF1_EXPORT_HASH_MATCH' if matches and metadata.get('source')=='FASTF1' else 'UNVERIFIED',
            'sha256_matches':matches, 'source':metadata.get('source'),
            'exported_at':metadata.get('exported_at'), 'event_name':metadata.get('event_name'),
            'note':'Local provenance, not an official authenticity signature.',
        }
    return rows, provenance


def load_bundle():
    for path in (root()/'data/raw/laps.json',root()/'web/src/data/laps.json'):
        if path.exists():
            return cached(str(path),fingerprint(path),fingerprint(path.with_name('laps.provenance.json')))
    raise FileNotFoundError('No laps.json found. Export and activate a session first.')


def load_laps(): return load_bundle()[0]


def find_lap(*,year,circuit,session_type,driver,lap):
    rows, provenance = load_bundle()
    matches = [r for r in rows if str(r.get('year'))==str(year)
               and str(r.get('circuit','')).casefold()==circuit.strip().casefold()
               and str(r.get('session_type','')).upper()==session_type.strip().upper()
               and str(r.get('driver','')).upper()==driver.strip().upper()
               and r.get('lap_number')==lap]
    if len(matches)!=1:
        raise LookupError(f'Expected one lap, found {len(matches)} for {year} {circuit} {session_type} {driver} lap {lap}.')
    return {**matches[0], '_data_provenance':provenance}


def row_to_state(row):
    keys = ('stint','compound','fresh_tyre','track_temp','air_temp','rainfall','driver','team','circuit','session_type',
            'session_clock_s','speed_i1','speed_i2','speed_fl','speed_st','throttle_mean_pct','brake_time_pct',
            'speed_mean_kph','humidity_pct','wind_speed_m_s')
    state = {k:row.get(k) for k in keys}
    state.update(lap=row.get('lap_number'),tyre_age=row.get('tyre_life'))
    for wheel in ('front_left','front_right','rear_left','rear_right'):
        for signal in ('pressure_psi','temp_inner_c','temp_middle_c','temp_outer_c','wheel_slip_pct','vertical_load_n'):
            key=f'{wheel}_{signal}'
            if key in row: state[key]=row[key]
    state['sensor_source']=row.get('sensor_source','UNVERIFIED_INPUT')
    return state
