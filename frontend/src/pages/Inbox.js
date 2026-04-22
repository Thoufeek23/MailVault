import React, { useCallback, useEffect, useMemo, useRef, useState, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import { Inbox as InboxIcon, Paperclip, RefreshCcw, Search, Filter } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';

const INBOX_CACHE_TTL_MS = 30 * 1000;

const buildInboxCacheKey = (user) => {
  const userKey = user?.googleId || user?.email || 'anon';
  return `inboxEmails:v1:${userKey}`;
};

const safeReadInboxCache = (cacheKey) => {
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.ts !== 'number' || !Number.isFinite(parsed.ts)) return null;
    if (!Array.isArray(parsed.emails)) return null;
    return parsed;
  } catch (error) {
    return null;
  }
};

const safeWriteInboxCache = (cacheKey, payload) => {
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (error) {
    // Ignore storage write failures.
  }
};

const getStartOfDay = (dateValue) => {
  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getStartOfWeek = (dateValue) => {
  const date = getStartOfDay(dateValue);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date;
};

const getStartOfMonth = (dateValue) => {
  const date = getStartOfDay(dateValue);
  date.setDate(1);
  return date;
};

const parseDateInput = (value, endOfDay = false) => {
  if (!value) {
    return null;
  }

  const isoMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const altMatch = String(value).match(/^(\d{2})-(\d{2})-(\d{4})$/);

  let year;
  let month;
  let day;

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (altMatch) {
    day = Number(altMatch[1]);
    month = Number(altMatch[2]);
    year = Number(altMatch[3]);
  } else {
    const fallback = new Date(value);
    if (Number.isNaN(fallback.getTime())) {
      return null;
    }
    return fallback.getTime();
  }

  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);

  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const parseEmailDate = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
};

