const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const signAccessToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });

const signRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });

const sendTokens = async (user, statusCode, res) => {
  const accessToken = signAccessToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  user.password = undefined;
  user.refreshToken = undefined;

  res.status(statusCode).json({
    status: 'success',
    accessToken,
    refreshToken,
    data: { user },
  });
};

exports.register = catchAsync(async (req, res, next) => {
  const { fullName, email, password, roles, phone, city } = req.body;

  if (!fullName || !email || !password) {
    return next(new ApiError(400, 'Full name, email, and password are required.'));
  }

  const allowedRoles = ['donor', 'seeker'];
  let assignedRoles = ['seeker'];
  if (roles && Array.isArray(roles)) {
    assignedRoles = roles.filter((r) => allowedRoles.includes(r));
    if (assignedRoles.length === 0) assignedRoles = ['seeker'];
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return next(new ApiError(409, 'An account with this email already exists.'));
  }

  const user = await User.create({
    fullName,
    email,
    password,
    roles: assignedRoles,
    phone,
    city,
  });

  await sendTokens(user, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new ApiError(400, 'Please provide email and password.'));
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    return next(new ApiError(401, 'Incorrect email or password.'));
  }

  if (!user.isActive) {
    return next(new ApiError(403, 'Your account has been deactivated. Contact support.'));
  }

  console.log('User logged in:', user);

  await sendTokens(user, 200, res);
});

exports.logout = catchAsync(async (req, res, next) => {
  await User.findByIdAndUpdate(req.user.id, { refreshToken: null });
  res.status(200).json({ status: 'success', message: 'Logged out successfully.' });
});

exports.refresh = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return next(new ApiError(400, 'Refresh token is required.'));
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    return next(new ApiError(401, 'Invalid or expired refresh token.'));
  }

  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user || user.refreshToken !== refreshToken) {
    return next(new ApiError(401, 'Refresh token is invalid or has been revoked.'));
  }

  await sendTokens(user, 200, res);
});

exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(new ApiError(400, 'Please provide your email address.'));

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    // Don't reveal whether the email exists
    return res.status(200).json({
      status: 'success',
      message: 'If that email is registered, a reset code has been sent.',
    });
  }

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // In production this token would be emailed. Returning it here for prototype/dev.
  res.status(200).json({
    status: 'success',
    message: 'If that email is registered, a reset code has been sent.',
    ...(process.env.NODE_ENV === 'development' && { resetToken }),
  });
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return next(new ApiError(400, 'Reset token and new password are required.'));
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  }).select('+passwordResetToken +passwordResetExpires');

  if (!user) {
    return next(new ApiError(400, 'Token is invalid or has expired.'));
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  await sendTokens(user, 200, res);
});
