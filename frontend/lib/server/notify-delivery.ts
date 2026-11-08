// ---------------------------------------------------------------------------
// Fan-out of an in-app notification to the external channels a user enabled.
//
// In-app notifications always exist in the `notifications` table. This helper
// additionally attempts email/SMS only when the user's stored preferences ask
// for it, and returns the real delivery outcomes so a route can report them.
// A missing provider is reported as `not_configured`, never as success.
// ---------------------------------------------------------------------------
import { getUserById } from "./db";
import { sendMail, sendSms, type DeliveryResult } from "./mailer";

interface Preferences {
  email?: boolean;
  sms?: boolean;
  push?: boolean;
}

function parsePreferences(raw: string | null | undefined): Preferences {
  try {
    return raw ? (JSON.parse(raw) as Preferences) : {};
  } catch {
    return {};
  }
}

export interface ExternalNotification {
  subject: string;
  body: string;
  notificationId?: string | null;
}

/** Attempt enabled external channels for one user. Returns [] if none apply. */
export async function deliverToUserChannels(
  userId: string,
  notification: ExternalNotification
): Promise<DeliveryResult[]> {
  const user = getUserById(userId);
  if (!user) return [];
  const prefs = parsePreferences(user.preferences);
  const results: DeliveryResult[] = [];

  // Email defaults to on unless explicitly disabled, matching the settings UI.
  if (prefs.email !== false && user.email) {
    results.push(
      await sendMail({
        to: user.email,
        subject: notification.subject,
        body: notification.body,
        notificationId: notification.notificationId,
      })
    );
  }
  if (prefs.sms === true && user.phone) {
    results.push(
      await sendSms({
        to: user.phone,
        body: `${notification.subject}: ${notification.body}`.slice(0, 320),
        notificationId: notification.notificationId,
      })
    );
  }
  return results;
}
