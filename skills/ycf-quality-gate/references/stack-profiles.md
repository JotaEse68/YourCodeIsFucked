# Stack profiles

Load only the profile that matches the repository detected by `ycf audit` or `ycf understand`.

## TypeScript and JavaScript

- Run `ycf map .` and `ycf impact <module> .` before changing exported functions, routes, or shared utilities.
- Treat `any`, suppressed TypeScript errors, unused dependencies, and large components as review items; do not widen types or delete dependencies blindly.
- Run the repository's typecheck, test, and build scripts after approved changes.

### Organization conventions

Before proposing any move, run `ycf understand .` and check `.ycf/modules.json` for the folder structure that already exists. If a convention is already partially present (a `utils/`, `services/`, or `lib/` folder with some files in it), extend it -- do not invent a competing one. If no convention exists yet, use the smallest set of folders that separates responsibilities: `services/` or `api/` for external calls, `utils/` or `lib/` for pure helpers with no side effects, `types/` for shared type declarations not colocated with their module. Keep test files wherever the project already keeps them (colocated `*.test.ts` next to source, or a separate `__tests__/` tree) -- match the existing pattern, do not switch it.

## React

- Review effect dependencies, async cleanup, component size, and prop/API consumers together.
- Before changing a hook or shared component, use `ycf impact` and inspect both direct consumers and transitive dependents.
- Do not add dependency arrays or cancellation code automatically when the intended render lifecycle is unknown; explain the risk first.

### Organization conventions

Follow the widely-recognized React split when introducing structure: `components/` for presentational UI (one file per component, named to match the exported component), `hooks/` for custom hooks (`useXxx.ts`), `contexts/` or `store/` for shared state, `pages/` or `routes/` for route-level components if the project uses file-based or declarative routing. Move one component at a time with `ycf move`, verify after each move, and never regroup a component that is a route entry point or a dynamic `import()` target without confirming its usage first -- dynamic import targets are invisible to static analysis.

## PHP and WordPress

- Treat hooks, callbacks, REST routes, AJAX actions, and dynamic entry points as potentially used even when static references are missing.
- Review nonce, capability, sanitization, escaping, SQL preparation, and sensitive response findings before publishing.
- Never remove a WordPress callback or plugin file solely because it looks unused. Ask for the hook/route context and verify in a safe environment.
- WordPress plugins commonly bundle a licensing/monetization SDK wholesale (Freemius is the most common) as a plain top-level folder. It is not `vendor/`, so YCF's default ignores miss it. See [reviewing-external-code.md](reviewing-external-code.md) before trusting a score on a plugin you did not author.

### Organization conventions

For a WordPress plugin, follow the widely-used WordPress Plugin Boilerplate layout when reorganizing: `includes/` for core classes and shared logic, `admin/` for admin-only screens and hooks, `public/` for front-end-facing code, `languages/` for translations. Never move a file registered as a REST route, AJAX handler, cron callback, or activation/deactivation hook without first tracing every `add_action`/`add_filter`/`register_rest_route` call that references it by path or class name -- WordPress resolves many of these dynamically, so a move that "looks safe" from imports alone can silently break a hook.
