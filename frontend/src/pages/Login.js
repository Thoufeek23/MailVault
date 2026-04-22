import React, { useContext } from 'react';
import { Shield, Mail } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';

const Login = () => {
  const { login } = useContext(AuthContext);

  return (
    <div className="login-card">
      <Shield size={48} color="#4a90e2" />
      <h1>Backup Engine</h1>
      <p>Securely back up your Gmail messages.</p>
      <button onClick={login} className="google-btn">
        <Mail size={20} />
        Sign in with Google
      </button>
    </div>
  );
};

export default Login;