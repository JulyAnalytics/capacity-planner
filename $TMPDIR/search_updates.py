import json
import re

TRANSCRIPT = "/Users/jun/.claude/projects/-Users-jun-Library-CloudStorage-OneDrive-Personal-Tools-capacity-planner/865d367e-c61b-4e8a-8fe7-6c986fd86d19.jsonl"

targets = ["replace, not duplicate", "auth-overlay", "tail -n +83", "renderEmpty", "Revision Notes"]
found_any = False

with open(TRANSCRIPT) as f:
    for i, line in enumerate(f, 1):
        try:
            data = json.loads(line)
            if data.get("type") != "user":
                continue
            msg = data.get("message", {})
            content = msg.get("content", [])
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict):
                    continue
                val = block.get("content", "")
                if isinstance(val, str):
                    for t in targets:
                        if t in val:
                            print(f"Found '{t}' in line {i} (len={len(val)})")
                            idx = val.find(t)
                            print(f"  Context: {val[max(0,idx-80):idx+80]}")
                            print()
                            found_any = True
        except json.JSONDecodeError:
            pass

if not found_any:
    print("None of the targets found in any user message")
