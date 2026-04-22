const mongoose = require('mongoose');

const EmailMetaSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  messageId: { type: String, required: true },
  threadId: String,
  subject: String,
  from: String,
  to: String,
  date: Date,
  restoredAt: Date,
  restoredMessageId: String,
  deleted: Boolean,
  restored: Boolean,
  activeMessageId: String,
  statusCheckedAt: Date,
  supabasePath: String,
  attachmentPaths: [
    {
      filename: String,
      contentType: String,
      size: Number,
      supabasePath: String
    }
  ],
  fullContent: mongoose.Schema.Types.Mixed // For storing the full email JSON
});

EmailMetaSchema.index({ userId: 1, messageId: 1 }, { unique: true });

module.exports = mongoose.model('EmailMeta', EmailMetaSchema);