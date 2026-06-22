// Shared time-range helpers for bulk email actions.
// A "range" is represented as a compact token string so it can be stored
// directly in browser.storage.local and rendered in <select> options:
//   "<amount><unit>"  where unit is h (hours), d (days) or w (weeks)
//   e.g. "24h", "3d", "2w"
// Plus one special token: "yesterday".

export const UNITS = {
    h: { label: 'Hours', singular: 'Hour', ms: 60 * 60 * 1000 },
    d: { label: 'Days', singular: 'Day', ms: 24 * 60 * 60 * 1000 },
    w: { label: 'Weeks', singular: 'Week', ms: 7 * 24 * 60 * 60 * 1000 }
};

// The always-available presets shown even when the user has not added any.
export const BUILTIN_PRESETS = ['24h', 'yesterday', '48h', '7d'];

// Build a token from an amount + unit pair. Returns null if invalid.
export function makeToken(amount, unit) {
    const n = Math.floor(Number(amount));
    if (!Number.isFinite(n) || n <= 0) return null;
    if (!UNITS[unit]) return null;
    return `${n}${unit}`;
}

// Parse a token into { amount, unit }. Returns null for "yesterday" or invalid input.
export function parseToken(token) {
    if (!token || typeof token !== 'string') return null;
    const match = token.trim().match(/^(\d+)([hdw])$/);
    if (!match) return null;
    return { amount: parseInt(match[1], 10), unit: match[2] };
}

// Human-readable label for a token, e.g. "Last 24 Hours", "Yesterday", "Last 3 Days".
export function formatToken(token) {
    if (token === 'yesterday') return 'Yesterday';
    const parsed = parseToken(token);
    if (!parsed) return token;
    const { amount, unit } = parsed;
    const noun = amount === 1 ? UNITS[unit].singular : UNITS[unit].label;
    return `Last ${amount} ${noun}`;
}

// Compute a { start, end } Date range for a token relative to `now`.
// Unknown tokens fall back to the last 24 hours so callers never get a null range.
export function computeRange(token, now = new Date()) {
    if (token === 'yesterday') {
        const start = new Date(now);
        start.setDate(now.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }

    const parsed = parseToken(token) || { amount: 24, unit: 'h' };
    const end = new Date(now);
    const start = new Date(now.getTime() - parsed.amount * UNITS[parsed.unit].ms);
    return { start, end };
}
