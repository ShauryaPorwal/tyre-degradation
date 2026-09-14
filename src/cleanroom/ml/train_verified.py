"""Retrospective lap estimation; select on validation, report test once."""
import argparse
import hashlib
import json
import shutil
from datetime import datetime,timezone
import numpy as np
from cleanroom.ml.verified_dataset import read_exports,clean,features,split_sessions,root,NUMERIC,BOOLEAN,CATEGORICAL,FEATURES


def metrics(y,p):
    error=np.asarray(p)-np.asarray(y)
    if not np.isfinite(error).all(): raise ValueError('Non-finite model predictions')
    return {'mae':float(np.abs(error).mean()),'rmse':float(np.sqrt((error**2).mean())),'bias':float(error.mean())}


def train(args):
    import joblib
    import catboost
    import sklearn
    from catboost import CatBoostRegressor
    from sklearn.compose import ColumnTransformer
    from sklearn.preprocessing import OneHotEncoder
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import Ridge
    from cleanroom.ingest.export_verified import write_json
    frame,sources=read_exports()
    frame,dropped=clean(frame)
    tr,va,te=split_sessions(frame,args.validation_session,args.test_session)
    X=features(frame);y=frame.lap_time.astype(float).to_numpy()
    pre=ColumnTransformer([
        ('numeric',SimpleImputer(strategy='median',keep_empty_features=True),NUMERIC+BOOLEAN),
        ('category',OneHotEncoder(handle_unknown='ignore',sparse_output=False),CATEGORICAL),
    ])
    Xtr=pre.fit_transform(X.iloc[tr]);Xva=pre.transform(X.iloc[va])
    baseline=Ridge(alpha=10).fit(Xtr,y[tr])
    model=CatBoostRegressor(iterations=1000,depth=5,learning_rate=.04,loss_function='RMSE',random_seed=42,
                           thread_count=2,verbose=False,allow_writing_files=False)
    model.fit(Xtr,y[tr],eval_set=(Xva,y[va]),early_stopping_rounds=60,verbose=False)
    val={'CatBoost':metrics(y[va],model.predict(Xva)),'regularized_baseline':metrics(y[va],baseline.predict(Xva))}
    selected='CatBoost' if val['CatBoost']['rmse'] < val['regularized_baseline']['rmse'] else 'regularized_baseline'
    winner=model if selected=='CatBoost' else baseline
    # No test metric is inspected until after selection is locked.
    Xt=pre.transform(X.iloc[te])
    test=metrics(y[te],winner.predict(Xt))
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    model_id=f'verified_{selected.lower()}_{stamp}'
    directory=root()/'models';directory.mkdir(exist_ok=True)
    artifact={'format_version':2,'kind':selected,'model':winner,'baseline':baseline,'pre':pre,
              'features':FEATURES,'feature_defaults':{},'target':'retrospective_lap_time_s'}
    path=directory/f'{model_id}.joblib'
    joblib.dump(artifact,path)
    meta={'model_id':model_id,'trained_at':stamp,'selected':selected,'target':artifact['target'],
          'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'features':FEATURES,
          'val_metrics':val[selected],'validation_candidates':val,'test_metrics':test,
          'selection_rule':'Lowest validation RMSE; test reported only after selection.',
          'partitions':{name:sorted(frame.iloc[idx].session_id.unique().tolist()) for name,idx in [('train',tr),('validation',va),('test',te)]},
          'rows':{'train':len(tr),'validation':len(va),'test':len(te)},'dropped':dropped,'dataset_sources':sources,
          'compound_counts':{name:frame.iloc[idx].compound.value_counts().to_dict() for name,idx in [('train',tr),('validation',va),('test',te)]},
          'versions':{'catboost':catboost.__version__,'sklearn':sklearn.__version__},
          'limitations':['Same-lap speed traps: not a next-lap forecast.','No causal tyre degradation or private sensor model.',
                         'Three sessions are an initial demonstration, not broad race generalization.','Repeated tuning against test results invalidates held-out claims.']}
    write_json(directory/f'{model_id}.metadata.json',meta)
    if args.activate:
        latest=directory/'latest.json'
        if latest.exists(): shutil.copy2(latest,directory/f'latest-backup-{stamp}.json')
        write_json(latest,{'model_id':model_id})
    print(json.dumps(meta,indent=2))
    print('Activated; restart backend.' if args.activate else 'Saved candidate; active model unchanged. Use --activate on a planned training run to activate.')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--validation-session',required=True)
    p.add_argument('--test-session',required=True)
    p.add_argument('--activate',action='store_true')
    train(p.parse_args())
