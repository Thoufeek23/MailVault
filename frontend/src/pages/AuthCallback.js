import React, { useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { fetchUser } = useContext(AuthContext);

  useEffect(() => {
    const completeAuth = async () => {
      const res = await fetchUser({ silent: true });
      if (res && res.data && res.data.data && res.data.data.user) {
        navigate('/dashboard', { replace: true });
        return;
      }

      navigate('/login');
    };

    completeAuth();
  }, [fetchUser, navigate]);

  return <div>Loading...</div>;
};

export default AuthCallback;
