import React, { useEffect, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const AuthCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setAuthToken } = useContext(AuthContext);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');

    if (token) {
      setAuthToken(token);
      navigate('/dashboard');
    } else {
      navigate('/login');
    }
  }, [location, navigate, setAuthToken]);

  return <div>Loading...</div>;
};

export default AuthCallback;
