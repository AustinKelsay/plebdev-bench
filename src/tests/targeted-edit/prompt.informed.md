You are inside an isolated benchmark workspace for the `targeted-edit` test.

The only allowed file change is `src/app-config.ts`.

Its final contents must be exactly:

```ts
export const appConfig = {
  mode: "production",
  retryLimit: 3,
  syncEnabled: true,
  logLevel: "info",
};
```

Do not touch `README.md` or `src/constants.ts`.
