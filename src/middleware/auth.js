const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

exports.protect = catchAsync(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new ApiError(401, 'You are not logged in. Please log in to get access.'));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Your session has expired. Please log in again.'));
    }
    return next(new ApiError(401, 'Invalid token. Please log in again.'));
  }

  const user = await User.findById(decoded.id).select('+isActive');
  if (!user || !user.isActive) {
    return next(new ApiError(401, 'The user belonging to this token no longer exists.'));
  }

  req.user = user;
  next();
});

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    const hasRole = roles.some((role) => req.user.roles.includes(role));
    if (!hasRole) {
      return next(new ApiError(403, 'You do not have permission to perform this action.'));
    }
    next();
  };
};
