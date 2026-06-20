# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r08-regression.spec.ts >> _fmtCalDate — fix: calendar dates shifted back one day west of UTC >> _fmtCalDate utility converts YYYY-MM-DD to local date without UTC shift
- Location: tests/r08-regression.spec.ts:254:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - heading "Capacity Planner" [level=2] [ref=e4]
    - paragraph [ref=e5]: Sign in to continue.
    - textbox "your@email.com" [ref=e6]
    - textbox "Password" [ref=e7]
    - button "Sign In" [ref=e8] [cursor=pointer]
    - paragraph [ref=e9]
  - navigation [ref=e10]:
    - generic [ref=e12]:
      - heading "Quick Nav" [level=4] [ref=e13]
      - button "◀" [ref=e14] [cursor=pointer]
  - button "▶" [ref=e16] [cursor=pointer]
  - generic [ref=e17]:
    - banner [ref=e18]:
      - heading "Capacity Planner" [level=1] [ref=e19]
      - generic [ref=e20]:
        - generic [ref=e21]: "Last saved: Never"
        - button "Export" [ref=e22] [cursor=pointer]
        - button "Import" [ref=e23] [cursor=pointer]
        - button "Migrate Local Data" [ref=e24]
    - navigation [ref=e25]:
      - button "Calendar" [active] [ref=e26] [cursor=pointer]
      - button "Focus" [ref=e27] [cursor=pointer]
      - button "Sprints" [ref=e28] [cursor=pointer]
      - button "Story Map" [ref=e29] [cursor=pointer]
      - button "Analytics" [ref=e30] [cursor=pointer]
  - button "+ Create" [ref=e33] [cursor=pointer]
```