import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { getSuperAdminEmails } from "./superAdmin";
import { setDefaultResultOrder } from "node:dns";

setDefaultResultOrder("ipv4first");

const transportOptions: SMTPTransport.Options = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  }
};

const transporter = nodemailer.createTransport(transportOptions);

// const FROM_EMAIL = process.env.SMTP_FROM;

export function sendApprovalRequestEmail(
  newUserName: string,
  newUserEmail: string,
): void {
  const recipients = getSuperAdminEmails();
  if (recipients.length === 0) return;

  const link = `${process.env.FRONTEND_URL}/admin/pending-users`;

  transporter
    .sendMail({
      // from: FROM_EMAIL,
      to: recipients.join(", "),
      subject: `New registration pending approval — ${newUserEmail}`,
      text: `A new user has registered and is awaiting approval.\n\nName: ${newUserName}\nEmail: ${newUserEmail}\n\nReview pending users: ${link}`,
    })
    .catch((err: unknown) => console.error("Mail error:", err));
}

export function sendAccountApprovedEmail(toEmail: string, name: string): void {
  const link = `${process.env.FRONTEND_URL}/login`;

  transporter
    .sendMail({
      // from: FROM_EMAIL,
      to: toEmail,
      subject: "Your account has been approved",
      text: `Hi ${name},\n\nYour account has been approved. You can now log in.\n\n${link}`,
    })
    .catch((err: unknown) => console.error("Mail error:", err));
}

export function sendPasswordResetEmail(
  toEmail: string,
  rawToken: string,
): void {
  const link = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;

  transporter
    .sendMail({
      // from: FROM_EMAIL,
      to: toEmail,
      subject: "Reset your password",
      text: `You requested a password reset. Use the link below — it expires in 1 hour.\n\n${link}\n\nIf you did not request this, ignore this email.`,
    })
    .catch((err: unknown) => console.error("Mail error:", err));
}
