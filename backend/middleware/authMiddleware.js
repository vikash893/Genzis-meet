const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
    try {
        let token;
        if (req.headers.authorization) {
            token = req.headers.authorization.split(" ")[1];
        } else if (req.query && req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return res.status(401).json({
                error: "Authorization token required"
            });
        }

        // Verify token
        const jwtSecret = process.env.JWT_SECRET || "default_jwt_secret_key_123";
        const decoded = jwt.verify(
            token,
            jwtSecret
        );

        // Save decoded information in request
        req.user = decoded;

        next();

    } catch (error) {
        return res.status(401).json({
            error: "Invalid or expired token"
        });
    }
};

module.exports = authMiddleware;