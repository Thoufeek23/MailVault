import React, { useContext, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthContext } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inbox from './pages/Inbox';
import EmailView from './pages/EmailView';
import AuthCallback from './pages/AuthCallback';
import Navbar from './components/Navbar';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';

function App() {
  const { user, loading } = useContext(AuthContext);
  const location = useLocation();
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);

  const appWrapperClass = !user ? 'app-wrapper' : 'app-wrapper shell';

  useEffect(() => {
    let isActive = true;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (!isActive || reconnectTimerRef.current) {
        return;
      }

      reconnectAttemptsRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connectMonitor();
      }, 5000);
    };

    const connectMonitor = () => {
      if (!isActive) {
        return;
      }

      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const wsBase = apiBase.replace(/^http/i, 'ws');
      const socket = new WebSocket(`${wsBase}/ws/inbox-monitor`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (reconnectAttemptsRef.current > 0) {
          toast.success('Inbox monitor reconnected.');
        }
        reconnectAttemptsRef.current = 0;
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'backup:copied' && payload.backedUp > 0) {
            toast.success(`Copied ${payload.backedUp} new email(s)`);
            window.dispatchEvent(new Event('emails:updated'));
          }

          if (payload.type === 'monitor:error') {
            toast.error(`Inbox monitor error: ${payload.message}`);
          }
        } catch (error) {
          console.error('Invalid monitor message:', error);
        }
      };

      socket.onerror = () => {
        // Allow onclose to handle retry logic.
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      };

      socket.onclose = () => {
        if (!isActive) {
          return;
        }

        if (socketRef.current === socket) {
          socketRef.current = null;
        }

        scheduleReconnect();
      };
    };

    if (!user) {
      isActive = false;
      reconnectAttemptsRef.current = 0;
      clearReconnectTimer();

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      return;
    }

    connectMonitor();

    return () => {
      isActive = false;
      reconnectAttemptsRef.current = 0;
      clearReconnectTimer();

      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [user]);

  if (loading && location.pathname !== '/login') {
    return <div className="app-wrapper"><div className="loader">Loading...</div></div>;
  }

  return (
    <div className={appWrapperClass}>
      {user && <Navbar />}
      <Toaster />
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {user ? (
          <>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/email/:id" element={<EmailView />} />
            <Route path="*" element={<Navigate to="/dashboard" />} />
          </>
        ) : (
          <Route path="*" element={<Navigate to="/login" />} />
        )}
      </Routes>
    </div>
  );
}

export default App;