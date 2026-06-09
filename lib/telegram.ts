/**
 * Telegram Bot API client for sending alert notifications.
 */

import { fetchWithTimeout } from './http';

// 18.1 - Telegram Bot API client
export async function sendMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<boolean> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }, 8000);
  return response.ok;
}

// 18.3 - Send with retry (max 2 retries)
export async function sendMessageWithRetry(
  botToken: string,
  chatId: string,
  text: string,
  maxRetries = 2
): Promise<boolean> {
  let attempts = 0;
  while (attempts <= maxRetries) {
    try {
      const success = await sendMessage(botToken, chatId, text);
      if (success) return true;
    } catch {
      // Network error, will retry
    }
    attempts++;
    if (attempts <= maxRetries) {
      // Brief delay before retry (500ms * attempt number)
      await new Promise((resolve) => setTimeout(resolve, 500 * attempts));
    }
  }
  return false;
}

// 18.2 - Message formatting functions

export interface FixedReminderData {
  title: string;
  route: string;
  origin: string;
  destination: string;
  time: string;
  platform: string;
  offsetMinutes: number;
  status: string;
}

export interface ChangeAlertData {
  title: string;
  changeDescription: string;
  platform: string;
  nextReminderMinutes?: number;
}

export interface CancellationData {
  title: string;
  route: string;
  departureTime: string;
}

/**
 * Format a fixed reminder message for Telegram.
 * Includes route title, line, origin→destination, time, platform, offset, and status.
 */
export function formatFixedReminder(data: FixedReminderData): string {
  const lines = [
    `🚆 <b>${data.title}</b>`,
    ``,
    `${data.route} | ${data.origin} → ${data.destination}`,
    `🕐 Departs: <b>${data.time}</b> | Platform ${data.platform}`,
    `⏰ ${data.offsetMinutes} min reminder`,
    `Status: ${data.status}`,
  ];
  return lines.join('\n');
}

/**
 * Format a change alert message for Telegram.
 * Includes route title, change description, platform, and next reminder timing.
 * 18.4 - Only format delay if data explicitly shows delay (enforced by caller).
 */
export function formatChangeAlert(data: ChangeAlertData): string {
  const lines = [
    `⚠️ <b>${data.title}</b> — Change Detected`,
    ``,
    data.changeDescription,
    `Platform: ${data.platform}`,
  ];
  if (data.nextReminderMinutes !== undefined) {
    lines.push(`Next reminder in ${data.nextReminderMinutes} min`);
  }
  return lines.join('\n');
}

/**
 * Format a cancellation message for Telegram.
 * 18.5 - Includes route name, departure time, and suggests opening the app.
 */
export function formatCancellation(data: CancellationData): string {
  const lines = [
    `❌ <b>Train Cancelled</b>`,
    ``,
    `${data.title} (${data.route})`,
    `Scheduled departure: ${data.departureTime}`,
    ``,
    `Open the app to check alternative services.`,
  ];
  return lines.join('\n');
}
