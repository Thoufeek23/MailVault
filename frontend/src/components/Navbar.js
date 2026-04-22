import React, { useContext } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Inbox, LayoutDashboard, Download } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import toast from 'react-hot-toast';
import api from '../api/axiosConfig';

const Navbar = () => {
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();

  const handleImport = () => {
    toast.loading('Importing emails... This may take a few minutes.', { id: 'import' });
    api.post('/api/backup/import')
      .then(response => {
        window.dispatchEvent(new Event('emails:updated'));
        const imported = response?.data?.imported || 0;
        toast.success(`Emails imported successfully! (${imported})`, { id: 'import' });
      })
      .catch(error => {
        toast.error('Error importing emails.', { id: 'import' });
      });
  };

  const confirmImport = () => {
    toast((t) => (
      <span className="import-confirm-toast">
        Are you sure you want to import all your emails?
        <br />
        <small>Note: This may take a few minutes.</small>
        <button
          className="import-confirm-btn"
          onClick={() => {
          handleImport();
          toast.dismiss(t.id);
          }}
        >
          Confirm
        </button>
      </span>
    ));
  };

  return (
    <nav className="navbar">
      <div className="nav-brand">
        Backup Engine
        <Download size={20} onClick={confirmImport} style={{ cursor: 'pointer', marginLeft: '10px' }} />
      </div>
      <div className="nav-tabs">
        <Link
          to="/dashboard"
          className={`nav-tab ${location.pathname === '/dashboard' ? 'active' : ''}`}
        >
          <LayoutDashboard size={18} />
          Dashboard
        </Link>
        <Link
          to="/inbox"
          className={`nav-tab ${location.pathname === '/inbox' ? 'active' : ''}`}
        >
          <Inbox size={18} />
          Inbox
        </Link>
      </div>
      <div className="nav-user">
        <span className="user-info">{user?.displayName}</span>
        <button onClick={logout} className="logout-btn" title="Logout">
          <LogOut size={20} />
        </button>
      </div>
    </nav>
  );
};

export default Navbar;