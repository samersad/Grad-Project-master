const express = require('express');
const multer = require('multer');
const { authenticate, optionalAuthenticate, authorizeRoles } = require('./middleware/auth');
const auth = require('./controllers/auth.controller');
const users = require('./controllers/user.controller');
const apartments = require('./controllers/apartment.controller');
const bookings = require('./controllers/booking.controller');
const notifications = require('./controllers/notification.controller');
const chats = require('./controllers/chat.controller');
const storage = require('./controllers/storage.controller');
const functions = require('./controllers/function.controller');
const chatbot = require('./controllers/chatbot.controller');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // Increased to 50MB for videos
});

router.post('/auth/register', auth.register);
router.post('/auth/login', auth.login);
router.post('/auth/exchange', authenticate, auth.exchangeSession);
router.post('/auth/logout', authenticate, auth.logout);
router.get('/auth/me', authenticate, auth.me);
router.post('/auth/password-reset', auth.resetPassword);
router.post('/auth/password-reset/verify-otp', auth.verifyResetOTP);
router.post('/auth/password-reset/confirm', auth.confirmPasswordReset);
router.patch('/auth/password', authenticate, auth.updatePassword);
router.delete('/auth/account', authenticate, auth.deleteAccount);

router.get('/users', authenticate, users.listUsers);
router.get('/users/:id', optionalAuthenticate, users.getUser);
router.post('/users', authenticate, users.upsertUser);
router.put('/users/:id', authenticate, users.updateUser);
router.patch('/users/:id', authenticate, users.updateUser);

router.get('/apartments', optionalAuthenticate, apartments.listApartments);
router.get('/apartments/search', optionalAuthenticate, apartments.searchApartments);
router.get('/apartments/:id', optionalAuthenticate, apartments.getApartment);
router.post('/apartments', authenticate, apartments.createApartment);
router.put('/apartments/:id', authenticate, apartments.updateApartment);
router.patch('/apartments/:id', authenticate, apartments.updateApartment);
router.patch('/apartments/:id/verify', authenticate, authorizeRoles('admin'), apartments.setApartmentVerification);
router.delete('/apartments/:id', authenticate, apartments.deleteApartment);

router.get('/bookings', authenticate, bookings.listBookings);
router.get('/bookings/active/check', authenticate, bookings.hasActiveBookingForApartment);
router.get('/bookings/:id', authenticate, bookings.getBooking);
router.post('/bookings', authenticate, bookings.createBooking);
router.patch('/bookings/:id/status', authenticate, bookings.updateStatus);
router.post('/bookings/:id/status', authenticate, bookings.updateStatus);
router.post('/bookings/:id/rating', authenticate, bookings.rateBooking);

router.get('/notifications', authenticate, notifications.listNotifications);
router.post('/notifications', authenticate, notifications.createNotification);
router.patch('/notifications/:id/read', authenticate, notifications.markRead);
router.patch('/notifications/read-all/:receiverId', authenticate, notifications.markAllRead);

router.get('/chats', authenticate, chats.listChats);
router.post('/chats', authenticate, chats.upsertChat);
router.get('/chats/:chatId', authenticate, chats.getChat);
router.delete('/chats/:chatId', authenticate, chats.deleteChat);
router.get('/chats/:chatId/messages', authenticate, chats.listMessages);
router.post('/chats/:chatId/messages', authenticate, chats.sendMessage);
router.get('/messages', authenticate, chats.listMessages);
router.post('/messages', authenticate, chats.sendMessage);
router.delete('/messages/:id', authenticate, chats.deleteMessage);

router.post('/storage/:bucket', authenticate, upload.single('file'), storage.upload);
router.delete('/storage/:bucket', authenticate, storage.remove);

router.post('/rpc/update_booking_status_with_capacity', authenticate, bookings.updateStatus);
router.post('/rpc/rate_booking', authenticate, bookings.rateBooking);

router.post('/functions/send-booking-notification', authenticate, functions.sendBookingNotification);
router.post('/functions/send-chat-notification', authenticate, functions.sendChatNotification);
router.post('/functions/send-booking-status-notification', authenticate, functions.sendBookingStatusNotification);

router.post('/chatbot', optionalAuthenticate, chatbot.handleChat);
router.post('/ai/chat', optionalAuthenticate, chatbot.handleChat);

module.exports = router;
