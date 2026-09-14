"""Observed stint trends and an optional, assumed fuel correction. Not causal wear."""
from collections import Counter, defaultdict
import math

COMPOUNDS = ('SOFT','MEDIUM','HARD','INTERMEDIATE','WET')


def number(value):
    if isinstance(value,bool): return None
    try:
        value=float(value)
        return value if math.isfinite(value) else None
    except (TypeError,ValueError): return None


def catalog(rows):
    sessions={}
    for row in rows:
        sid=row.get('session_id');driver=row.get('driver');lap=number(row.get('lap_number'))
        if not sid or not driver or lap is None or lap < 1 or not lap.is_integer(): continue
        session=sessions.setdefault(sid,{'session_id':sid,'circuit':row.get('circuit'),
            'session_type':row.get('session_type'),'year':row.get('year'),'drivers':{}})
        session['drivers'].setdefault(driver,[]).append(int(lap))
    return [{**session,'drivers':[{'driver':d,'laps':sorted(set(laps))} for d,laps in sorted(session['drivers'].items())]}
            for _,session in sorted(sessions.items())]


def fit(points,field):
    if len(points)<6: return None
    xs=[p['tyre_age_laps'] for p in points];ys=[p[field] for p in points]
    mean_x=sum(xs)/len(xs);mean_y=sum(ys)/len(ys)
    denom=sum((x-mean_x)**2 for x in xs)
    if denom==0 or len(set(xs))<4: return None
    slope=sum((x-mean_x)*(y-mean_y) for x,y in zip(xs,ys))/denom
    intercept=mean_y-slope*mean_x
    rmse=math.sqrt(sum((y-(intercept+slope*x))**2 for x,y in zip(xs,ys))/len(xs))
    return {'slope_s_per_tyre_lap':slope,'intercept_s':intercept,'fit_rmse_s':rmse,
            'method':'Within-stint ordinary least squares; descriptive, not held-out model accuracy.'}


def analyse(rows,session_id,driver,through_lap=None,burn=None,fuel_effect=None):
    if (burn is None)!=(fuel_effect is None): raise ValueError('Supply both fuel assumptions or neither.')
    if burn is not None:
        burn=number(burn);fuel_effect=number(fuel_effect)
        if burn is None or fuel_effect is None or burn<0 or fuel_effect<0:
            raise ValueError('Fuel assumptions must be finite, non-negative numbers.')
    driver=driver.strip().upper()
    selected=[r for r in rows if r.get('session_id')==session_id and str(r.get('driver','')).upper()==driver]
    if not selected: raise LookupError('Session/driver not found in the active dataset.')
    available=[number(r.get('lap_number')) for r in selected]
    available=[int(n) for n in available if n is not None and n>=1 and n.is_integer()]
    if not available: raise LookupError('Driver has no valid lap numbers.')
    cutoff=max(available) if through_lap is None else through_lap
    if isinstance(cutoff,bool) or not isinstance(cutoff,int) or cutoff<1: raise ValueError('through_lap must be a positive integer.')
    if cutoff not in available: raise LookupError('Selected cutoff lap is not available for this driver.')
    ledger=[];groups=defaultdict(list);coverage=Counter();future=0
    for row in selected:
        lap=number(row.get('lap_number'))
        if lap is not None and lap>cutoff:
            future+=1;continue
        age=number(row.get('tyre_life'));pace=number(row.get('lap_time'));stint=number(row.get('stint'))
        compound=str(row.get('compound','UNKNOWN')).strip().upper()
        if compound=='INTER':compound='INTERMEDIATE'
        reason=None
        if lap is None or lap<1 or not lap.is_integer():reason='INVALID_LAP_NUMBER'
        elif row.get('pit_in') is not False or row.get('pit_out') is not False:reason='PIT_OR_UNKNOWN_PIT_STATUS'
        elif row.get('is_accurate') is not True:reason='INACCURATE_OR_UNKNOWN'
        elif row.get('deleted') is True:reason='DELETED_LAP'
        elif str(row.get('track_status'))!='1':reason='NOT_CONFIRMED_GREEN'
        elif pace is None or not 30<=pace<=300:reason='INVALID_LAP_TIME'
        elif age is None or age<0:reason='INVALID_TYRE_AGE'
        elif stint is None or stint<1 or not stint.is_integer():reason='INVALID_STINT'
        elif compound not in COMPOUNDS:reason='UNKNOWN_COMPOUND'
        if reason:
            ledger.append({'lap':lap,'reason':reason});continue
        point={'lap':int(lap),'tyre_age_laps':age,'observed_lap_time_s':pace}
        groups[(int(stint),compound)].append(point);coverage[compound]+=1
    output=[]
    for (stint,compound),points in sorted(groups.items()):
        points.sort(key=lambda p:p['lap'])
        inconsistent=any(b['tyre_age_laps']<a['tyre_age_laps'] or b['lap']==a['lap'] for a,b in zip(points,points[1:]))
        ref=points[0]['lap']
        for point in points:
            adjustment=burn*fuel_effect*(point['lap']-ref) if burn is not None else None
            if adjustment is not None and not math.isfinite(adjustment):
                raise ValueError('Fuel assumptions produce a non-finite correction. Use smaller values.')
            point['fuel_adjustment_s']=adjustment
            point['fuel_adjusted_lap_time_s']=point['observed_lap_time_s']+adjustment if adjustment is not None else None
        raw=fit(points,'observed_lap_time_s') if not inconsistent else None
        adjusted=fit(points,'fuel_adjusted_lap_time_s') if burn is not None and not inconsistent else None
        output.append({'stint':stint,'compound':compound,'clean_laps':len(points),'reference_lap':ref,
            'status':'INCONSISTENT_STINT' if inconsistent else 'DESCRIPTIVE_TREND' if raw else 'INSUFFICIENT_LAPS',
            'raw_fit':raw,'fuel_adjusted_fit':adjusted,'points':points})
    return {'session_id':session_id,'driver':driver,'through_lap':cutoff,
        'clean_laps':sum(coverage.values()),'excluded_laps':len(ledger),'future_laps_not_used':future,
        'compound_coverage':[{'compound':c,'clean_laps':coverage[c]} for c in COMPOUNDS],
        'stints':output,'exclusions':ledger,
        'fuel_assumptions':{'enabled':burn is not None,'burn_kg_per_lap':burn,'effect_s_per_kg':fuel_effect,
            'source':'USER_ASSUMPTION' if burn is not None else 'NOT_SUPPLIED',
            'formula':'adjusted pace = observed pace + burn * fuel effect * (lap - first clean lap of stint)'},
        'unresolved_confounders':['traffic','track evolution','weather effects','driver effort'],
        'interpretation':'Positive slope means slower laps with tyre age; negative slope is retained. Neither establishes physical wear.',
        'limitations':['Fuel correction uses supplied assumptions, not measured fuel mass.',
            'Only observations through the selected lap are used. No future stint data enters the fit.',
            'At least 6 clean laps and 4 distinct tyre ages are required per fit.',
            'No causal confidence interval, rubber-life estimate or pit call is produced.',
            'Pit/flag filtering does not remove all traffic, warm-up or driver-effort effects.']}