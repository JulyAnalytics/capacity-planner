# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: r08-regression.spec.ts >> _fmtCalDate — fix: calendar dates shifted back one day west of UTC >> _fmtCalDate utility converts YYYY-MM-DD to local date without UTC shift
- Location: tests/r08-regression.spec.ts:214:7

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - heading "Capacity Planner" [level=1] [ref=e4]
      - generic [ref=e5]:
        - generic [ref=e6]: "Last saved: Never"
        - button "Export" [ref=e7] [cursor=pointer]
        - button "Import" [ref=e8] [cursor=pointer]
        - button "Sign Out" [ref=e9]
    - navigation "Views" [ref=e10]:
      - button "Today" [ref=e11] [cursor=pointer]
      - button "Calendar" [active] [ref=e12] [cursor=pointer]
      - button "Backlog" [ref=e13] [cursor=pointer]
      - button "Story Map" [ref=e14] [cursor=pointer]
      - button "Inbox 289" [ref=e15] [cursor=pointer]:
        - text: Inbox
        - generic [ref=e16]: "289"
      - button "Analytics" [ref=e17] [cursor=pointer]
    - generic [ref=e19]:
      - generic [ref=e20]:
        - generic [ref=e22]:
          - generic [ref=e23]: Tuesday, July 28
          - generic [ref=e24]:
            - text: 📍 Lethbridge ·
            - generic [ref=e25]: Stable
            - generic [ref=e26]: 3.5 blocks ✓
            - button "Adjust" [ref=e27] [cursor=pointer]
        - generic [ref=e28]:
          - generic [ref=e29]: SPRINT
          - generic [ref=e30]:
            - button "Sprint 12" [ref=e31] [cursor=pointer]
            - text: · day 9 of 14 · 0 of 3 done
          - generic [ref=e32]:
            - generic [ref=e33]:
              - checkbox "Complete Capacity Planner — Design Review" [ref=e34] [cursor=pointer]
              - generic [ref=e35] [cursor=pointer]: Capacity Planner — Design Review
              - generic [ref=e36]: M
            - generic [ref=e37]:
              - checkbox "Complete Fluid layout + companion columns" [ref=e38] [cursor=pointer]
              - generic [ref=e39] [cursor=pointer]: Fluid layout + companion columns
              - generic [ref=e40]: M
            - generic [ref=e41]:
              - checkbox "Complete Performance Optimization Plan — Capacity Planner" [ref=e42] [cursor=pointer]
              - generic [ref=e43] [cursor=pointer]: Performance Optimization Plan — Capacity Planner
              - generic [ref=e44]: M
        - generic [ref=e45]:
          - generic [ref=e46]: FLOOR
          - generic [ref=e47]:
            - generic [ref=e48] [cursor=pointer]:
              - checkbox "Movement floor activity" [ref=e49]
              - generic [ref=e50]: Movement
            - generic [ref=e51] [cursor=pointer]:
              - checkbox "Learning floor activity" [ref=e52]
              - generic [ref=e53]: Learning
            - generic [ref=e54] [cursor=pointer]:
              - checkbox "Admin floor activity" [ref=e55]
              - generic [ref=e56]: Admin
            - generic [ref=e57] [cursor=pointer]:
              - checkbox "Trade Journaling floor activity" [ref=e58]
              - generic [ref=e59]: Trade Journaling
        - generic [ref=e60]:
          - generic [ref=e61]: NOTES
          - textbox "Daily note" [ref=e62]:
            - /placeholder: One line about today…
      - complementary "Next 14 days" [ref=e63]:
        - generic [ref=e64]: Next 14 days
        - generic [ref=e65]:
          - generic [ref=e66]: 49.0 blocks
          - generic [ref=e67]:
            - generic [ref=e68]: 📍 Lethbridge
            - button "28 Tue Stable 3.5 blk" [ref=e69] [cursor=pointer]:
              - generic [ref=e70]: 28 Tue
              - generic [ref=e71]: Stable
              - generic [ref=e72]: 3.5 blk
            - button "29 Wed Stable 3.5 blk" [ref=e73] [cursor=pointer]:
              - generic [ref=e74]: 29 Wed
              - generic [ref=e75]: Stable
              - generic [ref=e76]: 3.5 blk
            - button "30 Thu Stable 3.5 blk" [ref=e77] [cursor=pointer]:
              - generic [ref=e78]: 30 Thu
              - generic [ref=e79]: Stable
              - generic [ref=e80]: 3.5 blk
            - button "31 Fri Stable 3.5 blk" [ref=e81] [cursor=pointer]:
              - generic [ref=e82]: 31 Fri
              - generic [ref=e83]: Stable
              - generic [ref=e84]: 3.5 blk
            - button "1 Sat Stable 3.5 blk" [ref=e85] [cursor=pointer]:
              - generic [ref=e86]: 1 Sat
              - generic [ref=e87]: Stable
              - generic [ref=e88]: 3.5 blk
            - generic [ref=e89]: Sprint 12 ends
            - button "2 Sun Stable 3.5 blk" [ref=e90] [cursor=pointer]:
              - generic [ref=e91]: 2 Sun
              - generic [ref=e92]: Stable
              - generic [ref=e93]: 3.5 blk
            - button "3 Mon Stable 3.5 blk" [ref=e94] [cursor=pointer]:
              - generic [ref=e95]: 3 Mon
              - generic [ref=e96]: Stable
              - generic [ref=e97]: 3.5 blk
            - button "4 Tue Stable 3.5 blk" [ref=e98] [cursor=pointer]:
              - generic [ref=e99]: 4 Tue
              - generic [ref=e100]: Stable
              - generic [ref=e101]: 3.5 blk
            - button "5 Wed Stable 3.5 blk" [ref=e102] [cursor=pointer]:
              - generic [ref=e103]: 5 Wed
              - generic [ref=e104]: Stable
              - generic [ref=e105]: 3.5 blk
            - button "6 Thu Stable 3.5 blk" [ref=e106] [cursor=pointer]:
              - generic [ref=e107]: 6 Thu
              - generic [ref=e108]: Stable
              - generic [ref=e109]: 3.5 blk
            - button "7 Fri Stable 3.5 blk" [ref=e110] [cursor=pointer]:
              - generic [ref=e111]: 7 Fri
              - generic [ref=e112]: Stable
              - generic [ref=e113]: 3.5 blk
            - button "8 Sat Stable 3.5 blk" [ref=e114] [cursor=pointer]:
              - generic [ref=e115]: 8 Sat
              - generic [ref=e116]: Stable
              - generic [ref=e117]: 3.5 blk
            - button "9 Sun Stable 3.5 blk" [ref=e118] [cursor=pointer]:
              - generic [ref=e119]: 9 Sun
              - generic [ref=e120]: Stable
              - generic [ref=e121]: 3.5 blk
            - button "10 Mon Stable 3.5 blk" [ref=e122] [cursor=pointer]:
              - generic [ref=e123]: 10 Mon
              - generic [ref=e124]: Stable
              - generic [ref=e125]: 3.5 blk
  - button "+ Create" [ref=e128] [cursor=pointer]
```