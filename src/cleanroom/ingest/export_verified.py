"""Export one FastF1 session with provenance. No synthetic values or auto-training."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def repo_root():
    for path in Path(__file__).resolve().parents:
        if (path / 'pyproject.toml').is_file():
            return path
    raise RuntimeError('Cannot find pyproject.toml above this file.')


def numeric(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def seconds(value):
    return numeric(value.total_seconds()) if hasattr(value, 'total_seconds') else None


def boolean(value):
    if value is None or str(value) in ('nan', 'NaT', '<NA>'):
        return None
    if str(value).lower() in ('true', '1'): return True
    if str(value).lower() in ('false', '0'): return False
    return None


def string(value):
    return None if value is None or str(value) in ('nan', 'NaT', '<NA>') else str(value)


def write_json(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(content, ensure_ascii=False, allow_nan=False, indent=2).encode('utf-8')
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix='.tmp')
    try:
        with os.fdopen(fd, 'wb') as f: f.write(payload)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)


def telemetry_summary(lap):
    import numpy as np
    car = lap.get_car_data().sort_values('Time').drop_duplicates('Time')
    if len(car) < 2: return {'status': 'UNAVAILABLE', 'samples': len(car)}
    times = car['Time'].dt.total_seconds().to_numpy(dtype=float)
    durations = np.diff(times)
    valid_dt = np.isfinite(durations) & (durations > 0)
    result = {'status': 'AVAILABLE', 'samples': len(car), 'method': 'Time-weighted sample hold; brake is binary, not pedal pressure.'}
    for col, name, factor in [('Throttle', 'throttle_mean_pct', 1), ('Brake', 'brake_time_pct', 100), ('Speed', 'speed_mean_kph', 1)]:
        if col not in car: continue
        values = car[col].to_numpy(dtype=float)[:-1]
        mask = valid_dt & np.isfinite(values)
        result[name] = float(np.average(values[mask], weights=durations[mask]) * factor) if mask.any() else None
    return result


def export_session(args):
    import fastf1
    root = repo_root()
    cache = root / 'data/raw/fastf1_cache'
    cache.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(cache))
    session = fastf1.get_session(args.year, args.round, args.session)
    session.load(telemetry=args.telemetry, weather=True, messages=True)
    laps = session.laps
    if laps is None or laps.empty: raise RuntimeError('FastF1 returned no laps. Existing dataset unchanged.')
    weather_errors = []
    try:
        weather = laps.get_weather_data()
        if len(weather) != len(laps): raise ValueError('Weather/lap row count differs')
    except Exception as exc:
        weather = None
        weather_errors.append(str(exc))
    session_id = f'{args.year}_{args.code}_{args.session}'
    rows, failures = [], []
    for i, (_, lap) in enumerate(laps.iterrows()):
        lap_number = numeric(lap.get('LapNumber'))
        driver = string(lap.get('Driver'))
        if lap_number is None or not driver:
            failures.append({'row': i, 'reason': 'Missing lap number or driver'}); continue
        w = weather.iloc[i] if weather is not None else {}
        row = {
            'session_id': session_id, 'year': args.year, 'circuit': args.circuit,
            'session_type': args.session, 'driver': driver,
            'driver_number': numeric(lap.get('DriverNumber')), 'team': string(lap.get('Team')),
            'lap_number': int(lap_number), 'stint': numeric(lap.get('Stint')),
            'compound': string(lap.get('Compound')), 'tyre_life': numeric(lap.get('TyreLife')),
            'fresh_tyre': boolean(lap.get('FreshTyre')), 'lap_time': seconds(lap.get('LapTime')),
            's1': seconds(lap.get('Sector1Time')), 's2': seconds(lap.get('Sector2Time')), 's3': seconds(lap.get('Sector3Time')),
            'pit_in': seconds(lap.get('PitInTime')) is not None,
            'pit_out': seconds(lap.get('PitOutTime')) is not None,
            'track_status': string(lap.get('TrackStatus')), 'is_accurate': boolean(lap.get('IsAccurate')),
            'deleted': boolean(lap.get('Deleted')),
            'session_clock_s': seconds(lap.get('Time')),
            'track_temp': numeric(w.get('TrackTemp')), 'air_temp': numeric(w.get('AirTemp')),
            'rainfall': boolean(w.get('Rainfall')), 'humidity_pct': numeric(w.get('Humidity')),
            'wind_speed_m_s': numeric(w.get('WindSpeed')),
            'data_source': 'FASTF1',
        }
        for source, target in [('SpeedI1','speed_i1'), ('SpeedI2','speed_i2'), ('SpeedFL','speed_fl'), ('SpeedST','speed_st')]:
            row[target] = numeric(lap.get(source))
        if args.telemetry:
            try:
                summary = telemetry_summary(lap)
                row.update({k:v for k,v in summary.items() if k in ('throttle_mean_pct','brake_time_pct','speed_mean_kph')})
                row['telemetry_summary'] = summary
            except Exception as exc:
                row['telemetry_summary'] = {'status':'UNAVAILABLE', 'reason':str(exc)}
                failures.append({'driver':driver, 'lap':int(lap_number), 'reason':str(exc)})
        rows.append(row)
    if not rows: raise RuntimeError('No usable lap identities. Existing dataset unchanged.')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    folder = root / 'data/verified' / f'{session_id}_{stamp}'
    out = folder / 'laps.json'
    write_json(out, rows)
    meta = {
        'schema_version':1, 'source':'FASTF1', 'fastf1_version':fastf1.__version__,
        'exported_at':stamp, 'session_id':session_id, 'requested_year':args.year, 'requested_round':args.round,
        'event_name':string(session.event.get('EventName')), 'event_location':string(session.event.get('Location')),
        'session_name':string(session.name), 'circuit_label':args.circuit,
        'row_count':len(rows), 'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),
        'weather_errors':weather_errors, 'row_or_telemetry_errors':failures,
        'provenance_note':'Exported through FastF1 using its upstream/local cache. Hash verifies local file integrity, not an FIA signature.',
        'missing_private_channels':['fuel_kg','tyre_pressures','tyre_surface_temperatures','tyre_carcass_temperatures'],
    }
    write_json(folder/'laps.provenance.json',meta)
    print(f'Exported {len(rows)} rows to {out}')
    if args.activate:
        target = root/'data/raw/laps.json'
        sidecar = root/'data/raw/laps.provenance.json'
        if target.exists() or sidecar.exists():
            backup = root/'data/backups'/stamp
            backup.mkdir(parents=True, exist_ok=True)
            for old in (target,sidecar):
                if old.exists(): shutil.copy2(old,backup/old.name)
            print(f'Previous active data backed up to {backup}')
        write_json(target,rows)
        write_json(sidecar,meta)
        print('Activated dataset. Restart backend. Existing trained model is unchanged.')
    print('Tyre sensors and fuel are not fabricated. ML training is not run by this command.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--year', type=int, required=True)
    parser.add_argument('--round', type=int, required=True)
    parser.add_argument('--session', choices=['FP1','FP2','FP3','Q','R'], default='FP2')
    parser.add_argument('--code', required=True, help='Three-letter application event code, e.g. ESP')
    parser.add_argument('--circuit', required=True, help='Application label, e.g. Barcelona')
    parser.add_argument('--telemetry', action='store_true')
    parser.add_argument('--activate', action='store_true', help='Back up and replace active laps.json after successful export')
    args = parser.parse_args()
    if len(args.code)!=3 or not args.code.isalpha() or not args.code.isupper(): parser.error('--code must have three uppercase letters')
    if args.round < 1: parser.error('--round must be positive')
    export_session(args)


if __name__ == '__main__': main()
