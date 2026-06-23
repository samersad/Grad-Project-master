const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: {
      user: env.smtp.user,
      pass: env.smtp.pass,
    },
  });

  return transporter;
}

/**
 * Send a password-reset OTP email.
 * @param {string} to   – recipient email address
 * @param {string} otp  – the 6-digit OTP code
 */
async function sendPasswordResetOTP(to, otp) {
  const mail = getTransporter();

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1a1a2e; font-size: 24px; margin: 0;">SOKON</h1>
        <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Student Housing Platform</p>
      </div>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
      <h2 style="color: #1a1a2e; font-size: 20px; text-align: center;">Password Reset Code</h2>
      <p style="color: #4b5563; font-size: 15px; text-align: center; line-height: 1.6;">
        You requested to reset your password. Use the code below to verify your identity:
      </p>
      <div style="background: #f0f4ff; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #234ba0;">${otp}</span>
      </div>
      <p style="color: #6b7280; font-size: 13px; text-align: center;">
        This code expires in <strong>10 minutes</strong>. Do not share it with anyone.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        If you did not request this, please ignore this email.
      </p>
    </div>
  `;

  await mail.sendMail({
    from: env.smtp.from,
    to,
    subject: 'SOKON – Your Password Reset Code',
    html: htmlBody,
  });
}

module.exports = { sendPasswordResetOTP };
