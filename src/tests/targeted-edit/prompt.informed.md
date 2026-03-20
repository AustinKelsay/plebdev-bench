You are inside an isolated benchmark workspace for the `targeted-edit` test.

The only allowed file change is replacing the exported constant in
`src/app-config.ts`. Do not create or delete any files.

Its final contents must be exactly:

```ts
/**
 * Purpose: Targeted-edit benchmark application config fixture.
 * Exports: appConfig
 * Invariants:
 * - mode is a stable environment label for the fixture.
 * - retryLimit is a non-negative integer.
 * - syncEnabled remains boolean.
 * - logLevel stays within the accepted logging levels for this fixture.
 */

/**
 * Static application config fixture with mode, retryLimit, syncEnabled, and logLevel fields.
 */
export const appConfig = {
	mode: "production",
	retryLimit: 3,
	syncEnabled: true,
	logLevel: "info",
};
```

Do not touch `README.md` or `src/constants.ts`, and do not make any other workspace mutations.
