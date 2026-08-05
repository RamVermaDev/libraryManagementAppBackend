/**
 * checkSubscription.mjs
 * 
 * Middleware that runs AFTER authenticate().
 * Blocks write actions when the user's subscription (trial or paid) has expired.
 * Read-only routes must NOT use this middleware.
 */

const checkSubscription = (req, res, next) => {
    const subscription = req.user?.subscription;

    // If no subscription data at all — let through (old account, graceful fallback)
    if (!subscription) return next();

    const { status, endAt } = subscription;

    // "active" paid plan — always allowed
    if (status === 'active') return next();

    // Trial or expired — check the date
    if (endAt && new Date(endAt) < new Date()) {
        return res.status(403).json({
            success: false,
            code: 'SUBSCRIPTION_EXPIRED',
            message: 'Your subscription has expired. Please upgrade to continue.',
        });
    }

    // Trial still valid
    return next();
};

export { checkSubscription };
