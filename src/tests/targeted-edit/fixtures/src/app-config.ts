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
	retryLimit: 1,
	syncEnabled: false,
	logLevel: "info",
};