const Inbox = () => {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showDateFilters, setShowDateFilters] = useState(false);

  const hasLoadedOnceRef = useRef(false);
  const loadInFlightRef = useRef(null);

  const formatSender = (sender) => {
    if (!sender) return '';
    const withoutAnglePart = sender.replace(/\s*<[^>]*>/g, '').trim();
    const withoutQuotes = withoutAnglePart.replace(/^"|"$/g, '').trim();
    return withoutQuotes || sender;
  };

  const loadEmails = useCallback(async ({ force = false } = {}) => {
    if (!user) return;

    const cacheKey = buildInboxCacheKey(user);
    const nowMs = Date.now();

    if (!force) {
      const cached = safeReadInboxCache(cacheKey);
      if (cached) {
        setEmails(cached.emails);
        hasLoadedOnceRef.current = true;
        setLoading(false);
        setError('');

        const ageMs = nowMs - cached.ts;
        if (ageMs >= 0 && ageMs < INBOX_CACHE_TTL_MS) {
          return;
        }
      }
    }

    if (loadInFlightRef.current) {
      return loadInFlightRef.current;
    }

    const background = hasLoadedOnceRef.current;
    if (!background) {
      setLoading(true);
    }
    setError('');

    loadInFlightRef.current = (async () => {
      try {
        const res = await api.get('/api/backup/emails?includeGmailStatus=true');
        const nextEmails = Array.isArray(res.data && res.data.emails) ? res.data.emails : [];
        setEmails(nextEmails);
        hasLoadedOnceRef.current = true;
        safeWriteInboxCache(cacheKey, { ts: Date.now(), emails: nextEmails });
      } catch (err) {
        if (!hasLoadedOnceRef.current) {
          setError('Failed to load emails.');
        }
      } finally {
        loadInFlightRef.current = null;
        setLoading(false);
      }
    })();

    return loadInFlightRef.current;
  }, [user]);

  useEffect(() => {
    if (user) {
      loadEmails({ force: false });
    }
  }, [user, loadEmails]);

  const queryParams = new URLSearchParams(location.search);
  const presetView = queryParams.get('view') || 'all';

  useEffect(() => {
    if (!user) {
      return;
    }

    const handleEmailsUpdated = () => {
      loadEmails({ force: true });
    };

    window.addEventListener('emails:updated', handleEmailsUpdated);
    return () => {
      window.removeEventListener('emails:updated', handleEmailsUpdated);
    };
  }, [user, loadEmails]);

  const filteredEmails = useMemo(() => {
    const search = query.trim().toLowerCase();
    const fromTime = parseDateInput(fromDate, false);
    const toTime = parseDateInput(toDate, true);

    const now = new Date();
    const startOfToday = getStartOfDay(now).getTime();
    const startOfThisWeek = getStartOfWeek(now).getTime();
    const startOfThisMonth = getStartOfMonth(now).getTime();

    return emails.filter((email) => {
      const subject = (email.subject || '').toLowerCase();
      const sender = (email.from || '').toLowerCase();
      const matchesText = !search || subject.includes(search) || sender.includes(search);

      const emailTime = parseEmailDate(email.date);
      const matchesFrom = fromTime === null || (emailTime !== null && emailTime >= fromTime);
      const matchesTo = toTime === null || (emailTime !== null && emailTime <= toTime);

      let matchesPreset = true;

      if (presetView === 'today') {
        matchesPreset = emailTime !== null && emailTime >= startOfToday;
      } else if (presetView === 'week') {
        matchesPreset = emailTime !== null && emailTime >= startOfThisWeek;
      } else if (presetView === 'month') {
        matchesPreset = emailTime !== null && emailTime >= startOfThisMonth;
      } else if (presetView === 'deleted') {
        matchesPreset = Boolean(email.deleted && !email.restored);
      } else if (presetView === 'deletedToday') {
        matchesPreset = Boolean(email.deleted && !email.restored)
          && emailTime !== null
          && emailTime >= startOfToday;
      } else if (presetView === 'deletedWeek') {
        matchesPreset = Boolean(email.deleted && !email.restored)
          && emailTime !== null
          && emailTime >= startOfThisWeek;
      } else if (presetView === 'deletedMonth') {
        matchesPreset = Boolean(email.deleted && !email.restored)
          && emailTime !== null
          && emailTime >= startOfThisMonth;
      }

      return matchesText && matchesFrom && matchesTo && matchesPreset;
    });
  }, [emails, query, fromDate, toDate, presetView]);

  const clearDateFilter = () => {
    setFromDate('');
    setToDate('');
  };

  const getAttachments = (email) => {
    if (Array.isArray(email.attachmentPaths) && email.attachmentPaths.length > 0) {
      return email.attachmentPaths;
    }

    if (Array.isArray(email.fullContent && email.fullContent.attachments)) {
      return email.fullContent.attachments;
    }

    return [];
  };

  return (
    <div className="inbox-content">
      <div className="inbox-toolbar">
        <div className="search-box">
          <Search size={20} color="#888" />
          <input
            type="text"
            placeholder="Search by sender or subject..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className={`search-filter-icon ${showDateFilters ? 'active' : ''}`}
            onClick={() => setShowDateFilters((value) => !value)}
            aria-label="Toggle date filters"
            title="Date filter"
          >
            <Filter size={16} />
          </button>
        </div>
        <div className="inbox-actions">
          <button onClick={() => loadEmails({ force: true })} disabled={loading}>
            <RefreshCcw size={16} className={loading ? 'spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {showDateFilters && (
        <div className="date-filter-group">
          <label className="date-filter-field" htmlFor="from-date">
            <span>From</span>
            <input
              id="from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              max={toDate || undefined}
            />
          </label>
          <label className="date-filter-field" htmlFor="to-date">
            <span>To</span>
            <input
              id="to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              min={fromDate || undefined}
            />
          </label>
          {(fromDate || toDate) && (
            <button
              type="button"
              className="clear-date-filter-btn"
              onClick={clearDateFilter}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}

      {!loading && filteredEmails.length === 0 ? (
        <div className="inbox-state">
          <InboxIcon size={48} color="#ccc" />
          <h2>No Emails Found</h2>
          <p>{query ? 'Try adjusting your search.' : 'Your inbox is empty. Run a backup to see your emails here.'}</p>
        </div>
      ) : (
        <div className="email-list">
          <table>
            <tbody>
              {filteredEmails.map((email) => (
                <tr
                  key={email._id}
                  className="email-row-clickable"
                  onClick={() => navigate(`/email/${email._id}`)}
                >
                  <td>{formatSender(email.from)}</td>
                  <td>
                    <div className="email-subject-wrap">
                      <div>{email.subject}</div>
                      {getAttachments(email).length > 0 && (
                        <div className="attachment-inline">
                          <Paperclip size={14} />
                          <span>{getAttachments(email).length} attachment(s)</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="email-date-cell">
                      {email.restored && (
                        <span className="email-status-restored">Restored</span>
                      )}
                      {email.deleted && !email.restored && (
                        <span className="email-status-deleted">Deleted</span>
                      )}
                      <span>{new Date(email.date).toLocaleDateString()}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Inbox;