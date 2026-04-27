import { useState, useEffect } from 'react';
import api from '../api/axiosConfig';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const res = await api.get('/auth/current_user');
      setUser(res.data && res.data.data ? res.data.data.user : null);
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return { user, loading, checkAuth, logout };
};