import React, { createContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axiosConfig';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async (options = {}) => {
    const { silent = false } = options;

    if (!silent) {
      setLoading(true);
    }

    try {
      const res = await api.get('/auth/current_user');
      if (res.data && res.data.data.user) {
        setUser(res.data.data.user);
      } else {
        setUser(null);
      }
      return res;
    } catch (err) {
      setUser(null);
      return null;
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  const login = () => {
    window.location.href = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/auth/google`;
  };

  const logout = useCallback(async () => {
    try {
      await api.get('/auth/logout');
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const value = { user, loading, login, logout, fetchUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
