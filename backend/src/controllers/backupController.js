const gmailService = require('../services/gmailService');
const storageService = require('../services/storageService');
const EmailMeta = require('../models/EmailMeta');

const getSessionUser = (req) => {
  const session = req.user || {};
  const user = session.user || session;
  const userId = user && user._id ? user._id : null;

  return { user, userId };
};

const startOfDay = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const startOfWeek = (date) => {
  const value = startOfDay(date);
  const day = value.getDay();
  const diff = day === 0 ? 6 : day - 1;
  value.setDate(value.getDate() - diff);
  return value;
};

const startOfMonth = (date) => {
  const value = startOfDay(date);
  value.setDate(1);
  return value;
};

const MIME_LINE_BREAK = '\r\n';

const sanitizeHeaderValue = (value) => {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
};

const normalizeBody = (value) => {
  return String(value || '').replace(/\r?\n/g, MIME_LINE_BREAK);
};

const isLikelyHtml = (value) => /<\/?[a-z][\s\S]*>/i.test(String(value || ''));

const chunkBase64 = (value) => {
  const chunks = [];
  for (let i = 0; i < value.length; i += 76) {
    chunks.push(value.slice(i, i + 76));
  }
  return chunks.join(MIME_LINE_BREAK);
};

const toBase64Url = (value) => {
  const base64 = Buffer.isBuffer(value)
    ? value.toString('base64')
    : Buffer.from(String(value || ''), 'utf8').toString('base64');

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const buildRawMimeEmail = (emailData, attachmentPayloads) => {
  const subject = sanitizeHeaderValue(emailData.subject || '(No Subject)');
  const from = sanitizeHeaderValue(emailData.from || 'unknown@example.com');
  const to = sanitizeHeaderValue(emailData.to || from);
  const body = normalizeBody(emailData.body || '');
  const dateValue = emailData.date ? new Date(emailData.date) : null;
  const hasValidDate = dateValue && !Number.isNaN(dateValue.getTime());
  const contentType = isLikelyHtml(body) ? 'text/html' : 'text/plain';

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`
  ];

  if (hasValidDate) {
    headers.push(`Date: ${dateValue.toUTCString()}`);
  }

  if (!Array.isArray(attachmentPayloads) || attachmentPayloads.length === 0) {
    return [
      ...headers,
      `Content-Type: ${contentType}; charset="UTF-8"`,
      'Content-Transfer-Encoding: 8bit',
      '',
      body
    ].join(MIME_LINE_BREAK);
  }

  const boundary = `gmail-backup-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const lines = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: ${contentType}; charset="UTF-8"`,
    'Content-Transfer-Encoding: 8bit',
    '',
    body
  ];

  attachmentPayloads.forEach((attachment, index) => {
    const filename = sanitizeHeaderValue(attachment.filename || `attachment-${index + 1}`);
    const partType = sanitizeHeaderValue(attachment.contentType || 'application/octet-stream');
    const partBase64 = chunkBase64(Buffer.from(attachment.content).toString('base64'));

    lines.push(
      `--${boundary}`,
      `Content-Type: ${partType}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      partBase64
    );
  });

  lines.push(`--${boundary}--`, '');
  return lines.join(MIME_LINE_BREAK);
};

const getBackupPayload = async (emailMeta) => {
  if (emailMeta && emailMeta.supabasePath) {
    return storageService.getEmailBackupJson(emailMeta.supabasePath);
  }

  return emailMeta && emailMeta.fullContent ? emailMeta.fullContent : null;
};

const resolveAttachmentPayloads = async (emailMeta, backupPayload) => {
  const candidateAttachments = Array.isArray(backupPayload && backupPayload.attachments) && backupPayload.attachments.length > 0
    ? backupPayload.attachments
    : (Array.isArray(emailMeta && emailMeta.attachmentPaths) ? emailMeta.attachmentPaths : []);

  const attachments = [];

  for (const attachment of candidateAttachments) {
    if (!attachment || !attachment.supabasePath) {
      continue;
    }

    const buffer = await storageService.getFileBuffer(attachment.supabasePath);
    attachments.push({
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      content: buffer
    });
  }

  return attachments;
};

const getHttpStatusCode = (error) => {
  if (!error) {
    return null;
  }

  return error.code
    || error.status
    || (error.response && error.response.status)
    || (error.cause && error.cause.code)
    || null;
};

