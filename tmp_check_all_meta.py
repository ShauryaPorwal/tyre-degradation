# File: tmp_check_all_meta.py
import glob
import json
import os

for p in sorted(glob.glob("models/*.metadata.json")):
    m = json.load(open(p))
    ok_sel = m.get("selected") in {"CatBoost", "XGBoost", "LightGBM", "deterministic_baseline"}
    val = m.get("val_metrics")
    if val is None and "results" in m:
        sel = m["selected"]
        val = m["results"].get(sel, {}).get("metrics")
    print(os.path.basename(p), "| selected:", m.get("selected"), "| val:", val,
          "| keys:", sorted(m.keys()))
latest = json.load(open("models/latest.json"))
print("latest.json ->", latest)
