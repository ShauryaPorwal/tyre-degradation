"""Hash-checked archive with an in-memory identity index. No network on requests."""
import hashlib
import json
from pathlib import Path
from threading import RLock
from cleanroom.ml.verified_dataset import root


class Repository:
    def __init__(self, directory=None):
        self.directory = Path(directory) if directory else root()
        self.lock = RLock()
        self.stamp = None
        self.sessions = {}
        self.errors = []

    def refresh(self):
        with self.lock:
            paths = sorted((self.directory / 'data/verified').glob('*/laps.json'))
            raw = self.directory / 'data/raw/laps.json'
            if raw.exists(): paths.append(raw)
            files = [p for path in paths for p in (path, path.with_name('laps.provenance.json')) if p.exists()]
            stamp = tuple((str(p), p.stat().st_mtime_ns, p.stat().st_size) for p in files)
            if self.stamp == stamp: return
            sessions, errors = {}, []
            for path in paths:
                try:
                    content = path.read_bytes()
                    meta = json.loads(path.with_name('laps.provenance.json').read_text(encoding='utf-8-sig'))
                    if meta.get('source') != 'FASTF1' or hashlib.sha256(content).hexdigest() != meta.get('sha256'):
                        raise ValueError('Source/hash mismatch. Re-export this session.')
                    rows = json.loads(content)
                    sid = meta['session_id']
                    if not isinstance(rows,list) or not rows or len(rows) != meta.get('row_count'):
                        raise ValueError('Invalid rows or row-count mismatch')
                    index = {}
                    for r in rows:
                        if not isinstance(r,dict) or r.get('session_id') != sid: raise ValueError('Mixed session rows')
                        lap = r.get('lap_number')
                        if isinstance(lap,bool) or not isinstance(lap,(int,float)) or lap < 1 or int(lap) != lap:
                            raise ValueError('Invalid lap number')
                        key = (str(r['driver']).upper(),int(lap))
                        if key in index: raise ValueError('Duplicate lap identity')
                        index[key] = r
                    candidate = {'rows':rows,'index':index,'provenance':{**meta,'status':'FASTF1_EXPORT_HASH_MATCH'},
                                 'session_id':sid}
                    if sid not in sessions or meta.get('exported_at','') > sessions[sid]['provenance'].get('exported_at',''):
                        sessions[sid] = candidate
                except (OSError,ValueError,KeyError,TypeError,OverflowError) as exc:
                    errors.append({'file':str(path.relative_to(self.directory)), 'reason':str(exc)})
            self.sessions, self.errors, self.stamp = sessions, errors, stamp

    def get(self, sid):
        self.refresh()
        if sid not in self.sessions: raise LookupError('Session not found among valid exports.')
        return self.sessions[sid]

    def catalog(self):
        self.refresh()
        result=[]
        for sid,s in sorted(self.sessions.items()):
            drivers=[]
            for driver in sorted({k[0] for k in s['index']}):
                laps=sorted(k[1] for k in s['index'] if k[0]==driver)
                drivers.append({'driver':driver,'laps':laps})
            result.append({'session_id':sid,'drivers':drivers,'row_count':len(s['rows']),
                           'provenance':s['provenance']})
        return {'sessions':result,'rejected_exports':self.errors,
                'note':'Hashes check local integrity, not an official authenticity signature.'}


repository = Repository()
