const { google } = require('googleapis');
const { simpleParser } = require('mailparser');

const createOAuthClient = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
};

exports.getGmailClient = (accessToken) => {
  const auth = createOAuthClient();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth });
};

exports.getGmailClientForUser = async (user) => {
  const auth = createOAuthClient();

  if (user.refreshToken) {
    auth.setCredentials({ refresh_token: user.refreshToken });
    const refreshed = await auth.getAccessToken();
    const refreshedToken = typeof refreshed === 'string' ? refreshed : refreshed && refreshed.token;

    if (refreshedToken) {
      user.accessToken = refreshedToken;
      if (typeof user.save === 'function') {
        await user.save();
      }
      auth.setCredentials({
        access_token: refreshedToken,
        refresh_token: user.refreshToken
      });
      return google.gmail({ version: 'v1', auth });
    }
  }

  if (user.accessToken) {
    auth.setCredentials({ access_token: user.accessToken });
    return google.gmail({ version: 'v1', auth });
  }

  throw new Error('No Google access or refresh token available for this user.');
};

exports.processEmail = async (gmail, msgId) => {
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: msgId,
    format: 'raw'
  });

  const decodedRaw = Buffer.from(res.data.raw, 'base64');
  const parsed = await simpleParser(decodedRaw);

  return {
    messageId: msgId,
    threadId: res.data.threadId,
    subject: parsed.subject,
    from: parsed.from.text,
    to: parsed.to && parsed.to.text ? parsed.to.text : '',
    date: parsed.date,
    body: parsed.html || parsed.text,
    attachments: parsed.attachments.map(a => ({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size
    })),
    attachmentBlobs: parsed.attachments.map(a => ({
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      content: a.content
    }))
  };
};