import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, CalendarDays, CalendarRange, CalendarCheck2, Trash2 } from 'lucide-react';
import AskGemini from '../components/AskGemini';
import { useDashboardStats } from '../hooks/useDashboardStats';

const Dashboard = () => {
  const { user, stats, loading, error } = useDashboardStats();
  const navigate = useNavigate();

  const openFilteredInbox = (view) => {
    navigate(`/inbox?view=${encodeURIComponent(view)}`);
  };

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