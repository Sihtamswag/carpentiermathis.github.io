const { normalizeWorkspace } = require('../db');

// Reads ?workspace=... (GET) or { workspace } in the body (POST/PUT), so
// every route under this middleware can just use req.workspace to filter or
// tag rows without repeating the normalization logic everywhere.
function workspaceMiddleware(req, res, next) {
    req.workspace = normalizeWorkspace(req.query.workspace || (req.body && req.body.workspace));
    next();
}

module.exports = workspaceMiddleware;
