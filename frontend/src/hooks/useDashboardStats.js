import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import api from '../api/axiosConfig';

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

const getDateBoundaryRange = () => {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfDay);
  const weekDay = startOfWeek.getDay();
  const weekDiff = weekDay === 0 ? 6 : weekDay - 1;
  startOfWeek.setDate(startOfWeek.getDate() - weekDiff);

  const startOfMonth = new Date(startOfDay);
  startOfMonth.setDate(1);

  return {
    startOfDayMs: startOfDay.getTime(),
    startOfWeekMs: startOfWeek.getTime(),
    startOfMonthMs: startOfMonth.getTime()
  };
};

const computeDeletedStats = (emails) => {
  const { startOfDayMs, startOfWeekMs, startOfMonthMs } = getDateBoundaryRange();

  const deletedEmails = emails.filter((email) => email && email.deleted && !email.restored);

  return {
    deleted: deletedEmails.length,
    deletedToday: deletedEmails.filter((email) => {
      const time = new Date(email.date).getTime();
      return Number.isFinite(time) && time >= startOfDayMs;
    }).length,
    deletedThisWeek: deletedEmails.filter((email) => {
      const time = new Date(email.date).getTime();
      return Number.isFinite(time) && time >= startOfWeekMs;
    }).length,
    deletedThisMonth: deletedEmails.filter((email) => {
      const time = new Date(email.date).getTime();
      return Number.isFinite(time) && time >= startOfMonthMs;
    }).length
  };
};

export const useDashboardStats = () => {
  const { user } = useContext(AuthContext);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const hasLoadedOnceRef = useRef(false);
  const loadInFlightRef = useRef(null);

  const loadStats = useCallback(async ({ force = false } = {}) => {
    if (!user) {
      setStats(EMPTY_STATS);
      setLoading(false);
      setError('');
      return;
    }

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

        const deletedStats = computeDeletedStats(emails);
        const statsPayload = statsRes.data && statsRes.data.stats ? statsRes.data.stats : {};

        const nextStats = {
          total: Number(statsPayload.total) || 0,
          today: Number(statsPayload.today) || 0,
          thisWeek: Number(statsPayload.thisWeek) || 0,
          thisMonth: Number(statsPayload.thisMonth) || 0,
          ...deletedStats
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

  useEffect(() => {
    if (!user) {
      return;
    }

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

  return {
    user,
    stats,
    loading,
    error,
    refreshStats: () => loadStats({ force: true })
  };
};

export { EMPTY_STATS };
