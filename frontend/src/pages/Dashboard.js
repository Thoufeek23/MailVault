import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, CalendarDays, CalendarRange, CalendarCheck2, Trash2 } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import api from '../api/axiosConfig';
import AskGemini from '../components/AskGemini';

const DASHBOARD_STATS_CACHE_TTL_MS = 60 * 1000;

const EMPTY_STATS = {
  total: 0,
  today: 0,
  thisWeek: 0,
  thisMonth: 0,
  deleted: 0,
  deletedToday: 0,
  deletedThisWeek: 0,
  deletedThisMonth: 0
};

const buildDashboardStatsCacheKey = (user) => {
  const userKey = user?.googleId || user?.email || 'anon';
  return `dashboardStats:v1:${userKey}`;
};

const safeReadDashboardStatsCache = (cacheKey) => {
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.ts !== 'number' || !Number.isFinite(parsed.ts)) return null;
    if (!parsed.data || typeof parsed.data !== 'object') return null;
    return parsed;
  } catch (error) {
    return null;
  }
};

const safeWriteDashboardStatsCache = (cacheKey, payload) => {
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (error) {
    // Ignore storage write failures (e.g. quota exceeded, disabled storage).
  }
};

const Dashboard = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const hasLoadedOnceRef = useRef(false);
  const loadInFlightRef = useRef(null);

  const loadStats = useCallback(async ({ force = false } = {}) => {
    if (!user) return;

    const cacheKey = buildDashboardStatsCacheKey(user);
    const nowMs = Date.now();

    if (!force) {
      const cached = safeReadDashboardStatsCache(cacheKey);
      if (cached?.data) {
        setStats(cached.data);
        hasLoadedOnceRef.current = true;
        setLoading(false);
        setError('');

        const ageMs = nowMs - cached.ts;
        if (ageMs >= 0 && ageMs < DASHBOARD_STATS_CACHE_TTL_MS) {
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
        const [statsRes, emailsRes] = await Promise.all([
          api.get('/api/backup/stats'),
          api.get('/api/backup/emails?includeGmailStatus=true')
        ]);

        const emails = Array.isArray(emailsRes.data && emailsRes.data.emails)
          ? emailsRes.data.emails
          : [];

        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);

        const startOfWeek = new Date(startOfDay);
        const weekDay = startOfWeek.getDay();
        const weekDiff = weekDay === 0 ? 6 : weekDay - 1;
        startOfWeek.setDate(startOfWeek.getDate() - weekDiff);

        const startOfMonth = new Date(startOfDay);
        startOfMonth.setDate(1);

        const deletedEmails = emails.filter((email) => email && email.deleted && !email.restored);
        const deletedCount = deletedEmails.length;
        const deletedToday = deletedEmails.filter((email) => {
          const time = new Date(email.date).getTime();
          return Number.isFinite(time) && time >= startOfDay.getTime();
        }).length;
        const deletedThisWeek = deletedEmails.filter((email) => {
          const time = new Date(email.date).getTime();
          return Number.isFinite(time) && time >= startOfWeek.getTime();
        }).length;
        const deletedThisMonth = deletedEmails.filter((email) => {
          const time = new Date(email.date).getTime();
          return Number.isFinite(time) && time >= startOfMonth.getTime();
        }).length;

        const statsPayload = statsRes.data && statsRes.data.stats ? statsRes.data.stats : {};

        const nextStats = {
          total: Number(statsPayload.total) || 0,
          today: Number(statsPayload.today) || 0,
          thisWeek: Number(statsPayload.thisWeek) || 0,
          thisMonth: Number(statsPayload.thisMonth) || 0,
          deleted: deletedCount,
          deletedToday,
          deletedThisWeek,
          deletedThisMonth
        };

        setStats(nextStats);
        hasLoadedOnceRef.current = true;

        safeWriteDashboardStatsCache(cacheKey, { ts: Date.now(), data: nextStats });
      } catch (err) {
        if (!hasLoadedOnceRef.current) {
          setError('Failed to load dashboard stats.');
          setStats(EMPTY_STATS);
        }
      } finally {
        loadInFlightRef.current = null;
        setLoading(false);
      }
    })();

    return loadInFlightRef.current;
  }, [user]);

  const openFilteredInbox = (view) => {
    navigate(`/inbox?view=${encodeURIComponent(view)}`);
  };

  useEffect(() => {
    if (!user) return;

    loadStats({ force: false });

    const handleEmailsUpdated = () => {
      loadStats({ force: true });
    };

    const handleFocus = () => {
      loadStats({ force: false });
    };

    window.addEventListener('emails:updated', handleEmailsUpdated);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('emails:updated', handleEmailsUpdated);
      window.removeEventListener('focus', handleFocus);
    };
  }, [user, loadStats]);

  return (
    <div className="dashboard-content">
      <header className="dashboard-header">
        <h1>Welcome, {user?.displayName?.split(' ')[0] || 'User'}!</h1>
      </header>

      <div className="stats-grid">
        <button type="button" className="stat-card stat-card-clickable" onClick={() => openFilteredInbox('all')}>
          <Mail size={32} color="#4a90e2" />
          <h3>Backed Up Emails</h3>
          <p>{loading ? '...' : stats.total.toLocaleString()}</p>
        </button>

        <button type="button" className="stat-card stat-card-clickable" onClick={() => openFilteredInbox('today')}>
          <CalendarDays size={32} color="#2f80ed" />
          <h3>Emails - Today</h3>
          <p>{loading ? '...' : stats.today.toLocaleString()}</p>
        </button>

        <button type="button" className="stat-card stat-card-clickable" onClick={() => openFilteredInbox('week')}>
          <CalendarRange size={32} color="#2d9cdb" />
          <h3>Emails - This Week</h3>
          <p>{loading ? '...' : stats.thisWeek.toLocaleString()}</p>
        </button>

        <button type="button" className="stat-card stat-card-clickable" onClick={() => openFilteredInbox('month')}>
          <CalendarCheck2 size={32} color="#56ccf2" />
          <h3>Emails - This Month</h3>
          <p>{loading ? '...' : stats.thisMonth.toLocaleString()}</p>
        </button>

        <button type="button" className="stat-card stat-card-clickable" onClick={() => openFilteredInbox('deleted')}>
          <Trash2 size={32} color="#d14343" />
          <h3>Deleted Emails</h3>
          <p>{loading ? '...' : stats.deleted.toLocaleString()}</p>
        </button>

        <button type="button" className="stat-card stat-card-clickable" onClick={() => openFilteredInbox('deletedToday')}>
          <Trash2 size={32} color="#c23b3b" />
          <h3>Deleted - Today</h3>
          <p>{loading ? '...' : stats.deletedToday.toLocaleString()}</p>
        </button>

        <button type="button" className="stat-card stat-card-clickable" onClick={() => openFilteredInbox('deletedWeek')}>
          <Trash2 size={32} color="#b33232" />
          <h3>Deleted - This Week</h3>
          <p>{loading ? '...' : stats.deletedThisWeek.toLocaleString()}</p>
        </button>

        <button type="button" className="stat-card stat-card-clickable" onClick={() => openFilteredInbox('deletedMonth')}>
          <Trash2 size={32} color="#a02929" />
          <h3>Deleted - This Month</h3>
          <p>{loading ? '...' : stats.deletedThisMonth.toLocaleString()}</p>
        </button>

      </div>

      {error && <div className="error-msg">{error}</div>}

      <div className="dashboard-actions">
        <Link to="/inbox" className="action-btn primary">
          View Backed Up Emails
        </Link>
      </div>
      <AskGemini />
    </div>
  );
};

export default Dashboard;