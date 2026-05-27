import { google } from "googleapis";
import { getSuperAdminEmails } from "./superAdmin";

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN!;
const FROM_EMAIL = process.env.FROM_EMAIL!;

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  "https://developers.google.com/oauthplayground",
);

oAuth2Client.setCredentials({
  refresh_token: REFRESH_TOKEN,
});

async function sendEmail(
  to: string | string[],
  subject: string,
  text: string,
) {
  try {
    const gmail = google.gmail({
      version: "v1",
      auth: oAuth2Client,
    });

    const recipients = Array.isArray(to) ? to.join(", ") : to;

    const messageParts = [
      `From: ${FROM_EMAIL}`,
      `To: ${recipients}`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
      `Subject: ${subject}`,
      "",
      text,
    ];

    const message = messageParts.join("\n");

    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    return result.data;
  } catch (error) {
    console.error("GMAIL API ERROR:", error);
    throw error;
  }
}

export function sendApprovalRequestEmail(
  newUserName: string,
  newUserEmail: string,
): void {
  const recipients = getSuperAdminEmails();

  if (recipients.length === 0) return;

  const link = `${process.env.FRONTEND_URL}/admin/pending-users`;

  sendEmail(
    recipients,
    `New registration pending approval — ${newUserEmail}`,
    `A new user has registered and is awaiting approval.

Name: ${newUserName}
Email: ${newUserEmail}

Review pending users:
${link}`,
  ).catch((err: unknown) =>
    console.error("Approval request email error:", err),
  );
}

export function sendAccountApprovedEmail(
  toEmail: string,
  name: string,
): void {
  const link = `${process.env.FRONTEND_URL}/login`;

  sendEmail(
    toEmail,
    "Your account has been approved",
    `Hi ${name},

Your account has been approved.

You can now log in:
${link}`,
  ).catch((err: unknown) =>
    console.error("Account approved email error:", err),
  );
}

export function sendPasswordResetEmail(
  toEmail: string,
  rawToken: string,
): void {
  const link = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;

  sendEmail(
    toEmail,
    "Reset your password",
    `You requested a password reset.

Use the link below — it expires in 1 hour:

${link}

If you did not request this, ignore this email.`,
  ).catch((err: unknown) =>
    console.error("Password reset email error:", err),
  );
}