const withDeletedStatus = async (gmail, emails) => {
  const enriched = [];

  for (const email of emails) {
    const checkInboxStatus = async (messageId) => {
      if (!messageId) {
        return { exists: false, inInbox: false, notFound: false };
      }

      try {
        const message = await gmail.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'metadata'
        });

        const labels = Array.isArray(message && message.data && message.data.labelIds)
          ? message.data.labelIds
          : [];

        return {
          exists: true,
          inInbox: labels.includes('INBOX'),
          notFound: false
        };
      } catch (err) {
        const statusCode = getHttpStatusCode(err);
        if (statusCode === 404) {
          return { exists: false, inInbox: false, notFound: true };
        }
        return { exists: false, inInbox: false, notFound: false };
      }
    };

    try {
      const originalStatus = await checkInboxStatus(email.messageId);

      if (originalStatus.inInbox) {
        enriched.push({
          ...email,
          deleted: false,
          restored: false,
          activeMessageId: email.messageId
        });
        continue;
      }

      if (email.restoredMessageId) {
        const restoredStatus = await checkInboxStatus(email.restoredMessageId);

        if (restoredStatus.inInbox) {
          enriched.push({
            ...email,
            deleted: false,
            restored: true,
            activeMessageId: email.restoredMessageId
          });
          continue;
        }
      }

      enriched.push({
        ...email,
        deleted: true,
        restored: false,
        activeMessageId: null
      });
    } catch (err) {
      enriched.push({
        ...email,
        deleted: false,
        restored: false,
        activeMessageId: email.messageId || null
      });
    }
  }

  return enriched;
};

const GMAIL_STATUS_CACHE_TTL_MS = Number(process.env.GMAIL_STATUS_CACHE_TTL_MS) || 60 * 1000;
const GMAIL_STATUS_REFRESH_LIMIT = Number(process.env.GMAIL_STATUS_REFRESH_LIMIT) || 75;
const GMAIL_STATUS_CONCURRENCY = Math.max(1, Number(process.env.GMAIL_STATUS_CONCURRENCY) || 6);

const pLimit = (concurrency) => {
  let activeCount = 0;
  const queue = [];

  const next = () => {
    if (activeCount >= concurrency) {
      return;
    }

    const item = queue.shift();
    if (!item) {
      return;
    }

    activeCount += 1;
    const { fn, resolve, reject } = item;

    Promise.resolve()
      .then(fn)
      .then(resolve)
      .catch(reject)
      .finally(() => {
        activeCount -= 1;
        next();
      });
  };

  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
};

const enrichWithCachedGmailStatus = async (gmail, userId, emails) => {
  const now = Date.now();
  const limit = pLimit(GMAIL_STATUS_CONCURRENCY);

  const isFresh = (checkedAt) => {
    if (!checkedAt) return false;
    const time = new Date(checkedAt).getTime();
    if (!Number.isFinite(time)) return false;
    return (now - time) >= 0 && (now - time) < GMAIL_STATUS_CACHE_TTL_MS;
  };

  const baseFromCache = (email) => {
    const deleted = Boolean(email && email.deleted);
    const restored = Boolean(email && email.restored);
    const activeMessageId = email && email.activeMessageId
      ? email.activeMessageId
      : (email && email.messageId ? email.messageId : null);

    return {
      ...email,
      deleted,
      restored,
      activeMessageId
    };
  };

  // Refresh only a bounded subset per request.
  const refreshCandidates = [];
  for (const email of emails) {
    if (refreshCandidates.length >= GMAIL_STATUS_REFRESH_LIMIT) {
      break;
    }

    if (!isFresh(email && email.statusCheckedAt)) {
      refreshCandidates.push(email);
    }
  }

  const refreshedById = new Map();
  const statusCheckedAt = new Date();

  const refreshed = await Promise.all(
    refreshCandidates.map((email) => limit(async () => {
      const enriched = (await withDeletedStatus(gmail, [email]))[0] || baseFromCache(email);

      refreshedById.set(String(email._id), enriched);

      await EmailMeta.updateOne(
        { _id: email._id, userId },
        {
          $set: {
            deleted: Boolean(enriched.deleted),
            restored: Boolean(enriched.restored),
            activeMessageId: enriched.activeMessageId || null,
            statusCheckedAt
          }
        }
      );

      return enriched;
    }))
  );

  const refreshedIds = new Set(refreshed.map((row) => String(row && row._id)));

  return emails.map((email) => {
    const id = String(email && email._id);
    if (refreshedIds.has(id)) {
      return refreshedById.get(id);
    }
    return baseFromCache(email);
  });
};

