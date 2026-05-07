import json

TRANSCRIPT = "/Users/jun/.claude/projects/-Users-jun-Library-CloudStorage-OneDrive-Personal-Tools-capacity-planner/865d367e-c61b-4e8a-8fe7-6c986fd86d19.jsonl"

with open(TRANSCRIPT) as f:
    for i, line in enumerate(f, 1):
        try:
            data = json.loads(line)
            if data.get("type") == "user":
                msg = data.get("message", {})
                content = msg.get("content", [])
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict):
                            for key in ["text", "content"]:
                                val = block.get(key, "")
                                if isinstance(val, str) and "## Implementation Steps" in val:
                                    print(f"=== LINE {i}, key={key}, len={len(val)} ===")
                                    print(val[:200])
                                    print("...")
                                    print(val[-200:])
                                    print()
        except json.JSONDecodeError:
            pass
