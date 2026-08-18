# Stack profiles

Load only the profile that matches the repository detected by `ycf audit` or `ycf understand`.

## TypeScript and JavaScript

- Run `ycf map .` and `ycf impact <module> .` before changing exported functions, routes, or shared utilities.
- Treat `any`, suppressed TypeScript errors, unused dependencies, and large components as review items; do not widen types or delete dependencies blindly.
- Run the repository's typecheck, test, and build scripts after approved changes.

## React

- Review effect dependencies, async cleanup, component size, and prop/API consumers together.
- Before changing a hook or shared component, use `ycf impact` and inspect both direct consumers and transitive dependents.
- Do not add dependency arrays or cancellation code automatically when the intended render lifecycle is unknown; explain the risk first.

## PHP and WordPress

- Treat hooks, callbacks, REST routes, AJAX actions, and dynamic entry points as potentially used even when static references are missing.
- Review nonce, capability, sanitization, escaping, SQL preparation, and sensitive response findings before publishing.
- Never remove a WordPress callback or plugin file solely because it looks unused. Ask for the hook/route context and verify in a safe environment.
- WordPress plugins commonly bundle a licensing/monetization SDK wholesale (Freemius is the most common) as a plain top-level folder. It is not `vendor/`, so YCF's default ignores miss it. See [reviewing-external-code.md](reviewing-external-code.md) before trusting a score on a plugin you did not author.
