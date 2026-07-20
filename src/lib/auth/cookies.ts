/**
 * Auth cookie names — isolated in their own module (no `next/headers` import)
 * so both the Edge middleware and Node server code can share them.
 */
export const ACCESS_TOKEN_COOKIE = "sfc_access";
export const REFRESH_TOKEN_COOKIE = "sfc_refresh";
