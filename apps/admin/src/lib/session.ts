/**
 * Name of the httpOnly cookie this app sets on its own origin to hold the
 * opaque API token. Kept out of the route file because a Next.js route module
 * may only export request handlers.
 */
export const SESSION_COOKIE = 'tc_admin_session';
