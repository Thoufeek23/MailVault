const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL && process.env.SUPABASE_URL.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
const legacyKey = process.env.SUPABASE_KEY && process.env.SUPABASE_KEY.trim();

const selectedKey = serviceRoleKey || legacyKey;

if (!supabaseUrl || !selectedKey) {
  throw new Error('Missing Supabase configuration. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.');
}

const supabase = createClient(supabaseUrl, selectedKey);

const sanitizeFileName = (value) => {
  return String(value || 'attachment')
    .replace(/[\\/]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
};

exports.uploadToSupabase = async (userId, msgId, jsonData) => {
  if (selectedKey.startsWith('sb_publishable_')) {
    throw new Error('Supabase is configured with a publishable key. Add SUPABASE_SERVICE_ROLE_KEY to backend/.env and use the service role key for server-side storage uploads.');
  }

  const attachmentBlobs = Array.isArray(jsonData.attachmentBlobs) ? jsonData.attachmentBlobs : [];
  const uploadedAttachments = [];

  for (let i = 0; i < attachmentBlobs.length; i += 1) {
    const attachment = attachmentBlobs[i];
    const safeName = sanitizeFileName(attachment.filename || `attachment-${i + 1}`);
    const attachmentPath = `${userId}/${msgId}/attachments/${i + 1}-${safeName}`;
    const buffer = Buffer.isBuffer(attachment.content)
      ? attachment.content
      : Buffer.from(attachment.content || '', 'base64');

    const { error: attachmentError } = await supabase.storage
      .from('email-backups')
      .upload(attachmentPath, buffer, {
        contentType: attachment.contentType || 'application/octet-stream',
        upsert: true
      });

    if (attachmentError) {
      throw attachmentError;
    }

    uploadedAttachments.push({
      filename: attachment.filename || safeName,
      contentType: attachment.contentType || 'application/octet-stream',
      size: attachment.size || buffer.length,
      supabasePath: attachmentPath
    });
  }

  const payload = {
    ...jsonData,
    attachments: uploadedAttachments
  };
  delete payload.attachmentBlobs;

  const fileName = `${userId}/${msgId}.json`;
  const { data, error } = await supabase.storage
    .from('email-backups')
    .upload(fileName, JSON.stringify(payload), {
      contentType: 'application/json',
      upsert: true
    });
    
  if (error) throw error;
  return {
    emailJsonPath: fileName,
    attachments: uploadedAttachments
  };
};

exports.getSignedAttachmentUrl = async (path, expiresInSeconds = 3600) => {
  const { data, error } = await supabase.storage
    .from('email-backups')
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    throw error;
  }

  return data && data.signedUrl ? data.signedUrl : null;
};

exports.getEmailBackupJson = async (path) => {
  const { data, error } = await supabase.storage
    .from('email-backups')
    .download(path);

  if (error) {
    throw error;
  }

  const content = await data.text();
  return JSON.parse(content);
};

exports.getFileBuffer = async (path) => {
  const { data, error } = await supabase.storage
    .from('email-backups')
    .download(path);

  if (error) {
    throw error;
  }

  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data && typeof data.arrayBuffer === 'function') {
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  throw new Error(`Unsupported file payload for path: ${path}`);
};

exports.supabase = supabase;