"""Load local artifacts once per process; support legacy and verified v2 models."""
from dataclasses import dataclass
from pathlib import Path
from typing import Any
import hashlib
import json
import re
import numpy as np
import pandas as pd
from cleanroom.ml.verified_dataset import root,features


@dataclass
class MLResult:
    predicted_lap_time_s: float | None
    source: str
    model_id: str | None
    reason: str | None
    features_used: dict


def finite(value,default=None):
    try:
        n=float(value)
        return n if np.isfinite(n) else default
    except (TypeError,ValueError):return default


class LapTimePredictor:
    def __init__(self,models_dir=None):
        self._artifact=None;self._meta={};self._load_error=None;self.model_id=None
        try:
            directory=Path(models_dir) if models_dir else root()/'models'
            if models_dir is None and not (directory/'latest.json').exists():
                from cleanroom import config
                directory=config.REPO_ROOT/'models'
            model_id=json.loads((directory/'latest.json').read_text())['model_id']
            if not re.fullmatch(r'[A-Za-z0-9_-]+',model_id):raise ValueError('Invalid model ID')
            path=directory/f'{model_id}.joblib'
            meta_path=directory/f'{model_id}.metadata.json'
            meta=json.loads(meta_path.read_text()) if meta_path.exists() else {}
            if meta.get('sha256') and hashlib.sha256(path.read_bytes()).hexdigest()!=meta['sha256']:
                raise ValueError('Model file hash differs from metadata')
            import joblib
            artifact=joblib.load(path) # Only load artifacts produced by your trusted training code.
            if not isinstance(artifact,dict):raise ValueError('Unsupported artifact')
            self._artifact=artifact;self._meta=meta;self.model_id=model_id
        except Exception as exc:self._load_error=f'{type(exc).__name__}: {exc}'

    @property
    def available(self):
        return self._artifact is not None and self._artifact.get('model') is not None

    @property
    def load_error(self):return self._load_error

    @property
    def metadata(self):return self._meta

    def predict(self,state:dict[str,Any]):
        state=state if isinstance(state,dict) else {}
        age=finite(state.get('tyre_age',state.get('tyre_life')),0)
        prior=80+.06*min(max(age,0),200)
        used={}
        try:
            lap=finite(state.get('lap'))
            if lap is None or lap<1 or not state.get('compound') or age<0:
                raise ValueError('Missing or invalid lap, compound or tyre age')
            if finite(state.get('tyre_age',state.get('tyre_life'))) is None:
                raise ValueError('Tyre age is required')
            if self._artifact is None:raise ValueError(self._load_error or 'Model unavailable')
            frame=features(pd.DataFrame([{**state,'tyre_life':age,'lap_number':lap}]))
            artifact=self._artifact
            if artifact.get('format_version')==2:
                X=artifact['pre'].transform(frame)
                pred=float(np.asarray(artifact['model'].predict(X)).reshape(-1)[0])
                source='ml' if artifact['kind']=='CatBoost' else 'learned_baseline'
                reason=None if source=='ml' else 'Regularized baseline selected on validation; not a physics model.'
            else:
                # Preserve feature vocabulary/preprocessing for already-trained legacy artifacts.
                frame['compound']=frame['compound'].replace({'INTERMEDIATE':'INTER'})
                fitted=artifact.get('model')
                if fitted is not None:
                    pred=float(np.asarray(fitted['model'].predict(fitted['pre'].transform(frame))).reshape(-1)[0])
                    source='ml';reason='Legacy artifact: training data/evaluation may be unverified.'
                else:
                    b=artifact['baseline']
                    pred=b['intercept']+b['deg_per_lap']*(age-b['ref_age'])+b['stint_effect']*finite(state.get('stint'),1)
                    source='deterministic_baseline';reason='Legacy fitted baseline.'
            used={k:(None if pd.isna(v) else v) for k,v in frame.iloc[0].to_dict().items()}
            if not np.isfinite(pred) or not 30<=pred<=300:raise ValueError('Model prediction outside supported lap-time band')
            return MLResult(pred,source,self.model_id,reason,used)
        except Exception as exc:
            return MLResult(None,'unavailable',None,str(exc),used)


_predictor=None
def get_predictor():
    global _predictor
    if _predictor is None:_predictor=LapTimePredictor()
    return _predictor


def predict_lap_time(state):return get_predictor().predict(state)
