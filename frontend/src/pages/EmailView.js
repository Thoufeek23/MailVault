import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axiosConfig';
import { Paperclip } from 'lucide-react';
import toast from 'react-hot-toast';

const EmailView = () => {
  const { id } = useParams();
  const [email, setEmail] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    const fetchEmail = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/api/backup/emails?id=${id}&includeGmailStatus=true`);
        if (response.data.success && response.data.emails.length > 0) {
          setEmail(response.data.emails[0]);

          const attachmentResponse = await api.get(`/api/backup/emails/${id}/attachments`);
          if (attachmentResponse.data && attachmentResponse.data.success) {
            setAttachments(attachmentResponse.data.attachments || []);
          }
        }
      } catch (error) {
        console.error('Error fetching email:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEmail();
  }, [id]);

  if (loading) {
    return <div className="loader">Loading email...</div>;
  }

  if (!email) {
    return <div>Email not found.</div>;
  }

  const handleRestore = async () => {
    const shouldRestore = window.confirm('Restore this email back to Gmail?');
    if (!shouldRestore) {
      return;
    }

    setRestoring(true);
    try {
      const response = await api.post('/api/backup/restore', { emailIds: [id] });
      const restored = Number(response.data && response.data.restored) || 0;

      if (restored > 0) {
        toast.success('Email restored to Gmail.');
        setEmail((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            deleted: false,
            restored: true
          };
        });
      } else {
        const failed = Array.isArray(response.data && response.data.failed) ? response.data.failed : [];
        const firstError = failed[0] && failed[0].error ? failed[0].error : 'Email could not be restored.';
        toast.error(firstError);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to restore this email.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="email-view">
      <div className="email-view-header">
        <div className="email-view-topbar">
          <Link to="/inbox" className="back-button">&larr; Back to Inbox</Link>
          {email.deleted && (
            <button
              type="button"
              className="restore-btn"
              onClick={handleRestore}
              disabled={restoring}
            >
              {restoring ? 'Restoring...' : 'Restore to Gmail'}
            </button>
          )}
        </div>
        <h2>{email.subject}</h2>
        <div className="email-meta">
          <strong>From:</strong> {email.from}
          <br />
          <strong>Date:</strong> {new Date(email.date).toLocaleString()}
        </div>
      </div>
      <div className="email-body">
        {email.fullContent && email.fullContent.body ? (
          <div dangerouslySetInnerHTML={{ __html: email.fullContent.body }} />
        ) : (
          <p>This email has no content to display.</p>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="email-attachments">
          <h3>
            <Paperclip size={16} />
            Attachments ({attachments.length})
          </h3>
          <ul>
            {attachments.map((attachment, index) => (
              <li key={`${attachment.supabasePath || attachment.filename || 'attachment'}-${index}`}>
                <div className="attachment-meta">
                  <strong>{attachment.filename || 'attachment'}</strong>
                  <span>
                    {attachment.contentType || 'application/octet-stream'}
                    {attachment.size ? ` • ${Math.round(attachment.size / 1024)} KB` : ''}
                  </span>
                </div>
                {attachment.url ? (
                  <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                    Open
                  </a>
                ) : (
                  <span className="attachment-missing">Not available</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default EmailView;