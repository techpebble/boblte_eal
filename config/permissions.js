/**
 * Every permission this app recognises.
 *
 * One entry per thing a person can do, not one per endpoint: several routes
 * share a permission where they are the same act seen from different angles.
 * Roles are built out of these keys, so a key that is not listed here does
 * not exist as far as authorisation is concerned.
 */
export const PERMISSIONS = [
    { key: 'dashboard:view', group: 'Overview', label: 'See the dashboard' },

    { key: 'issuance:view', group: 'EAL Issuance', label: 'See issuances' },
    { key: 'issuance:create', group: 'EAL Issuance', label: 'Record an issuance' },
    { key: 'issuance:delete', group: 'EAL Issuance', label: 'Remove an unused issuance' },

    { key: 'usage:view', group: 'EAL Usage', label: 'See production runs' },
    { key: 'usage:create', group: 'EAL Usage', label: 'Record labels applied' },
    { key: 'usage:delete', group: 'EAL Usage', label: 'Remove a run and return its labels' },

    { key: 'dispatch:view', group: 'Dispatch', label: 'See dispatch notes' },
    { key: 'dispatch:create', group: 'Dispatch', label: 'Raise a dispatch note' },
    { key: 'dispatch:edit', group: 'Dispatch', label: 'Change a draft note' },
    { key: 'dispatch:delete', group: 'Dispatch', label: 'Delete a draft note' },
    { key: 'dispatch:link', group: 'Dispatch', label: 'Link and unlink serial ranges' },
    { key: 'dispatch:status', group: 'Dispatch', label: 'Move a note along its statuses' },

    { key: 'stock:view', group: 'Inventory', label: 'See EAL stock' },
    { key: 'finished:view', group: 'Inventory', label: 'See finished stock' },

    { key: 'eal:trace', group: 'Lookup', label: 'Trace a label' },

    {
        key: 'scan:manual',
        group: 'Scanning',
        label: 'Type a serial by hand',
        note: 'Without this a serial has to be scanned. Typing one is how a '
            + 'wrong number gets into the records, so it is given out '
            + 'deliberately rather than held by everyone.'
    },

    { key: 'masterdata:view', group: 'Master data', label: 'See items, packs, depots and companies' },
    { key: 'masterdata:manage', group: 'Master data', label: 'Add and change master data' },

    { key: 'users:manage', group: 'Administration', label: 'Add and change users' },
    { key: 'roles:manage', group: 'Administration', label: 'Add and change roles' },

    {
        key: 'companies:all',
        group: 'Administration',
        label: 'See every company, not only their own',
        note: 'Without this a person sees only the company their account belongs to.'
    }
];

export const PERMISSION_KEYS = PERMISSIONS.map((permission) => permission.key);

/**
 * Permissions no built-in role starts with.
 *
 * scan:manual is one of these on purpose. Typing a serial is how a wrong
 * number reaches the records - a transposed digit reads as a real label -
 * so it is given to the people who are trusted to do it rather than handed
 * to every operator by default. Administrator holds every key, so there is
 * always someone who can.
 */
export const GRANTED_DELIBERATELY = ['scan:manual'];

/** The role that cannot be edited away, so there is always a way back in. */
export const ADMIN_ROLE_NAME = 'Administrator';

/**
 * The roles a fresh install starts with. Administrator holds everything and
 * is protected; the other three mirror the role names the user model used
 * before roles were records, so existing language still means something.
 */
export const BUILT_IN_ROLES = [
    {
        name: ADMIN_ROLE_NAME,
        description: 'Full access, including users and roles. Cannot be edited or removed.',
        isSystem: true,
        permissions: PERMISSION_KEYS
    },
    {
        name: 'Storekeeper',
        description: 'Receives labels from the excise department and watches stock.',
        isSystem: false,
        permissions: [
            'dashboard:view',
            'issuance:view', 'issuance:create', 'issuance:delete',
            'stock:view', 'finished:view', 'eal:trace', 'masterdata:view'
        ]
    },
    {
        name: 'Production',
        description: 'Records the labels applied on the line.',
        isSystem: false,
        permissions: [
            'dashboard:view',
            'usage:view', 'usage:create', 'usage:delete',
            'stock:view', 'finished:view', 'eal:trace', 'masterdata:view'
        ]
    },
    {
        // Exactly what the Flutter app calls, and nothing else. It is not a
        // scanner but the whole operation in a phone: it lists issuance,
        // usage and dispatch, records issuances and usages, links and unlinks
        // serial ranges, and marks a note loaded with its vehicle. None of
        // the three roles above spans all of that, so without this a phone
        // user has to be an administrator.
        name: 'Field Operator',
        description: 'For the mobile app: records issuance and usage, links serial ranges, marks notes loaded and traces a label.',
        isSystem: false,
        permissions: [
            'dashboard:view',
            'issuance:view', 'issuance:create', 'issuance:delete',
            'usage:view', 'usage:create',
            'dispatch:view', 'dispatch:link', 'dispatch:status',
            // Tracing is the one thing done with a label in the hand rather
            // than from a list, and it is the phone's home screen action.
            // The three roles this one was built from all hold it; leaving
            // it out of the role made for the app was an oversight.
            'eal:trace',
            'masterdata:view'
        ]
    },
    {
        name: 'Dispatch',
        description: 'Raises dispatch notes and links serial ranges to cases.',
        isSystem: false,
        permissions: [
            'dashboard:view',
            'dispatch:view', 'dispatch:create', 'dispatch:edit', 'dispatch:delete',
            'dispatch:link', 'dispatch:status',
            'finished:view', 'eal:trace', 'masterdata:view'
        ]
    }
];

/** Which of the keys given are not permissions this app knows about. */
export const unknownPermissions = (keys = []) =>
    keys.filter((key) => !PERMISSION_KEYS.includes(key));

/**
 * Who may read master data.
 *
 * Reading the lists is implied by being allowed to record against them: a
 * role with usage:create but not masterdata:view could open the production
 * screen and then be refused the list of items to record against, which is
 * a role that cannot do the one thing it was given. The Demo Role on this
 * server is exactly that.
 *
 * masterdata:manage is here too — being allowed to change a list and not
 * read it was never intended.
 */
export const MASTERDATA_READERS = [
    'masterdata:view',
    'masterdata:manage',
    'issuance:create',
    'usage:create',
    'dispatch:create'
];
