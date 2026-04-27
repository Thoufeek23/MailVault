const gmailService = require('./gmailService');
const storageService = require('./storageService');
const EmailMeta = require('../models/EmailMeta');
const nlpService = require('./nlpService');

const needsAttachmentRepair = (emailMeta) => {
  return emailMeta
    && Array.isArray(emailMeta.fullContent && emailMeta.fullContent.attachments)
    && emailMeta.fullContent.attachments.length > 0
    && (!Array.isArray(emailMeta.attachmentPaths) || emailMeta.attachmentPaths.length === 0);
};

const buildFullContent = (fullEmail, attachments) => {
  const fullContent = {
    ...fullEmail,
    attachments
  };

  delete fullContent.attachmentBlobs;
  return fullContent;
};

const processAndStoreSingleEmail = async ({ gmail, userId, messageId }) => {
  let existingEmail = await EmailMeta.findOne({ userId, messageId });

  if (!existingEmail) {
    existingEmail = await EmailMeta.findOne({ userId, restoredMessageId: messageId });
  }

  const shouldRepairAttachments = needsAttachmentRepair(existingEmail);
  if (existingEmail && !shouldRepairAttachments) {
    return {
      processed: false,
      skipped: true,
      created: false,
      messageId
    };
  }

  const fullEmail = await gmailService.processEmail(gmail, messageId);
  const storageResult = await storageService.uploadToSupabase(userId.toString(), messageId, fullEmail);
  const fullContent = buildFullContent(fullEmail, storageResult.attachments);

  if (existingEmail) {
    await EmailMeta.updateOne(
      { _id: existingEmail._id },
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

    return {
      processed: true,
      skipped: false,
      created: false,
      messageId
    };
  }

  try {
    await EmailMeta.create({
      userId,
      messageId,
      threadId: fullEmail.threadId,
      subject: fullEmail.subject,
      from: fullEmail.from,
      to: fullEmail.to,
      date: fullEmail.date,
      supabasePath: storageResult.emailJsonPath,
      attachmentPaths: storageResult.attachments,
      fullContent
    });

    await nlpService.createAndStoreEmbedding(
      userId.toString(),
      messageId,
      fullEmail.body,
      storageService.supabase
    );

    return {
      processed: true,
      skipped: false,
      created: true,
      messageId
    };
  } catch (error) {
    if (error && error.code === 11000) {
      return {
        processed: false,
        skipped: true,
        created: false,
        messageId
      };
    }

    throw error;
  }
};

module.exports = {
  processAndStoreSingleEmail
};
