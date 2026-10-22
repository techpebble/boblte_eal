/**
 * Shared by the auth middleware and the controllers, in its own file so that
 * importing the permission check does not drag the middleware (and with it
 * the User model) into places that do not need it.
 */
export { ADMIN_ROLE_NAME } from './permissions.js';

/** Does this user's role allow `key`? A system role allows everything. */
export const can = (user, key) => {
    const role = user?.role;
    if (!role) return false;
    if (role.isSystem) return true;
    return Array.isArray(role.permissions) && role.permissions.includes(key);
};
