require('dotenv').config();
const jwt = require('jsonwebtoken');


// JWT Secret (in production, use a strong secret from environment)
const JWT_SECRET = process.env.JWT_SECRET || '';
// JWT REFRESH Secret (in production, use a very strong secret from environment)
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "";

/* ================================
   GENERATE TOKENS
================================ */
const generateAccessToken = (user) => {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "15m" }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_REFRESH_SECRET,
    { expiresIn: "30d" }
  );
};

module.exports = { generateAccessToken, generateRefreshToken, JWT_SECRET, JWT_REFRESH_SECRET };