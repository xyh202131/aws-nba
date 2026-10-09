"""Local documentation audit; no network, cloud operations, or application tests."""
from pathlib import Path
from urllib.parse import unquote, urlsplit
from decimal import Decimal as D
import hashlib
import json
import re
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent.parent


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


baseline = read_json(OUT / "inventory-before.json")
paths = subprocess.check_output(
    ["rg", "--files", "--hidden", "-g", "*.md", "-g", "!**/node_modules/**",
     "-g", "!**/.git/**", "-g", "!**/dist/**", "-g", "!**/cdk.out/**",
     "-g", "!**/.local/**", "-g", "!output/documentation-review-20261009/**"],
    cwd=ROOT, text=True, encoding="utf-8",
).splitlines()
paths = sorted(Path(p).as_posix() for p in paths)
source_docs = {"资料/参赛终极指南.md", "资料/赛制与选手快速上手.md",
               "BroadcastCode「深度赛场」赛事 · 赛前培训直播 会议纪要.md", "AGENTS.md"}
first_party = [p for p in paths if p not in source_docs and not p.startswith(".firecrawl/")]
link_pattern = re.compile(r"!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+\"[^\"]*\")?\)")
broken = []
resolved = []
external_count = 0
for rel in first_party:
    document = ROOT / rel
    contents = re.sub(r"```.*?```", "", document.read_text(encoding="utf-8-sig"), flags=re.S)
    for match in link_pattern.finditer(contents):
        target = match.group(1).strip("<>")
        if urlsplit(target).scheme:
            external_count += 1
            continue
        local = unquote(target.split("#", 1)[0].split("?", 1)[0])
        if not local:
            continue
        destination = (document.parent / local).resolve()
        item = {"document": rel, "target": target}
        if destination == OUT / "validation.json" or destination.exists():
            resolved.append(item)
        else:
            broken.append(item)

index = (ROOT / "README.md").read_text(encoding="utf-8")
index_paths = {unquote(m.group(1).strip("<>")) for m in link_pattern.finditer(index)}
unindexed = sorted(set(paths) - index_paths - {"README.md"})
backups = []
preserved = []
changed = []
for entry in baseline["files"]:
    rel = entry["path"]
    if not rel.startswith(".firecrawl/"):
        backup = OUT / "before" / rel
        backups.append({"path": rel, "matches": backup.exists() and sha(backup) == entry["sha256"]})
    current = sha(ROOT / rel)
    if rel in source_docs or rel.startswith(".firecrawl/"):
        preserved.append({"path": rel, "unchanged": current == entry["sha256"]})
    if current != entry["sha256"]:
        changed.append(rel)

copies = [{"path": row["copy"], "matches_original": sha(ROOT / row["copy"]) == sha(Path(row["original"]))}
          for row in baseline["source_copy_checks"]]

qwen = (D(30000) * D("0.53") + D(3000) * D("2.66")) / D(1000000)
sonnet = (D(20000) * D(3) + D(4000) * D(15)) / D(1000000)
opus = (D(20000) * D(5) + D(4000) * D(25)) / D(1000000)
costs = read_json(ROOT / "output/preparation-evidence/quality-cost-estimate.json")
cost_checks = []
for scenario in costs["scenarios"]:
    model = ((qwen + sonnet) * scenario["rounds"] + opus * scenario["extra_opus_calls"]) * D("1.3")
    low, high = model + D(scenario["infra_low"]), model + D(scenario["infra_high"])
    cost_checks.append({"name": scenario["name"], "recomputed_low": str(low), "recomputed_high": str(high),
                        "matches": model == D(scenario["model_cost_with_allowance"])
                        and low == D(scenario["total_low"]) and high == D(scenario["total_high"])})

shots = read_json(ROOT / "data/processed/20261009/shots-enriched.json")["shots"]
clips = read_json(ROOT / "aws-nba/src/data/clips.json")
projection = read_json(ROOT / "aws-nba/src/data/shots.json")
by_key = {row["record_id"]: row for row in shots}
projection_matches = all(row["record_id"] in by_key and all(by_key[row["record_id"]].get(k) == v for k, v in row.items()) for row in projection)
data_check = {"processed_shots": len(shots), "frontend_shots": len(projection),
              "official_clocks": sum(bool(row["official_game_clock_text"]) for row in shots),
              "linked_shots": sum(bool(row["clip_id"]) for row in shots), "frontend_clips": len(clips),
              "frontend_projection_matches": projection_matches,
              "clip_metrics_match": all(clip["xfg"] == by_key[clip["recordId"]]["official_xfg_percent"] for clip in clips)}
data_check["passes"] = (len(shots) == len(projection) == data_check["official_clocks"] == 41
                        and data_check["linked_shots"] == len(clips) == 2
                        and projection_matches and data_check["clip_metrics_match"])
checks_pass = (not broken and not unindexed and all(x["matches"] for x in backups)
               and all(x["unchanged"] for x in preserved) and all(x["matches_original"] for x in copies)
               and all(x["matches"] for x in cost_checks) and data_check["passes"])
report = {
    "date": "2026-10-09", "scope": "local documentation audit only", "passed": checks_pass,
    "baseline_markdown_count": baseline["baseline_count"], "current_markdown_count": len(paths),
    "first_party_documents_link_checked": len(first_party), "local_links_checked": len(resolved) + len(broken),
    "broken_local_links": broken, "external_links_not_rechecked": external_count,
    "unindexed_documents": unindexed, "backup_checks": backups, "protected_document_checks": preserved,
    "source_copy_checks": copies, "historical_cost_arithmetic": cost_checks, "data_checks": data_check,
    "changed_existing_documents": changed, "added_documents": sorted(set(paths) - {e["path"] for e in baseline["files"]}),
    "not_performed": ["application tests/build", "live AWS/model/price checks", "Portal login or binding verification",
                      "external URL availability", "cloud deployment", "paid inference", "platform evaluation"],
}
(OUT / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({k: report[k] for k in ["passed", "current_markdown_count", "first_party_documents_link_checked",
      "local_links_checked", "broken_local_links", "unindexed_documents", "data_checks"]}, ensure_ascii=False))
raise SystemExit(0 if checks_pass else 1)
