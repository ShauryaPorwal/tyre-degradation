"""Report available observations without inventing wear or strategy predictions."""
from dataclasses import dataclass, asdict
from math import isfinite

WHEELS = ('front_left', 'front_right', 'rear_left', 'rear_right')
SIGNALS = ('pressure_psi', 'temp_inner_c', 'temp_middle_c', 'temp_outer_c',
           'wheel_slip_pct', 'vertical_load_n')


def number(value):
    if isinstance(value, bool):
        return None
    try:
        value = float(value)
        return value if isfinite(value) else None
    except (TypeError, ValueError):
        return None


@dataclass
class AnalysisResult:
    fuel_analysis: dict
    weather_analysis: dict
    traffic_analysis: dict
    track_evolution: dict
    driver_inputs: dict
    tyre_analysis: dict
    tyre_sensors: dict
    pit_strategy: dict


def analyse_state(state, predicted_lap_time_s):
    sensors = {}
    for wheel in WHEELS:
        readings, invalid = {}, []
        for signal in SIGNALS:
            raw = state.get(f'{wheel}_{signal}')
            value = number(raw)
            # Basic validity only, not race-specific operating limits.
            if value is not None and signal in ('pressure_psi', 'vertical_load_n') and value < 0:
                value = None
            if raw is not None and value is None:
                invalid.append(signal)
            readings[signal] = value
        count = sum(v is not None for v in readings.values())
        temps = [readings[s] for s in SIGNALS[1:4] if readings[s] is not None]
        sensors[wheel] = {
            **readings,
            'status': 'UNAVAILABLE' if not count else ('COMPLETE' if count == 6 else 'PARTIAL'),
            'source': ('SIMULATED' if state.get('sensor_source') == 'SIMULATED' else 'UNVERIFIED_INPUT') if count else 'UNAVAILABLE',
            'available_channels': count,
            'total_channels': 6,
            'average_surface_temp_c': round(sum(temps) / 3, 2) if len(temps) == 3 else None,
            'temperature_spread_c': round(max(temps) - min(temps), 2) if len(temps) == 3 else None,
            'invalid_channels': invalid,
            'health_status': 'NOT_ASSESSED',
            'note': 'No calibrated compound/circuit limits supplied; these readings do not measure remaining rubber life.',
        }
    fuel = number(state.get('fuel_kg'))
    traffic = number(state.get('traffic_gap_s'))
    evolution = number(state.get('track_evolution_s_per_lap'))
    rain = state.get('rainfall')
    return AnalysisResult(
        fuel_analysis={'fuel_kg': fuel, 'status': 'INPUT' if fuel is not None else 'UNAVAILABLE',
                       'estimated_fuel_effect_s_per_lap': None, 'reason': 'Requires a calibrated fuel-effect model.'},
        weather_analysis={'track_temp_c': number(state.get('track_temp')), 'air_temp_c': number(state.get('air_temp')),
                          'rainfall': rain if isinstance(rain, bool) else None, 'pace_effect_s': None,
                          'tyre_crossover': 'NOT_ESTIMATED'},
        traffic_analysis={'gap_s': traffic, 'estimated_penalty_s': None, 'status': 'INPUT' if traffic is not None else 'UNAVAILABLE'},
        track_evolution={'effect_s_per_lap': evolution, 'status': 'SUPPLIED_ESTIMATE' if evolution is not None else 'UNAVAILABLE'},
        driver_inputs={'throttle_mean_pct': number(state.get('throttle_mean_pct')),
                       'brake_time_pct': number(state.get('brake_time_pct')),
                       'speed_mean_kph': number(state.get('speed_mean_kph')),
                       'note': 'Brake time is percentage of sampled time braking, not brake pressure.'},
        tyre_analysis={'compound': state.get('compound'), 'tyre_age_laps': number(state.get('tyre_age')),
                       'degradation_s_per_lap': None, 'remaining_competitive_laps': None,
                       'predicted_lap_time_s': predicted_lap_time_s,
                       'status': 'DECONFOUNDING_NOT_IMPLEMENTED'},
        tyre_sensors=sensors,
        pit_strategy={'action': 'INSUFFICIENT_EVIDENCE', 'recommended_compound': None,
                      'recommended_pit_lap': None,
                      'reason': 'Requires validated compound pace curves, pit loss, remaining race laps and traffic/weather scenarios.'},
    )


def result_dict(result):
    return asdict(result)
