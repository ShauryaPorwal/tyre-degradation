"""Run with: python test_stint_curves.py (no third-party dependencies)."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('stint_curves', Path(__file__).parent / 'src/cleanroom/ml/stint_curves.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def rows(slope=0.1):
    return [dict(session_id='2025_ESP_FP2', driver='VER', lap_number=i,
                 tyre_life=i, lap_time=80+slope*i, stint=1, compound='MEDIUM',
                 pit_in=False,pit_out=False,is_accurate=True,track_status='1')
            for i in range(1,13)]

def analyse(data, **kwargs):
    return m.analyse(data,'2025_ESP_FP2','VER',**kwargs)

class Tests(unittest.TestCase):
    def test_known_slope(self):
        result=analyse(rows())
        self.assertAlmostEqual(result['stints'][0]['raw_fit']['slope_s_per_tyre_lap'],0.1)
        self.assertIsNone(result['stints'][0]['fuel_adjusted_fit'])
        self.assertEqual(len(result['compound_coverage']),5)

    def test_fuel_sign_and_negative_slope(self):
        stint=analyse(rows(-0.02),burn=2,fuel_effect=0.03)['stints'][0]
        self.assertAlmostEqual(stint['raw_fit']['slope_s_per_tyre_lap'],-0.02)
        self.assertAlmostEqual(stint['fuel_adjusted_fit']['slope_s_per_tyre_lap'],0.04)
        self.assertEqual(stint['points'][0]['fuel_adjustment_s'],0)

    def test_no_future_influence(self):
        data=rows();before=analyse(data,through_lap=6)
        for row in data[6:]:row['lap_time']=299
        self.assertEqual(before,analyse(data,through_lap=6))
        self.assertEqual(before['future_laps_not_used'],6)

    def test_filters(self):
        data=rows();data[0]['track_status']='14';data[1]['is_accurate']=None
        data[2]['pit_in']=True;data[3]['compound']='UNKNOWN'
        result=analyse(data)
        self.assertEqual(result['excluded_laps'],4)
        self.assertEqual(result['clean_laps'],8)

    def test_sparse(self):
        self.assertEqual(analyse(rows()[:5])['stints'][0]['status'],'INSUFFICIENT_LAPS')

    def test_stint_separation(self):
        data=rows()
        for row in data[6:]:row['stint']=2;row['tyre_life']-=6
        result=analyse(data)
        self.assertEqual(len(result['stints']),2)
        self.assertTrue(all(s['raw_fit'] for s in result['stints']))
        data[5]['tyre_life']=0
        self.assertEqual(analyse(data)['stints'][0]['status'],'INCONSISTENT_STINT')

    def test_invalid_assumptions(self):
        with self.assertRaises(ValueError):analyse(rows(),burn=2)
        with self.assertRaises(ValueError):analyse(rows(),burn=float('nan'),fuel_effect=.03)
        with self.assertRaises(LookupError):analyse(rows(),through_lap=999)

    def test_catalog(self):
        result=m.catalog(rows()+rows())
        self.assertEqual(result[0]['drivers'][0]['laps'],list(range(1,13)))

if __name__=='__main__':unittest.main()
