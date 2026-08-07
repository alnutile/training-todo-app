# Testing & CI/CD — keep it working while you keep changing it

Vibe coding's real risk isn't the feature you're building. It's the four you
already shipped. Every change is a chance to quietly break one of them, and the
only affordable way to notice is to have machines check.

**Green means ship.** Red means it doesn't merge, and it doesn't deploy.

You don't have to write these tests. You have to ask for them, every time, and
keep them honest.

---

## The rules

1. **Every feature arrives with its tests.** Same prompt, same commit. "Add a due
   date, and cover it in the tests" is one request, not two.
2. **No test ever calls a real outside service.** Fake it at the *network* layer
   so your real code and the real SDK still run. Money, rate limits, other
   people's data, and 2am outages are all reasons; speed is a bonus.
3. **Make un-faked calls fail.** `onUnhandledRequest: 'error'`. Without it,
   "these tests don't hit the API" is a hope. With it, it's enforced.
4. **Override real credentials with fake ones in the test config.** A suite must
   not be able to authenticate against production just because the laptop
   running it is logged in.
5. **Build fakes from the real contract.** Watch what the SDK actually requests
   and mirror it. A mock returning a shape the real API never returns is worse
   than no test — it's a green light pointing the wrong way.
6. **Keep the rules in pure functions.** Validation, ordering, status mapping,
   realtime reconciliation: input in, output out, no I/O. Cheapest tests you'll
   ever write, and where most bugs actually live.
7. **Migrations run against a real, disposable database** — never against
   production from a branch.
8. **Security rules get tests.** RLS isolation belongs in SQL that runs on every
   push, not in an incognito window you remember to open.
9. **Red before green.** A test that has never failed hasn't been shown to work.
10. **Nothing deploys unless CI is green**, and deploy steps skip with a clear
    note when their credentials aren't set up yet — so the pipeline is green from
    day one instead of red until everything's wired.

---

## Where to fake, layer by layer

Same idea, one layer further out each time. The code under test never knows.

| What you're testing | Environment | Tool | What it intercepts |
|---|---|---|---|
| Server-side agent / SDK calls | Node | [MSW](https://mswjs.io) | `fetch` in Node |
| React components | jsdom | MSW | same, in a browser-shaped env |
| The whole app | real Chrome | Playwright `page.route` | the page's own network |
| Edge / serverless function | Deno | inject `fetch` as a dependency | the call the handler makes |
| Database + migrations | Docker | **don't fake** | — |

The last row matters. A migration that has never met a real Postgres hasn't been
tested. Start a throwaway database in CI, apply everything from scratch, assert
against it, delete it.

---

## The pyramid, in practice

- **Lots** of unit tests over pure functions. Milliseconds each.
- **Some** component tests: does the screen render this data, does the button
  send that request.
- **A handful** of end-to-end tests. They catch the "it doesn't even load"
  class of failure and nothing else cheaply.

End-to-end is the one people over-invest in. It's slow, it breaks for boring
reasons, and it tempts you into testing logic that belongs three layers down.
A few, covering the paths you'd be embarrassed to break.

---

## Design for testability (small habits, big payoff)

- **Pass dependencies in.** A `runSync({ zapier, supabase, config, log })` can be
  handed real clients pointed at a fake network. A function that constructs its
  own clients from `process.env` at import time can only be tested by mocking
  your own code — which tests nothing.
- **Thin entry points.** `main.ts` / `index.ts` should wire real things together
  and nothing else. Logic lives where it can be called directly.
- **Log through an injected logger**, so a test can assert on what the job said
  it did.
- **Return a result object** from long-running work (`{ read, sent, upserted }`)
  instead of only printing. Assertions get precise, and so do your logs.

---

## The workflow shape

```
branch push ──→ CI (fast, hermetic, no secrets)
             └→ Database checks (only when migrations changed)

pull request ─→ both, as required checks

merge to main ─→ Deploy: re-run CI + DB checks, then
                 migrations → functions → app
```

- CI needs **no secrets at all** — that's what makes it safe to run on every
  push, including from forks.
- The deploy workflow **reuses** the CI workflow rather than trusting that it ran
  earlier. That's the gate.
- Deploy in dependency order. A UI expecting a column the database doesn't have
  yet is the classic "it passed and still broke" deploy.

## Secrets and environments

- **Secret** = encrypted, masked in logs, never in the repo (API tokens, DB
  passwords).
- **Variable** = same delivery, not sensitive (a project ref that's already
  public in your URL). Using a variable where a variable belongs makes the real
  secrets easier to see.
- **Environment** = a named bucket of secrets plus rules (required reviewers,
  branch restrictions). Declaring `environment: production` on a job is what
  makes a staging deploy structurally unable to touch production.
- **Never in CI:** the key that bypasses row-level security (`service_role` and
  friends). It belongs on the one server that needs it.

## Worked example

The to-do repo this skill ships with: `docs/ci-cd.md` for the map,
`agents/google-tasks-sync/tests/mocks/zapier.ts` for a network-level fake of a
third-party SDK, and `supabase/tests/rls_test.sql` for security-as-a-test.
