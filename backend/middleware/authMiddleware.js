const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        // Check if token exists
        if (!authHeader) {
            return res.status(401).json({
                error: "Authorization token required"
            });
        }

        // Expected:
        // Authorization: Bearer TOKEN
        const token = authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                error: "Invalid authorization format"
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