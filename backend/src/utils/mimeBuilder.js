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
    'MIME-Version: 1.0'
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

module.exports = {
  sanitizeHeaderValue,
  normalizeBody,
  chunkBase64,
  toBase64Url,
  buildRawMimeEmail
};
