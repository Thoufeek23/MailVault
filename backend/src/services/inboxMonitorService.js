const EmailMeta = require('../models/EmailMeta');
const User = require('../models/User');
const gmailService = require('./gmailService');
const storageService = require('./storageService');
const nlpService = require('./nlpService');

const MONITOR_INTERVAL_MS = Number(process.env.INBOX_MONITOR_INTERVAL_MS) || 1000;
const MONITOR_FETCH_LIMIT = Number(process.env.INBOX_MONITOR_FETCH_LIMIT) || 50;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const monitors = new Map();

const emitToClients = (monitor, payload) => {
  const body = JSON.stringify(payload);

  for (const client of monitor.clients) {
    if (client.readyState === 1) {
      client.send(body);
    }
  }
};

const backupRecentInboxMessages = async (user, afterDate) => {
  const gmail = await gmailService.getGmailClientForUser(user);
  const query = {
    userId: 'me',
    maxResults: MONITOR_FETCH_LIMIT,
    labelIds: ['INBOX'],
    includeSpamTrash: false
  };

  if (afterDate) {
    const afterSeconds = Math.max(0, Math.floor(afterDate.getTime() / 1000) - 60);
    query.q = `after:${afterSeconds}`;
  }

  const listRes = await gmail.users.messages.list(query);
  const messages = listRes.data.messages || [];

  if (!messages.length) {
    return { backedUp: 0, messageIds: [] };
  }

  const messageIds = messages.map((msg) => msg.id);
  const existing = await EmailMeta.find({
    userId: user._id,
    $or: [
      { messageId: { $in: messageIds } },
      { restoredMessageId: { $in: messageIds } }
    ]
  }).select('_id messageId restoredMessageId fullContent attachmentPaths').lean();
  const existingById = new Map(existing.map((row) => [row.messageId, row]));
  const existingByRestoredId = new Map(
    existing
      .filter((row) => row.restoredMessageId)
      .map((row) => [row.restoredMessageId, row])
  );

  for (const messageId of messageIds) {
    const byMessage = existingById.get(messageId);
    const byRestored = existingByRestoredId.get(messageId);

    if (!byMessage || !byRestored || String(byMessage._id) === String(byRestored._id)) {
      continue;
    }

    // Keep the original canonical backup row and remove the duplicate auto-copied row.
    await EmailMeta.deleteOne({ _id: byMessage._id, userId: user._id });
    await EmailMeta.updateOne(
      { _id: byRestored._id, userId: user._id },
      {
        $set: {
          messageId,
          restoredMessageId: null,
          restoredAt: null
        }
      }
    );

    existingById.set(messageId, {
      ...byRestored,
      messageId,
      restoredMessageId: null,
      restoredAt: null
    });
    existingByRestoredId.delete(messageId);
  }

  const relinkMessages = messages.filter((msg) => !existingById.has(msg.id) && existingByRestoredId.has(msg.id));
  const newMessages = messages.filter((msg) => !existingById.has(msg.id) && !existingByRestoredId.has(msg.id));
  const repairMessages = messages.filter((msg) => {
    const record = existingById.get(msg.id) || existingByRestoredId.get(msg.id);
    if (!record) {
      return false;
    }

    const hasAttachmentsInContent = Array.isArray(record.fullContent && record.fullContent.attachments)
      && record.fullContent.attachments.length > 0;
    const missingAttachmentPaths = hasAttachmentsInContent
      && (!Array.isArray(record.attachmentPaths) || record.attachmentPaths.length === 0);

    return !record.fullContent || !record.fullContent.body || missingAttachmentPaths;
  });

  if (!newMessages.length && !repairMessages.length && !relinkMessages.length) {
    return { backedUp: 0, messageIds: [] };
  }

  const copied = [];

  for (const msg of relinkMessages) {
    const canonical = existingByRestoredId.get(msg.id);
    if (!canonical) {
      continue;
    }

    // Clean up historical duplicates that may have been created before dedupe logic.
    await EmailMeta.deleteMany({
      userId: user._id,
      messageId: msg.id,
      _id: { $ne: canonical._id }
    });

    await EmailMeta.updateOne(
      { _id: canonical._id, userId: user._id },
      {
        $set: {
          messageId: msg.id,
          restoredMessageId: null,
          restoredAt: null
        }
      }
    );

    copied.push(msg.id);
  }

  for (const msg of newMessages) {
    const fullEmail = await gmailService.processEmail(gmail, msg.id);
    const storageResult = await storageService.uploadToSupabase(user._id.toString(), msg.id, fullEmail);
    const fullContent = {
      ...fullEmail,
      attachments: storageResult.attachments
    };
    delete fullContent.attachmentBlobs;

    try {
      await EmailMeta.create({
        userId: user._id,
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
      copied.push(msg.id);
      try {
        await nlpService.createAndStoreEmbedding(
          user._id.toString(),
          msg.id,
          fullEmail.body || '', // Extracting the body text
          storageService.supabase
        );
        await sleep(4000);
      } catch (embedErr) {
        console.error(`Embedding failed for new message ${msg.id}:`, embedErr.message);
      }
    } catch (createErr) {
      if (createErr && createErr.code === 11000) {
        continue;
      }
      throw createErr;
    }
  }

  for (const msg of repairMessages) {
    const fullEmail = await gmailService.processEmail(gmail, msg.id);
    const storageResult = await storageService.uploadToSupabase(user._id.toString(), msg.id, fullEmail);
    const fullContent = {
      ...fullEmail,
      attachments: storageResult.attachments
    };
    delete fullContent.attachmentBlobs;

    const existingRecord = existingById.get(msg.id) || existingByRestoredId.get(msg.id);
    const filter = existingRecord
      ? { _id: existingRecord._id, userId: user._id }
      : { userId: user._id, messageId: msg.id };

    await EmailMeta.updateOne(
      filter,
      {
        $set: {
          messageId: msg.id,
          restoredMessageId: null,
          restoredAt: null,
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

    copied.push(msg.id);
    try {
      await nlpService.createAndStoreEmbedding(
        user._id.toString(),
        msg.id,
        fullEmail.body || '', // Extracting the body text
        storageService.supabase
      );
      await sleep(4000);
    } catch (embedErr) {
      console.error(`Embedding failed for repaired message ${msg.id}:`, embedErr.message);
    }
  }

  return { backedUp: copied.length, messageIds: copied };
};

const pollMonitor = async (monitor) => {
  if (monitor.isPolling) {
    return;
  }

  monitor.isPolling = true;

  try {
    const user = await User.findById(monitor.userId);

    if (!user) {
      emitToClients(monitor, {
        type: 'monitor:error',
        message: 'User no longer exists. Monitoring stopped.'
      });
      stopMonitor(monitor.userId);
      return;
    }

    const afterDate = monitor.lastCheckedAt || user.lastSync || null;
    const result = await backupRecentInboxMessages(user, afterDate);
    monitor.lastCheckedAt = new Date();

    if (result.backedUp > 0) {
      user.lastSync = monitor.lastCheckedAt;
      await user.save();

      emitToClients(monitor, {
        type: 'backup:copied',
        backedUp: result.backedUp,
        messageIds: result.messageIds,
        timestamp: monitor.lastCheckedAt.toISOString()
      });
    } else {
      emitToClients(monitor, {
        type: 'monitor:heartbeat',
        timestamp: monitor.lastCheckedAt.toISOString()
      });
    }
  } catch (error) {
    emitToClients(monitor, {
      type: 'monitor:error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    monitor.isPolling = false;
  }
};

const createMonitor = (userId) => {
  const monitor = {
    userId,
    clients: new Set(),
    timer: null,
    isPolling: false,
    lastCheckedAt: null
  };

  monitor.timer = setInterval(() => {
    pollMonitor(monitor);
  }, MONITOR_INTERVAL_MS);

  monitors.set(userId, monitor);
  pollMonitor(monitor);

  return monitor;
};

const stopMonitor = (userId) => {
  const monitor = monitors.get(userId);
  if (!monitor) {
    return;
  }

  if (monitor.timer) {
    clearInterval(monitor.timer);
  }

  monitors.delete(userId);
};

const registerClient = (userId, client) => {
  const normalizedUserId = String(userId);
  let monitor = monitors.get(normalizedUserId);

  if (!monitor) {
    monitor = createMonitor(normalizedUserId);
  }

  monitor.clients.add(client);

  client.send(JSON.stringify({
    type: 'monitor:connected',
    intervalMs: MONITOR_INTERVAL_MS,
    timestamp: new Date().toISOString()
  }));

  const removeClient = () => {
    const activeMonitor = monitors.get(normalizedUserId);
    if (!activeMonitor) {
      return;
    }

    activeMonitor.clients.delete(client);
    if (activeMonitor.clients.size === 0) {
      stopMonitor(normalizedUserId);
    }
  };

  client.on('close', removeClient);
  client.on('error', removeClient);
};

module.exports = {
  registerClient
};
