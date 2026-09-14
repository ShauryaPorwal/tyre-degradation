"""Display saved evaluation evidence without re-fitting or reusing the test set."""
import json
import math

PARTITIONS = ('train', 'validation', 'test')
COMPOUNDS = ('SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET')


def mapping(value):
    return value if isinstance(value, dict) else {}


def metric(value):
    if isinstance(value, bool): return None
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError): return None


def count(value):
    number = metric(value)
    return int(number) if number is not None and number >= 0 and number.is_integer() else None


def scores(value):
    value = mapping(value)
    result = {key: metric(value.get(key)) for key in ('mae', 'rmse', 'bias')}
    for key in ('mae', 'rmse'):
        if result[key] is not None and result[key] < 0: result[key] = None
    return result


def build_report(predictor, models_dir):
    meta = mapping(predictor.metadata)
    loaded_id = getattr(predictor, 'model_id', None)
    selected_id, pointer_error = None, None
    try:
        selected_id = json.loads((models_dir/'latest.json').read_text(encoding='utf-8')).get('model_id')
    except (OSError, ValueError, AttributeError) as exc:
        pointer_error = str(exc)
    split_meta = mapping(meta.get('partitions'))
    partitions = {}
    for name in PARTITIONS:
        items = split_meta.get(name)
        partitions[name] = sorted({s for s in items if isinstance(s,str)}) if isinstance(items,list) else []
    groups = [set(partitions[p]) for p in PARTITIONS]
    overlap = sorted((groups[0]&groups[1]) | (groups[0]&groups[2]) | (groups[1]&groups[2]))
    complete = all(groups)
    candidates = []
    for name, values in mapping(meta.get('validation_candidates')).items():
        candidates.append({'name':name,'selected':name==meta.get('selected'), **scores(values)})
    coverage = []
    for compound in COMPOUNDS:
        record = {'compound':compound}
        for name in PARTITIONS:
            table = mapping(mapping(meta.get('compound_counts')).get(name))
            value = table.get(compound, table.get('INTER',0) if compound=='INTERMEDIATE' else 0)
            record[name] = count(value) if name in mapping(meta.get('compound_counts')) else None
        record['seen_in_training'] = (record['train'] or 0)>0
        coverage.append(record)
    limitations = meta.get('limitations')
    limitations = [x for x in limitations if isinstance(x,str)] if isinstance(limitations,list) else []
    limitations += [
        'This report measures lap-time error, not tyre-wear prediction accuracy.',
        'Disjoint session IDs do not prove generalization to unseen race weekends.',
        'The test score is only held out if it was not used for subsequent tuning.',
    ]
    validation = scores(meta.get('val_metrics'))
    test = scores(meta.get('test_metrics'))
    messages = []
    if not loaded_id: messages.append('No model loaded. Inspect load_error before interpreting metrics.')
    if selected_id and selected_id != loaded_id: messages.append('A different model is selected on disk. Restart the backend to load it.')
    if not complete: messages.append('Saved train/validation/test session lists are incomplete.')
    if overlap: messages.append('Session overlap detected. Do not describe this as held-out session evaluation.')
    if not candidates: messages.append('Validation-candidate results are missing; this may be a legacy artifact.')
    return {
        'status':'SAVED_EVALUATION' if loaded_id and meta else 'UNAVAILABLE',
        'model_id':loaded_id, 'selected_model_id':selected_id,
        'restart_required':bool(selected_id and selected_id!=loaded_id),
        'load_error':predictor.load_error, 'pointer_error':pointer_error,
        'selected_algorithm':meta.get('selected'), 'trained_at':meta.get('trained_at',meta.get('created_utc')),
        'target':meta.get('target'), 'selection_rule':meta.get('selection_rule'),
        'metrics':{'validation':validation,'test':test},
        'validation_candidates':candidates,
        'partitions':[{ 'name':name,'sessions':partitions[name], 'laps':count(mapping(meta.get('rows')).get(name))} for name in PARTITIONS],
        'session_check':{'status':'OVERLAP' if overlap else 'DISJOINT' if complete else 'INCOMPLETE','overlapping_sessions':overlap},
        'compound_coverage':coverage,
        'data_sources':[{ 'session_id':item.get('session_id'),'sha256':item.get('sha256')} for item in meta.get('dataset_sources',[]) if isinstance(item,dict)] if isinstance(meta.get('dataset_sources'),list) else [],
        'filter_counts':{k:count(v) for k,v in mapping(meta.get('dropped')).items()},
        'messages':messages, 'limitations':list(dict.fromkeys(limitations)),
        'provenance_note':'Source hashes are recorded at training; this endpoint does not re-audit current dataset files.',
    }
