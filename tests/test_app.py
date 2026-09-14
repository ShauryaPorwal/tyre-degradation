import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from fastapi.testclient import TestClient
from cleanroom.serve.api import app
from cleanroom.serve.repository import Repository
from cleanroom.ml.stint_curves import analyse
from cleanroom.ml.scenarios import strategy, decompose
from cleanroom.ml.infer import LapTimePredictor


def rows():
    return [dict(session_id='TEST_FP2',driver='VER',lap_number=i,stint=1,compound='MEDIUM',
                 tyre_life=i,lap_time=80-.02*i,pit_in=False,pit_out=False,is_accurate=True,track_status='1') for i in range(1,13)]


class Calculations(unittest.TestCase):
    def test_fuel_sign(self):
        s=analyse(rows(),'TEST_FP2','VER',12,2,.03)['stints'][0]
        self.assertAlmostEqual(s['raw_fit']['slope_s_per_tyre_lap'],-.02)
        self.assertAlmostEqual(s['fuel_adjusted_fit']['slope_s_per_tyre_lap'],.04)

    def test_future_withheld(self):
        data=rows();a=analyse(data,'TEST_FP2','VER',6)
        for r in data[6:]:r['lap_time']=250
        self.assertEqual(a,analyse(data,'TEST_FP2','VER',6))

    def test_flags(self):
        data=rows();data[0]['track_status']='14';data[1]['is_accurate']=None;data[2]['pit_in']=True
        self.assertEqual(analyse(data,'TEST_FP2','VER',12)['excluded_laps'],3)

    def test_stint_reset_and_sparse(self):
        data=rows();data[4]['tyre_life']=0
        self.assertIsNone(analyse(data,'TEST_FP2','VER',12)['stints'][0]['raw_fit'])
        self.assertIsNone(analyse(rows(),'TEST_FP2','VER',4)['stints'][0]['raw_fit'])

    def test_traffic_constant_no_slope(self):
        result=decompose(rows(),'TEST_FP2','VER',12,0,0,0,5)
        s=result['stints'][0]
        self.assertAlmostEqual(s['scenario_fit']['slope_s_per_tyre_lap'],s['raw_fit']['slope_s_per_tyre_lap'])
        self.assertAlmostEqual(s['points'][0]['scenario_lap_time_s'],s['points'][0]['observed_lap_time_s']-5)

    def test_pit_index_and_time(self):
        result=strategy(10,2,100,0,10,[dict(compound='SOFT',fresh_pace_s=80,degradation_s_per_lap=0)])
        self.assertEqual(result['scenario_choice']['pit_before_lap'],11)
        self.assertEqual(result['scenario_choice']['total_remaining_s'],170)
        self.assertEqual(result['scenario_choice']['gain_vs_stay_s'],30)
        self.assertEqual(strategy(10,2,100,0,60,[dict(compound='SOFT',fresh_pace_s=80,degradation_s_per_lap=0)])['scenario_choice']['action'],'STAY_OUT')

    def test_missing_model_no_fake_pace(self):
        with tempfile.TemporaryDirectory() as d:
            r=LapTimePredictor(d).predict({'lap':1,'tyre_age':1,'compound':'SOFT'})
            self.assertIsNone(r.predicted_lap_time_s)
            self.assertEqual(r.source,'unavailable')

    def test_hash_failure_excludes_export(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'data/verified/test';p.mkdir(parents=True)
            content=json.dumps(rows()).encode();(p/'laps.json').write_bytes(content)
            (p/'laps.provenance.json').write_text(json.dumps({'source':'FASTF1','session_id':'TEST_FP2','row_count':12,'sha256':hashlib.sha256(content).hexdigest()}))
            repo=Repository(d);self.assertEqual(len(repo.catalog()['sessions']),1)
            (p/'laps.json').write_bytes(content+b' ')
            self.assertEqual(repo.catalog()['sessions'],[])
            self.assertTrue(repo.errors)


class Endpoints(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(app);self.client.__enter__()
        self.selection={'session_id':'2025_ESP_FP2','driver':'VER','lap':21}
    def tearDown(self):self.client.__exit__(None,None,None)
    def test_real_sessions(self):
        data=self.client.get('/api/catalog').json()
        self.assertEqual({s['session_id']:s['row_count'] for s in data['sessions']}, {'2025_ESP_FP1':515,'2025_ESP_FP2':581,'2025_ESP_R':1203})
        self.assertEqual(data['rejected_exports'],[])
    def test_report_and_unavailable_sensors(self):
        response=self.client.post('/api/analyze',json=self.selection)
        self.assertEqual(response.status_code,200)
        data=response.json();self.assertEqual(data['source_row']['lap_number'],21)
        self.assertTrue(all(s['status']=='UNAVAILABLE' for s in data['tyre_sensors'].values()))
        self.assertTrue(all(p['lap']<=21 for s in data['curves']['stints'] for p in s['points']))
    def test_wheel_independence(self):
        response=self.client.post('/api/analyze',json={**self.selection,'sensors':{'source':'SIMULATED','front_left':{'pressure_psi':24,'temp_inner_c':90,'temp_middle_c':96,'temp_outer_c':93}}})
        self.assertEqual(response.status_code,200)
        sensors=response.json()['tyre_sensors']
        self.assertEqual(sensors['front_left']['average_surface_temp_c'],93)
        self.assertEqual(sensors['front_right']['pressure_psi'],None)
        self.assertEqual(sensors['front_left']['source'],'SIMULATED')
    def test_bad_inputs(self):
        self.assertEqual(self.client.post('/api/analyze',json={**self.selection,'lap':999}).status_code,404)
        self.assertEqual(self.client.post('/api/analyze',json={**self.selection,'sensors':{'front_left':{'pressure_psi':-10}}}).status_code,422)
        self.assertEqual(self.client.post('/api/tyre-curves',json={**self.selection,'fuel_burn_kg_per_lap':2}).status_code,422)
    def test_validation_no_overlap(self):
        response=self.client.get('/api/ml/validation-report')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['session_check']['status'],'DISJOINT')
    def test_benchmark(self):
        r=self.client.post('/api/benchmark',json={**self.selection,'repetitions':5})
        self.assertEqual(r.status_code,200)
        self.assertGreaterEqual(r.json()['p95_ms'],r.json()['min_ms'])
    def test_strategy_constraints(self):
        req={'current_lap':20,'remaining_laps':20,'current_pace_s':85,'current_degradation_s_per_lap':.1,'pit_loss_s':22,'candidates':[{'compound':'MEDIUM','fresh_pace_s':83,'degradation_s_per_lap':.08}]}
        self.assertEqual(self.client.post('/api/strategy',json=req).status_code,200)
        req['candidates']*=2
        self.assertEqual(self.client.post('/api/strategy',json=req).status_code,422)


if __name__=='__main__':unittest.main()
