"""Transparent user-assumption scenarios. Never presented as learned tyre wear."""
import math
from cleanroom.ml.stint_curves import analyse, fit


def decompose(rows, sid, driver, cutoff, burn, fuel_effect, track_gain, traffic_penalty):
    result = analyse(rows,sid,driver,cutoff,burn,fuel_effect)
    for stint in result['stints']:
        for p in stint['points']:
            elapsed = p['lap']-stint['reference_lap']
            p['track_correction_s'] = track_gain*elapsed
            p['traffic_correction_s'] = -traffic_penalty
            p['scenario_lap_time_s'] = p['fuel_adjusted_lap_time_s']+track_gain*elapsed-traffic_penalty
            if not math.isfinite(p['scenario_lap_time_s']): raise ValueError('Non-finite scenario result')
        stint['scenario_fit'] = fit(stint['points'],'scenario_lap_time_s') if stint['raw_fit'] else None
    result['scenario_assumptions']={'track_gain_s_per_lap':track_gain,'constant_traffic_penalty_s':traffic_penalty,
        'source':'USER_ASSUMPTION','note':'Constant traffic penalty changes the level, not the slope. Track gain is per driver lap, not a fitted session-time effect.'}
    result['interpretation']='Sensitivity analysis only. No unique causal wear rate can be identified from these corrections.'
    return result


def strategy(current_lap, remaining_laps, current_pace, current_deg, pit_loss, candidates):
    # Pace inputs describe the NEXT lap. Pit occurs before the candidate next lap.
    # Current deg may be negative; never silently clamp observed improvement to wear.
    stay = sum(current_pace+current_deg*i for i in range(remaining_laps))
    options=[]
    for c in candidates:
        for wait in range(remaining_laps):
            before=sum(current_pace+current_deg*i for i in range(wait))
            after=sum(c['fresh_pace_s']+c['degradation_s_per_lap']*i for i in range(remaining_laps-wait))
            total=before+pit_loss+after
            options.append({'compound':c['compound'],'pit_before_lap':current_lap+wait+1,
                            'wait_laps':wait,'total_remaining_s':round(total,3),
                            'gain_vs_stay_s':round(stay-total,3)})
    options.sort(key=lambda x:x['total_remaining_s'])
    best=options[0] if options and options[0]['total_remaining_s'] < stay else None
    return {'source':'USER_ASSUMPTION','stay_out_total_s':round(stay,3),
            'scenario_choice':best or {'action':'STAY_OUT','total_remaining_s':round(stay,3)},
            'options':options,'limitations':['One-stop deterministic scenario, not a validated race recommendation.',
            'No safety-car probability, weather crossover, traffic rejoin loss, tyre allocation or sporting-rule checks.',
            'Fresh pace and degradation are user assumptions. Changing them can reverse the choice.',
            'Pit loss is an additional total time loss. The pit lap still uses the new-tyre pace assumption.']}
