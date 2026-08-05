export const appModeMiddleware = (req, res, next) => {
    const appMode = req.headers['x-app-mode'] ? String(req.headers['x-app-mode']).toLowerCase().trim() : 'admin';
    const validModes = ['admin', 'reception', 'general'];
    req.appMode = validModes.includes(appMode) ? appMode : 'admin';
    next();
};
