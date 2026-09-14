"""Inspect the active dataset without assuming its labels establish authenticity."""
import json
from collections import Counter
from cleanroom.ingest.lap_data import load_bundle


def main():
    rows, provenance = load_bundle()
    sector_patterns={}
    for key,fraction in [('s1',.28),('s2',.41),('s3',.31)]:
        usable=[r for r in rows if isinstance(r.get(key),(int,float)) and isinstance(r.get('lap_time'),(int,float))]
        sector_patterns[key]={'usable':len(usable), 'fixed_fraction_matches':sum(abs(r[key]-fraction*r['lap_time'])<=.00101 for r in usable)}
    print(json.dumps({
        'rows':len(rows), 'sessions':dict(Counter(str(r.get('session_id')) for r in rows)),
        'compounds':dict(Counter(str(r.get('compound')) for r in rows)),
        'driver_rows':dict(Counter(str(r.get('driver')) for r in rows)),
        'provenance':provenance, 'fixed_sector_fraction_check':sector_patterns,
        'note':'Near-universal fixed sector fractions strongly suggest generated/derived sectors. This audit is not an authenticity certificate.',
    },indent=2))


if __name__=='__main__':main()
