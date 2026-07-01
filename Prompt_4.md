Follow CLAUDE.md. Restyle the to-do app to EXACTLY match the design in
design/todo-board-reference.html. This is a presentation-only change —
do NOT change or remove any existing functionality: keep the Supabase auth
gate, per-user data + RLS, realtime sync, drag-and-drop persistence, the four
lanes, and add/toggle-done/delete all working exactly as they do now. Only the
look changes.

Match these design tokens precisely:

Fonts (load from Google Fonts):
- Body/UI: Inter (400, 450, 500, 600)
- Headings + column titles: Space Grotesk (500, 600, 700)

Page:
- background: radial-gradient(120% 120% at 0% 0%, #f5f6fb 0%, #eef0f6 55%, #e9ebf3 100%)
- text color #1a1f2e; padding 48px 56px 64px; min-height 100vh

Header (flex, space-between, align flex-end, margin-bottom 36px, max-width 1480px):
- Title "To-Do": Space Grotesk 700, 34px, letter-spacing -0.02em, #161a26
- Subtitle (Inter 450, 14px, #707a8c): "{doneCount} of {totalCount} tasks complete · {pct}% done"
- Progress bar: track 180×8px, radius 999px, #e2e5ee; fill linear-gradient(90deg,#6366f1,#818cf8),
  width = pct%, transition width .35s ease. Derive doneCount/total/pct from existing task data.

Board: grid, repeat(4, minmax(260px,1fr)), gap 22px, max-width 1480px.

Column: background rgba(255,255,255,0.55); border 1px solid rgba(255,255,255,0.9);
  border-radius 18px; padding 16px 16px 18px; box-shadow 0 1px 2px rgba(20,26,38,0.04);
  min-height 240px. On drag-over: background rgba(255,255,255,0.78),
  box-shadow 0 6px 22px rgba(20,26,38,0.09).

Column header: 9×9 radius-3 dot in the column color, then Space Grotesk 600 13px
  uppercase letter-spacing .06em #4a5366 title, then a pill count badge
  (min-width 24, height 22, #eef0f6 bg, #6b7385 text, radius 999px).
  Dot colors: Backlog #94a3b8, Next #6366f1, In Progress #f59e0b, Done #22c55e.

Add row (per column): input flex-1 height 40, padding 0 14, 14px, #fff,
  border 1px solid #e4e7ef, radius 11, shadow 0 1px 2px rgba(20,26,38,0.03),
  placeholder #9aa3b2; "+" button 40×40 #6366f1 white radius 11 font 20,
  shadow 0 2px 8px rgba(99,102,241,0.32), hover #4f46e5 + translateY(-1px). Enter also adds.

Task card: flex align-start gap 11, padding 13px 12px 13px 13px, #fff,
  border 1px solid #eaecf2, radius 13, shadow 0 1px 2px rgba(20,26,38,0.04),
  cursor grab; hover border #cdd2e0 + shadow 0 4px 14px rgba(20,26,38,0.07);
  while dragging opacity 0.4. Done card: bg #f6faf7, border #dcefe1.
- Checkbox: 19×19 radius 6, border 1.5px #cfd4e0 / bg #fff; when done border+bg #22c55e
  with white "✓".
- Text: 14px line-height 1.45 weight 450 #2b3140; done = #9aa3b2 + line-through.
- Delete "✕": 24×24 radius 7, #aab1c0 opacity .65; hover opacity 1, bg #fdeaec, color #e1495f.

Empty lane: dashed placeholder "Drop tasks here" — 1.5px dashed #d9dde7, radius 12,
  #aab1c0, 13px, centered.

Scrollable task list: max-height 62vh, thin 6px scrollbar (#d6dae3 thumb).

After: confirm the app still builds, auth still gates, data still saves per-user via
Supabase, realtime still updates a second tab, and drag-and-drop still persists.