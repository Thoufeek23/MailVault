import React, { useState } from 'react';
import api from '../api/axiosConfig';
import { RefreshCw, Play } from 'lucide-react';

const BackupButton = ({ onComplete }) => {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await api.post('/api/backup/start');
      if (onComplete) onComplete(res.data.backedUp);
    } catch (err) {
      alert("Sync failed. Check console.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <button 
      onClick={handleSync} 
      disabled={isSyncing} 
      className={`backup-trigger ${isSyncing ? 'syncing' : ''}`}
    >
      {isSyncing ? <RefreshCw className="spin" /> : <Play size={18} />}
      {isSyncing ? 'Backing Up...' : 'Start New Backup'}
    </button>
  );
};

export default BackupButton;