exports.startBackup = async (req, res) => {
  try {
    const { user, userId } = getSessionUser(req);

    if (!userId || (!user.accessToken && !user.refreshToken)) {
      return res.status(401).json({
        message: 'Google session is missing. Please sign out and sign in again.'
      });
    }

    console.log(`Starting backup for user ${userId}`);
    const gmail = await gmailService.getGmailClientForUser(user);
    
    // Fetch last 10 messages for testing
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 10,
      labelIds: ['INBOX'],
      includeSpamTrash: false
    });
    const messages = listRes.data.messages || [];

    if (messages.length === 0) {
      return res.json({ success: true, backedUp: 0, message: 'No new emails found to back up.' });
    }

    const results = [];
    for (const msg of messages) {
      // Skip if already backed up
      let exists = await EmailMeta.findOne({ userId, messageId: msg.id });

      if (!exists) {
        exists = await EmailMeta.findOne({ userId, restoredMessageId: msg.id });
      }

      const needsAttachmentRepair = exists
        && Array.isArray(exists.fullContent && exists.fullContent.attachments)
        && exists.fullContent.attachments.length > 0
        && (!Array.isArray(exists.attachmentPaths) || exists.attachmentPaths.length === 0);

      if (exists && !needsAttachmentRepair) continue;

      const fullEmail = await gmailService.processEmail(gmail, msg.id);
      const storageResult = await storageService.uploadToSupabase(userId.toString(), msg.id, fullEmail);
      const fullContent = {
        ...fullEmail,
        attachments: storageResult.attachments
      };
      delete fullContent.attachmentBlobs;

      if (exists) {
        await EmailMeta.updateOne(
          { _id: exists._id },
          {
            $set: {
              threadId: fullEmail.threadId,
              subject: fullEmail.subject,
              from: fullEmail.from,
              to: fullEmail.to,
              date: fullEmail.date,
              supabasePath: storageResult.emailJsonPath,
              attachmentPaths: storageResult.attachments,
              fullContent
            }
          }
        );
      } else {
        try {
          await EmailMeta.create({
            userId,
            messageId: msg.id,
            threadId: fullEmail.threadId,
            subject: fullEmail.subject,
            from: fullEmail.from,
            to: fullEmail.to,
            date: fullEmail.date,
            supabasePath: storageResult.emailJsonPath,
            attachmentPaths: storageResult.attachments,
            fullContent
          });
        } catch (createErr) {
          if (createErr && createErr.code === 11000) {
            continue;
          }
          throw createErr;
        }
      }
      results.push(msg.id);
    }

    console.log(`Backup completed for user ${userId}: ${results.length} email(s)`);
    res.json({ success: true, backedUp: results.length });
  } catch (err) {
    console.error('Backup failed:', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.importEmails = async (req, res) => {
  try {
    const { user, userId } = getSessionUser(req);

    if (!userId || (!user.accessToken && !user.refreshToken)) {
      return res.status(401).json({
        message: 'Google session is missing. Please sign out and sign in again.'
      });
    }

    console.log(`Starting import for user ${userId}`);
    const gmail = await gmailService.getGmailClientForUser(user);
    
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 500,
      labelIds: ['INBOX'],
      includeSpamTrash: false
    });
    const messages = listRes.data.messages || [];

    if (messages.length === 0) {
      return res.json({ success: true, imported: 0, message: 'No emails found to import.' });
    }

    const results = [];
    for (const msg of messages) {
      let exists = await EmailMeta.findOne({ userId, messageId: msg.id });

      if (!exists) {
        exists = await EmailMeta.findOne({ userId, restoredMessageId: msg.id });
      }

      const needsAttachmentRepair = exists
        && Array.isArray(exists.fullContent && exists.fullContent.attachments)
        && exists.fullContent.attachments.length > 0
        && (!Array.isArray(exists.attachmentPaths) || exists.attachmentPaths.length === 0);

      if (exists && !needsAttachmentRepair) continue;

      const fullEmail = await gmailService.processEmail(gmail, msg.id);
      const storageResult = await storageService.uploadToSupabase(userId.toString(), msg.id, fullEmail);
      const fullContent = {
        ...fullEmail,
        attachments: storageResult.attachments
      };
      delete fullContent.attachmentBlobs;

      if (exists) {
        await EmailMeta.updateOne(
          { _id: exists._id },
          {
            $set: {
              threadId: fullEmail.threadId,
              subject: fullEmail.subject,
              from: fullEmail.from,
              to: fullEmail.to,
              date: fullEmail.date,
              supabasePath: storageResult.emailJsonPath,
              attachmentPaths: storageResult.attachments,
              fullContent
            }
          }
        );
      } else {
        try {
          await EmailMeta.create({
            userId,
            messageId: msg.id,
            threadId: fullEmail.threadId,
            subject: fullEmail.subject,
            from: fullEmail.from,
            to: fullEmail.to,
            date: fullEmail.date,
            supabasePath: storageResult.emailJsonPath,
            attachmentPaths: storageResult.attachments,
            fullContent
          });
        } catch (createErr) {
          if (createErr && createErr.code === 11000) {
            continue;
          }
          throw createErr;
        }
      }
      results.push(msg.id);
    }

    console.log(`Import completed for user ${userId}: ${results.length} email(s)`);
    res.json({ success: true, imported: results.length });
  } catch (err) {
    console.error('Import failed:', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.getInbox = async (req, res) => {
  try {
    const { user, userId } = getSessionUser(req);

    if (!userId) {
      return res.status(401).json({
        message: 'Google session is missing. Please sign out and sign in again.'
      });
    }

    const { id } = req.query;
    const includeGmailStatus = String(req.query.includeGmailStatus || '').toLowerCase() === 'true';
    const includeFullContentParam = String(req.query.includeFullContent || '').toLowerCase() === 'true';
    const includeFullContent = id ? true : includeFullContentParam;

    let gmailClient = null;
    if (includeGmailStatus) {
      if (!user || (!user.accessToken && !user.refreshToken)) {
        return res.status(401).json({
          message: 'Google session is missing. Please sign out and sign in again.'
        });
      }

      gmailClient = await gmailService.getGmailClientForUser(user);
    }

    if (id) {
      const emailQuery = EmailMeta.findOne({ _id: id, userId });
      const email = await emailQuery.lean();
      const emails = email
        ? (includeGmailStatus ? await enrichWithCachedGmailStatus(gmailClient, userId, [email]) : [email])
        : [];

      return res.json({
        success: true,
        emails,
        total: email ? 1 : 0
      });
    }

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 10000)
      : null;
    const filter = { userId };
    const emailsQuery = EmailMeta.find(filter)
      .sort({ date: -1, _id: -1 })
      .select(includeFullContent ? undefined : '-fullContent');

    if (limit) {
      emailsQuery.limit(limit);
    }

    const [emailsRaw, total] = await Promise.all([
      emailsQuery.lean(),
      EmailMeta.countDocuments(filter)
    ]);

    const emails = includeGmailStatus
      ? await enrichWithCachedGmailStatus(gmailClient, userId, emailsRaw)
      : emailsRaw.map((email) => ({
        ...email,
        deleted: Boolean(email && email.deleted),
        restored: Boolean(email && email.restored),
        activeMessageId: email && email.activeMessageId
          ? email.activeMessageId
          : (email && email.messageId ? email.messageId : null)
      }));

    return res.json({
      success: true,
      emails,
      total
    });
  } catch (err) {
    console.error('Failed to load inbox:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const { userId } = getSessionUser(req);

    if (!userId) {
      return res.status(401).json({
        message: 'Google session is missing. Please sign out and sign in again.'
      });
    }

    const now = new Date();
    const today = startOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);

    const [total, todayCount, weekCount, monthCount] = await Promise.all([
      EmailMeta.countDocuments({ userId }),
      EmailMeta.countDocuments({ userId, date: { $gte: today } }),
      EmailMeta.countDocuments({ userId, date: { $gte: weekStart } }),
      EmailMeta.countDocuments({ userId, date: { $gte: monthStart } })
    ]);

    return res.json({
      success: true,
      stats: {
        total,
        today: todayCount,
        thisWeek: weekCount,
        thisMonth: monthCount
      }
    });
  } catch (err) {
    console.error('Failed to load dashboard stats:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

exports.getEmailAttachments = async (req, res) => {
  try {
    const { userId } = getSessionUser(req);

    if (!userId) {
      return res.status(401).json({
        message: 'Google session is missing. Please sign out and sign in again.'
      });
    }

    const { id } = req.params;
    const email = await EmailMeta.findOne({ _id: id, userId })
      .select('supabasePath attachmentPaths fullContent.attachments')
      .lean();

    if (!email) {
      return res.status(404).json({ success: false, message: 'Email not found.' });
    }

    let attachments = Array.isArray(email.attachmentPaths) && email.attachmentPaths.length > 0
      ? email.attachmentPaths
      : (Array.isArray(email.fullContent && email.fullContent.attachments)
        ? email.fullContent.attachments
        : []);

    const hasSupabasePaths = attachments.some((attachment) => attachment && attachment.supabasePath);

    if ((!attachments.length || !hasSupabasePaths) && email.supabasePath) {
      try {
        const backupJson = await storageService.getEmailBackupJson(email.supabasePath);
        const backupAttachments = Array.isArray(backupJson && backupJson.attachments)
          ? backupJson.attachments
          : [];

        if (backupAttachments.length > 0) {
          attachments = backupAttachments;

          await EmailMeta.updateOne(
            { _id: id, userId },
            {
              $set: {
                attachmentPaths: backupAttachments,
                'fullContent.attachments': backupAttachments
              }
            }
          );
        }
      } catch (err) {
        console.warn(`Attachment backfill from Supabase failed for email ${id}:`, err.message);
      }
    }

    const enriched = await Promise.all(
      attachments.map(async (attachment) => {
        if (!attachment || !attachment.supabasePath) {
          return {
            filename: attachment && attachment.filename ? attachment.filename : 'attachment',
            contentType: attachment && attachment.contentType ? attachment.contentType : 'application/octet-stream',
            size: attachment && attachment.size ? attachment.size : 0,
            url: null
          };
        }

        try {
          const url = await storageService.getSignedAttachmentUrl(attachment.supabasePath);
          return {
            ...attachment,
            url
          };
        } catch (err) {
          return {
            ...attachment,
            url: null,
            error: err.message
          };
        }
      })
    );

    return res.json({
      success: true,
      attachments: enriched
    });
  } catch (err) {
    console.error('Failed to load attachments:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

exports.restoreEmails = async (req, res) => {
  try {
    const { user, userId } = getSessionUser(req);

    if (!userId || (!user.accessToken && !user.refreshToken)) {
      return res.status(401).json({
        message: 'Google session is missing. Please sign out and sign in again.'
      });
    }

    const emailIds = Array.isArray(req.body && req.body.emailIds)
      ? req.body.emailIds.filter(Boolean)
      : [];

    const requestedLimit = parseInt(req.body && req.body.limit, 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 200)
      : 20;

    const filter = emailIds.length > 0
      ? { userId, _id: { $in: emailIds } }
      : { userId };

    const query = EmailMeta.find(filter)
      .sort({ date: -1, _id: -1 })
      .select('subject from to date supabasePath attachmentPaths fullContent')
      .lean();

    if (emailIds.length === 0) {
      query.limit(limit);
    }

    const emails = await query;

    if (emails.length === 0) {
      return res.json({
        success: true,
        restored: 0,
        failed: [],
        message: 'No backed up emails found to restore.'
      });
    }

    const gmail = await gmailService.getGmailClientForUser(user);
    const restored = [];
    const failed = [];

    for (const email of emails) {
      try {
        const backupPayload = await getBackupPayload(email);

        if (!backupPayload) {
          throw new Error('Backup payload is missing for this email.');
        }

        const attachmentPayloads = await resolveAttachmentPayloads(email, backupPayload);
        const rawEmail = buildRawMimeEmail(backupPayload, attachmentPayloads);

        const internalDateValue = backupPayload && backupPayload.date
          ? new Date(backupPayload.date).getTime()
          : null;

        const response = await gmail.users.messages.insert({
          userId: 'me',
          requestBody: {
            raw: toBase64Url(rawEmail),
            labelIds: ['INBOX'],
            internalDate: Number.isFinite(internalDateValue) ? String(internalDateValue) : undefined
          }
        });

        restored.push({
          id: email._id,
          importedMessageId: response.data && response.data.id ? response.data.id : null
        });

        await EmailMeta.updateOne(
          { _id: email._id, userId },
          {
            $set: {
              restoredMessageId: response.data && response.data.id ? response.data.id : null,
              restoredAt: new Date()
            }
          }
        );
      } catch (error) {
        const statusCode = getHttpStatusCode(error);
        const rawMessage = String(error && error.message ? error.message : '').toLowerCase();
        const isScopeIssue = statusCode === 403
          && (rawMessage.includes('insufficient') || rawMessage.includes('scope'));

        failed.push({
          id: email._id,
          subject: email.subject || '(No Subject)',
          error: isScopeIssue
            ? 'Missing Gmail restore permission. Please sign out and sign in again to grant restore scope.'
            : error.message
        });
      }
    }

    return res.json({
      success: true,
      restored: restored.length,
      failed,
      attempted: emails.length
    });
  } catch (err) {
    console.error('Restore failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
};