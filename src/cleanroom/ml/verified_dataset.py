"""Verified export loading, canonical features and disjoint session splits."""
import hashlib
import json
from pathlib import Path
import numpy as np
import pandas as pd

NUMERIC = ['tyre_life','stint','lap_number','session_clock_s','track_temp','air_temp',
           'speed_i1','speed_i2','speed_fl','speed_st']
BOOLEAN = ['fresh_tyre','rainfall']
CATEGORICAL = ['compound','driver','team','circuit','session_type']
FEATURES = NUMERIC + BOOLEAN + CATEGORICAL
COMPOUNDS = {'SOFT','MEDIUM','HARD','INTERMEDIATE','WET'}


def root():
    for path in Path(__file__).resolve().parents:
        if (path/'pyproject.toml').exists(): return path
    raise RuntimeError('Cannot locate pyproject.toml')


def read_exports(directory=None):
    directory = Path(directory) if directory else root()/'data/verified'
    selected = {}
    for path in sorted(directory.glob('*/laps.json')):
        meta_path = path.with_name('laps.provenance.json')
        if not meta_path.exists(): raise ValueError(f'Missing provenance: {path}')
        content = path.read_bytes()
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
        if meta.get('source') != 'FASTF1' or meta.get('sha256') != hashlib.sha256(content).hexdigest():
            raise ValueError(f'Provenance/hash mismatch: {path}. Re-export; do not bypass this check.')
        rows = json.loads(content)
        sid = meta.get('session_id')
        if not isinstance(rows,list) or not rows or any(r.get('session_id')!=sid for r in rows):
            raise ValueError(f'Invalid or mixed session export: {path}')
        # Use latest export per session so repeated downloads never duplicate laps.
        if sid not in selected or meta.get('exported_at','') > selected[sid][0].get('exported_at',''):
            selected[sid] = (meta, rows, path)
    if not selected: raise ValueError('No verified exports. Run ingest.export_verified first.')
    rows, sources = [], []
    for meta, data, path in selected.values():
        rows.extend(data)
        sources.append({'session_id':meta['session_id'],'sha256':meta['sha256'],'path':str(path)})
    frame = pd.DataFrame(rows)
    if frame.duplicated(['session_id','driver','lap_number']).any():
        raise ValueError('Duplicate lap identities inside export.')
    return frame, sources


def features(frame):
    result = pd.DataFrame(index=frame.index)
    for key in NUMERIC:
        result[key] = pd.to_numeric(frame.get(key,pd.Series(np.nan,index=frame.index)),errors='coerce').replace([np.inf,-np.inf],np.nan)
    for key in BOOLEAN:
        values = frame.get(key,pd.Series(None,index=frame.index,dtype=object))
        result[key] = values.map(lambda x: 1.0 if x is True or str(x).lower()=='true' else 0.0 if x is False or str(x).lower()=='false' else np.nan)
    for key in CATEGORICAL:
        result[key] = frame.get(key,pd.Series('UNKNOWN',index=frame.index)).fillna('UNKNOWN').astype(str)
    result['compound'] = result['compound'].str.upper().replace({'INTER':'INTERMEDIATE'})
    return result[FEATURES]


def clean(frame):
    frame = frame.copy()
    required = ['lap_time','is_accurate','pit_in','pit_out','track_status','compound','tyre_life','lap_number']
    missing = [k for k in required if k not in frame]
    if missing: raise ValueError(f'Missing required columns: {missing}')
    kept = pd.Series(True,index=frame.index)
    counts = {'total_in':len(frame)}
    checks = {
        'invalid_target': ~pd.to_numeric(frame.lap_time,errors='coerce').between(30,300),
        'not_accurate': ~frame.is_accurate.eq(True),
        'pit_or_unknown': ~frame.pit_in.eq(False) | ~frame.pit_out.eq(False),
        'not_green': frame.track_status.astype(str).ne('1'),
        'deleted': frame.get('deleted',pd.Series(False,index=frame.index)).eq(True),
        'unknown_compound': ~frame.compound.astype(str).str.upper().replace({'INTER':'INTERMEDIATE'}).isin(COMPOUNDS),
        'invalid_age': ~pd.to_numeric(frame.tyre_life,errors='coerce').ge(0),
        'invalid_lap': ~pd.to_numeric(frame.lap_number,errors='coerce').ge(1),
    }
    for name,bad in checks.items():
        counts[name]=int((kept & bad).sum());kept &= ~bad
    frame=frame.loc[kept].reset_index(drop=True)
    counts['total_kept']=len(frame)
    return frame,counts


def split_sessions(frame,validation_session,test_session):
    if validation_session == test_session: raise ValueError('Validation and test must differ.')
    groups = frame.session_id
    masks = [~groups.isin([validation_session,test_session]),groups.eq(validation_session),groups.eq(test_session)]
    indices=[np.flatnonzero(mask) for mask in masks]
    if any(len(i)<20 for i in indices):
        raise ValueError('Need at least 20 clean laps in EACH train, validation and test partition. Collect at least three sessions.')
    return indices
