import { FastifyInstance } from 'fastify';

export const DELIVER_NOTIFICATION = 'DELIVER_NOTIFICATION';
export const NOTIFICATION_FALLBACK = 'NOTIFICATION_FALLBACK';

type NotificationPayload = {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  template?: string;
  templateParameters?: string[];
  sendExternal?: boolean;
  channel?: 'in_app' | 'whatsapp' | 'sms';
};

function toPhoneNumber(phone: string) {
  return phone.replace(/[^0-9]/g, '').replace(/^0+/, '');
}

async function translateText(server: FastifyInstance, text: string, targetLanguage: string) {
  if (!text || targetLanguage === 'en') {
    return text;
  }

  const apiUrl = process.env.BHASHINI_API_URL;
  const apiToken = process.env.BHASHINI_API_TOKEN;
  if (!apiUrl || !apiToken) {
    return text;
  }

  try {
    const response = await fetch(`${apiUrl}/translate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sourceLanguage: 'en',
        targetLanguage: targetLanguage,
        text
      })
    });

    if (!response.ok) {
      server.log.warn({ status: response.status }, 'Bhashini translation failed');
      return text;
    }

    const json = (await response.json()) as any;
    return json.translatedText ?? json.translated_text ?? json.data?.translatedText ?? text;
  } catch (error) {
    server.log.warn({ error }, 'Bhashini translation service failed');
    return text;
  }
}

async function sendWhatsAppMessage(
  server: FastifyInstance,
  phone: string,
  message: string,
  language: string,
  template?: string,
  templateParameters?: string[]
) {
  const apiUrl = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!apiUrl || !token) {
    server.log.warn('WhatsApp service not configured');
    return false;
  }

  const cleanedPhone = toPhoneNumber(phone);
  const body: any = template
    ? {
        to: `91${cleanedPhone}`,
        type: 'template',
        template: {
          name: template,
          language: { code: language },
          components: [
            {
              type: 'BODY',
              parameters: (templateParameters ?? []).map((value) => ({ type: 'text', text: value }))
            }
          ]
        }
      }
    : {
        to: `91${cleanedPhone}`,
        type: 'text',
        text: {
          body: message
        }
      };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      server.log.error({ status: response.status, body }, 'WhatsApp send failed');
      return false;
    }

    return true;
  } catch (error) {
    server.log.error({ error, body: message }, 'WhatsApp send error');
    return false;
  }
}

async function sendSmsMessage(server: FastifyInstance, phone: string, message: string) {
  const apiKey = process.env.MSG91_API_KEY;
  const senderId = process.env.MSG91_SENDER_ID ?? 'KISANDI';
  if (!apiKey) {
    server.log.warn('MSG91 API key not configured, SMS not sent');
    return false;
  }

  const cleanedPhone = toPhoneNumber(phone);
  const payload = {
    sender: senderId,
    route: '4',
    country: '91',
    sms: [
      {
        message: [{ type: 'plain', text: message }],
        to: [cleanedPhone]
      }
    ]
  };

  try {
    const response = await fetch('https://api.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        authkey: apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      server.log.error({ status: response.status, response: text }, 'MSG91 SMS send failed');
      return false;
    }

    return true;
  } catch (error) {
    server.log.error({ error }, 'MSG91 send error');
    return false;
  }
}

export function createNotificationService(server: FastifyInstance) {
  async function createNotification(payload: NotificationPayload & { userId: string }) {
    const userResult = await server.db.query('SELECT phone, language FROM public.users WHERE id = $1', [payload.userId]);
    const user = userResult.rows[0];
    if (!user) {
      throw server.httpErrors.notFound('User not found');
    }

    const language = user.language ?? 'en';
    const title = await translateText(server, payload.title, language);
    const body = await translateText(server, payload.body, language);
    const templateParameters = payload.templateParameters
      ? await Promise.all(payload.templateParameters.map((value) => translateText(server, value, language)))
      : null;

    const insertResult = await server.db.query(
      `INSERT INTO public.notifications (user_id, type, title, body, data, channel, status, sent_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,NOW(),NOW()) RETURNING id`,
      [
        payload.userId,
        payload.type,
        title,
        body,
        payload.data ?? null,
        payload.channel ?? 'whatsapp',
        payload.sendExternal === false ? 'IN_APP' : 'PENDING'
      ]
    );

    const notificationId = insertResult.rows[0].id;

    if (payload.sendExternal !== false && user.phone) {
      await server.queues.notificationQueue.add(DELIVER_NOTIFICATION, { notificationId }, { removeOnComplete: true, removeOnFail: false });
    }

    return { notification_id: notificationId };
  }

  async function deliverNotification(notificationId: string) {
    const result = await server.db.query(
      `SELECT n.*, u.phone AS phone, u.language AS language
       FROM public.notifications n
       JOIN public.users u ON n.user_id = u.id
       WHERE n.id = $1`,
      [notificationId]
    );

    const notification = result.rows[0];
    if (!notification) {
      return null;
    }

    if (notification.status === 'SENT') {
      return notification;
    }

    const phone = notification.phone;
    const language = notification.language ?? 'en';
    const template = notification.channel === 'whatsapp' ? notification.data?.template : undefined;
    const templateParameters = Array.isArray(notification.data?.templateParameters)
      ? (notification.data?.templateParameters as string[])
      : undefined;

    const whatsappResult = await sendWhatsAppMessage(server, phone, notification.body, language, template, templateParameters);
    if (whatsappResult) {
      await server.db.query(
        `UPDATE public.notifications SET status = $1, delivered_via = $2, sent_at = NOW(), updated_at = NOW() WHERE id = $3`,
        ['SENT', 'whatsapp', notificationId]
      );
      await server.queues.notificationQueue.add(NOTIFICATION_FALLBACK, { notificationId }, { delay: 2 * 60 * 1000, removeOnComplete: true, removeOnFail: false });
      return { notificationId, delivered_via: 'whatsapp' };
    }

    await server.db.query(
      `UPDATE public.notifications SET status = $1, updated_at = NOW() WHERE id = $2`,
      ['FAILED', notificationId]
    );

    await server.queues.notificationQueue.add(NOTIFICATION_FALLBACK, { notificationId }, { delay: 2 * 60 * 1000, removeOnComplete: true, removeOnFail: false });
    return { notificationId, delivered_via: null };
  }

  async function fallbackNotification(notificationId: string) {
    const result = await server.db.query(
      `SELECT n.*, u.phone AS phone, u.language AS language
       FROM public.notifications n
       JOIN public.users u ON n.user_id = u.id
       WHERE n.id = $1`,
      [notificationId]
    );

    const notification = result.rows[0];
    if (!notification) {
      return null;
    }

    if (notification.status === 'SENT') {
      return notification;
    }

    const phone = notification.phone;
    const smsBody = notification.body;
    const smsResult = await sendSmsMessage(server, phone, smsBody);
    if (smsResult) {
      await server.db.query(
        `UPDATE public.notifications SET status = $1, delivered_via = $2, sent_at = NOW(), updated_at = NOW() WHERE id = $3`,
        ['SENT', 'sms', notificationId]
      );
      return { notificationId, delivered_via: 'sms' };
    }

    await server.db.query(
      `UPDATE public.notifications SET status = $1, updated_at = NOW() WHERE id = $2`,
      ['FAILED', notificationId]
    );
    return { notificationId, delivered_via: null };
  }

  async function createInAppNotification(userId: string, data: Omit<NotificationPayload, 'sendExternal' | 'channel'>) {
    return createNotification({ ...data, userId, sendExternal: false, channel: 'in_app' });
  }

  async function getNotifications(userId: string) {
    const result = await server.db.query(
      `SELECT id, type, title, body, data, channel, delivered_via, status, is_read, sent_at, created_at
       FROM public.notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [userId]
    );
    return result.rows;
  }

  async function getUnreadCount(userId: string) {
    const result = await server.db.query(`SELECT COUNT(*) AS count FROM public.notifications WHERE user_id = $1 AND is_read = false`, [userId]);
    return Number(result.rows[0]?.count ?? 0);
  }

  async function markAsRead(userId: string, notificationId: string) {
    const result = await server.db.query(
      `UPDATE public.notifications SET is_read = true, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id`,
      [notificationId, userId]
    );
    if (result.rows.length === 0) {
      throw server.httpErrors.notFound('Notification not found');
    }
    return { notification_id: notificationId, read: true };
  }

  return {
    createNotification,
    createInAppNotification,
    deliverNotification,
    fallbackNotification,
    getNotifications,
    getUnreadCount,
    markAsRead
  };
}
