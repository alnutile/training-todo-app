# Green Means Ship — run of show

> Post: [**Green Means Ship: CI/CD for Vibe Coders Who Are Sick of Things
> Breaking**](https://chat.dailyai.studio/posts/green-means-ship-cicd-with-confidence)
> · Reference: [docs/ci-cd.md](ci-cd.md)

A shot list for the video, in order, with the exact commands. Everything here
works offline: no Zapier account, no Supabase project, no Railway service.

**Before you hit record**

```bash
npm install
(cd agents/google-tasks-sync && npm install)
npx playwright install chromium
docker info >/dev/null && echo "docker ready"    # needed for the migration beat
```

**Before you hit record, if you want the live Google Tasks sync (section 7a):**

1. `npm run dev`, then **sign up in the app** with the address in
   `agents/google-tasks-sync/.env` (`SYNC_TARGET_EMAIL`). The agent looks the
   account up by email, so it has to exist. Sign-up is instant — no email step.
2. Make sure `agents/google-tasks-sync/.env` has `ZAPIER_CREDENTIALS_CLIENT_ID`
   and `ZAPIER_CREDENTIALS_CLIENT_SECRET`. **A `zapier-sdk login` token is not
   enough** — it's approval-gated, so an unattended run is denied with
   `can_execute ... denied by policy`. Client credentials aren't:

   ```bash
   npx -p @zapier/zapier-sdk-cli zapier-sdk create-client-credentials \
     "todo-sync-agent" --allowed-scopes external --json
   ```

3. `npm run sync` once, off camera, to confirm it works. Then delete the cards it
   made if you want a clean board — it re-syncs the same tasks next run.

---

## 1. Cold open — the green check mark

**Show:** the repo's **Actions** tab.

The line: *green means every test passed, so this is safe to merge and safe to
ship.* Four workflows, all of them yaml files in
[`.github/workflows/`](../.github/workflows/) that you never have to hand-write.

**Say:** the tests were written by AI, on request. The skill isn't writing them
— it's remembering to ask, and knowing what a good one looks like.

---

## 2. Branches, in ten seconds

**Show:** `git branch`, then make one.

```bash
git checkout -b green-means-ship-demo
```

**Say:** trunk (`main`) is the real thing. A branch is a safe copy where you try
the change. CI runs on the branch, so you find out *before* it's the real thing.

---

## 3. The agent, and the thing you don't want to call for real

**Show:** [`agents/google-tasks-sync/sync.ts`](../agents/google-tasks-sync/sync.ts)
and the Zapier SDK import.

**Say:** this reads my Google Tasks through the Zapier SDK. That SDK makes a
network request to Zapier's API. If a test suite ran that for real, every run
would cost me a task, touch my real Google account, and fail whenever Zapier is
having a bad afternoon.

**Then run the tests:**

```bash
cd agents/google-tasks-sync && npm test
```

21 tests, about a second, no network.

**Show:** [`tests/mocks/zapier.ts`](../agents/google-tasks-sync/tests/mocks/zapier.ts).

**Say the important bit:** the SDK is *real*. It still builds a real HTTP
request, with real auth. We took over the network layer — that request gets
answered here instead of at zapier.com. And this line —

```ts
server.listen({ onUnhandledRequest: 'error' })
```

— means if my code ever tries to call something we haven't faked, the test goes
red. Not "hits the internet quietly". Red.

**Optional live proof (nice on camera):** comment out one handler in
`tests/mocks/zapier.ts`, re-run, watch it fail with the exact URL it tried to
reach. Uncomment, green again.

---

## 4. Watch it catch a real mistake

This is the beat that sells the whole video. Break something on purpose.

**Open** [`agents/google-tasks-sync/src/todos.ts`](../agents/google-tasks-sync/src/todos.ts)
and delete the dedupe guard — change:

```ts
if (!existing || (task.updated ?? '') > (existing.updated ?? '')) {
  byId.set(task.id, task)
}
```

to just:

```ts
byId.set(task.id, task)
```

```bash
npm test
```

**Red.** "dedupes by id and keeps the most recently updated copy" fails.

**Say:** that's a bug I'd never notice by clicking around — it only shows up
when Google hands back the same task twice, and it makes Postgres reject the
whole sync. The test noticed in one second.

Put it back. Green.

---

## 5. Push it, and let GitHub do the same thing

```bash
git add -A
git commit -m "Demo: CI, mocking, and a disposable database"
git push -u origin green-means-ship-demo
```

**Show:** the Actions tab, the run appearing, the four jobs going green:

- Web app (types, unit tests, build)
- Sync agent (types, mocked-network tests)
- Edge function (Deno)
- Browser end-to-end (Chromium)

**Say:** these are little Linux boxes GitHub rents you. They check out the code,
install it, and run exactly what I just ran on my laptop. And notice what
*didn't* happen: nothing called Zapier, nothing touched my database, nothing
cost me anything.

---

## 6. The database change — and where it runs

**Show:** [`supabase/migrations/`](../supabase/migrations/).

**Say:** I never click "add column" in a dashboard. The AI writes a migration
file, and that file is the truth.

**Now the tricky question, out loud:** this one can't be faked. A migration that
has never run against a real Postgres hasn't been tested. So where does it run
when I'm on a branch? Not production — that would be insane.

**Show:** [`database.yml`](../.github/workflows/database.yml).

**Say:** the runner boots an entire Supabase inside the action — Postgres, Auth,
the lot — applies every migration from scratch, checks it, and throws the whole
thing away. Production migrations only ever run from `main`.

**Show:** [`supabase/tests/rls_test.sql`](../supabase/tests/rls_test.sql).

**Say:** and while we've got a real database for two minutes, we prove the
security rule that matters: Alice's rows are invisible to Bob, and invisible to
a logged-out visitor. In SQL. On every push. That used to be a thing I checked
by opening an incognito window and hoping.

**Run it locally if you want the receipts:**

```bash
supabase start && supabase db reset
docker exec -i supabase_db_training-todo-app psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 < supabase/tests/rls_test.sql
# ✓ RLS checks passed
```

**Worth mentioning:** the migration
`20260806120000_grant_todos_table_privileges.sql` exists *because* this check
found something. The app had been relying on a Supabase default nobody wrote
down — fine in production, missing on a fresh database. CI found it the first
time it ran.

---

## 7. The edge function

**Show:** [`supabase/functions/todo-stats/`](../supabase/functions/todo-stats/).

**Say:** this is an API endpoint — someone hits it, it answers. Deployed code,
same as anything else. And the same question applies: I don't want a branch
deploying this.

```bash
cd supabase/functions && deno test
```

13 tests. It never deploys, never runs on Supabase's servers, never talks to a
database. We hand it a fake `fetch` and check it turns a given input into the
right output — including that it forwards *your* login token rather than an
admin key, which is the only reason it can't leak someone else's board.

It deploys from [`deploy-production.yml`](../.github/workflows/deploy-production.yml),
on `main`, after everything is green.

---

## 7a. Now watch the agent do it for real

The counterpoint to everything above. All those tests faked Zapier — here's the
same code hitting the real thing.

**Set the shot:** browser with the board on one side, terminal on the other.

```bash
npm run sync
```

**Watch:** the terminal prints the lists it's reading, then how many rows it
upserted — and the cards **appear on the board without a refresh**. Nobody
touched the browser.

**Say:** two things just happened. The agent read my actual Google Tasks through
Zapier, server-side, with a key that never goes near the browser. And the board
updated itself, because Supabase realtime is pushing changes over a websocket —
which is the same thing that makes two tabs agree.

**Say, because someone will ask:** why a terminal command and not a button in
the app? Because the agent holds the `service_role` key, which bypasses row
level security entirely. A button in the browser that fires off a `service_role`
job is exactly the thing my own rules say never to build. It stays server-side.

**Point out:** this run is the *only* thing all day that cost me a Zapier task.
Every test run — every push, every PR — cost nothing, because the SDK was
talking to a fake.

## 8. The browser one

**Say:** unit tests check the pieces. This one checks it's still an app.

```bash
npm run test:e2e
```

A real Chrome, loading the real production build, clicking real buttons.

**Break it on camera:** open
[`src/components/Board.tsx`](../src/components/Board.tsx) and change the heading
`To-Do` to something else. Re-run — the e2e test fails, because the login screen
it expects no longer looks right.

**Say:** that's the "a button went away and nobody noticed" problem, solved.
Five features from now, this still checks that the thing I shipped today works.

Put it back.

**Show:** where Supabase is faked here —
[`e2e/fake-supabase.ts`](../e2e/fake-supabase.ts). Same idea as before, one
layer further out: Playwright intercepts the page's own network. No test user,
no project, no login.

---

## 8a. The one the other tests couldn't see

This is the strongest beat in the video, and it's real — not staged.

**Show:** the login screen, with the `deployed a405efa` footer floating in the
middle-right of the page instead of sitting at the bottom.

**Show the test that passed anyway:**

```ts
await expect(footer).toBeVisible()                            // true
await expect(link).toHaveAttribute('href', /github\.com/)     // true
```

**Say:** the footer *is* visible. The link *is* right. Both assertions are
correct. "In a ridiculous place" is not something a functional test can see —
that's not a gap in my assertions, it's a gap in what assertions **are**.

**The cause,** if you want to show it — `.app--auth` is a centred flex container,
so the footer became a sibling of the login card and got centred beside it.

**Show:** [`ui-review.yml`](../.github/workflows/ui-review.yml) and the artifact
of screenshots on the run page.

**Say:** so this job does the two things nothing else does. It signs in **for
real** — real Supabase Auth, real session, real row-level security, no mocking
at all — which is the only way to catch a broken auth config. And then it
photographs the result and has Claude look at the pictures.

**Show:** the failing check, and the report table naming the screen, the problem,
and the evidence.

**Then fix it** (move the footer outside the flex container, or `align-self`),
push, and watch it go green.

**Worth saying:** the *decision* isn't the AI's. The severity gate is ordinary
code, it's unit tested, and it **fails closed** — an answer the script can't read
is a failure, never a pass. That's the difference between using a model as a
tool and trusting it as an authority.

**Also worth saying:** the prompt spends as much space on what *not* to report —
no colour opinions, no "could be more modern" — as on what to look for. A
reviewer that cries wolf gets ignored, and an ignored check is worse than none.

## 9. Secrets and environments

**Show:** Settings → Secrets and variables → Actions.

**Say:** the pipeline is public-ish; the credentials aren't. Secrets are
encrypted, masked in logs, and handed to a workflow only while it runs.
Variables are the same idea for things that aren't secret — a Supabase project
ref is already public in your URL, so it's a variable, not a secret.

**Show:** Settings → Environments (`production`, `staging`).

**Say:** an environment is a bucket of secrets plus rules. A job that says
`environment: production` can only see production's secrets — so a staging
deploy *structurally* cannot touch production. You can also require a human to
click approve here before anything ships.

**The one that never goes in:** the `service_role` key. It bypasses row-level
security completely. It lives in the sync agent's own server and nowhere else.

---

## 10. The merge

**Show:** open the PR, all checks green, merge.

**Show:** `main` kicks off **Deploy (production)** — which runs the *same* CI and
the *same* database checks again, then deploys migrations → edge function → web
app, in that order.

**Say:** and if any one of those had gone red, none of it would have deployed.
That's the whole video. Green means ship.

### The proof it actually shipped

**Show:** the footer of the app — a short commit hash.

**Do:** refresh after the deploy goes green. The hash changes. Click it: GitHub
opens on the exact commit that's running.

**Say:** this is the bit people skip. "It deployed" is usually somebody watching
a green tick and *assuming*. This is the running app telling you which commit it
is. If the hash didn't change, the deploy didn't land — and now you know that in
one second instead of debugging a change that was never there.

> Both deploy jobs will report **skipped** with a note until you add the
> Supabase and Railway credentials — that's deliberate, so the pipeline is green
> from the first push instead of red until everything's wired up.

---

## Things worth saying somewhere

- You don't have to know *how* any of this works. You have to know it should
  exist, and ask for it. That's what
  [`CLAUDE.md`](../CLAUDE.md) and the
  [vibe-coding skill](../.claude/skills/vibe-coding-with-confidence/) are for —
  they're the standing instructions, so every new feature arrives with tests
  instead of you remembering to ask.
- Mocking isn't cheating. You're not testing Zapier. You're testing that *your*
  code turns a given input into the right output, consistently, while you keep
  changing everything around it.
- End-to-end tests are the ones people over-invest in. They're slow and they
  break for boring reasons. A handful of them, plus a lot of fast unit tests, is
  the ratio that actually holds up.
