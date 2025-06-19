import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApiContext } from '../context/Apicontext';
import '../css/Profile.css';

interface NotificationPreferences {
  [key: string]: boolean;
}

const Profile: React.FC = () => {
  const { user, logout, token } = useAuth();
  const { apiUrl } = useApiContext();
  const [preferences, setPreferences] = useState<NotificationPreferences>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoLaunch, setAutoLaunch] = useState(false);

  // Load auto-launch state
  useEffect(() => {
    const loadAutoLaunch = async () => {
      try {
        const isEnabled = await window.Electron?.ipcRenderer.invoke('get-auto-launch');
        setAutoLaunch(isEnabled);
      } catch (err) {
        console.error('Failed to load auto-launch state:', err);
      }
    };
    loadAutoLaunch();
  }, []);

  // Handle auto-launch toggle
  const handleAutoLaunchToggle = async () => {
    try {
      const success = await window.Electron?.ipcRenderer.invoke('set-auto-launch', !autoLaunch);
      if (success) {
        setAutoLaunch(!autoLaunch);
      } else {
        console.error('Failed to update auto-launch setting');
      }
    } catch (err) {
      console.error('Failed to update auto-launch:', err);
    }
  };

  const fetchPreferences = async () => {
  
  if (!token) {
    console.warn('[fetchPreferences] No auth token found');
    setError('Not authenticated');
    setIsLoading(false);
    return;
  }

  const deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    console.warn('[fetchPreferences] No device ID found in localStorage');
    setError('Device ID not found');
    setIsLoading(false);
    return;
  }

  const endpoint = `${apiUrl}/api/notification-preferences`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Device-Token': deviceId
      },
    });


    const contentType = response.headers.get('Content-Type');

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[fetchPreferences] Non-OK response:', errorText);
      throw new Error(`Failed to fetch preferences: ${response.status}`);
    }

    if (!contentType || !contentType.includes('application/json')) {
      const raw = await response.text();
      console.error('[fetchPreferences] Unexpected response type. Raw response:', raw);
      throw new Error('Response is not JSON');
    }

    const data = await response.json();

    const newPreferences = Object.entries(data).reduce((acc, [key, value]) => ({
      ...acc,
      [key]: Boolean(value)
    }), {});

    setPreferences(newPreferences);
  } catch (err) {
    console.error('Error occurred:', err);
    setError('Failed to load notification preferences');
    setPreferences({});
  } finally {
    setIsLoading(false);
  }
};


  useEffect(() => {
    fetchPreferences();

    // Add event listener for preferences updates
    const handlePreferencesUpdate = () => {
      // console.log('WebSocket: Preferences update received');
      fetchPreferences();
    };

    window.Electron?.ipcRenderer.on('preferences-updated', handlePreferencesUpdate);

    // Cleanup listener on unmount
    return () => {
      window.Electron?.ipcRenderer.removeListener('preferences-updated', handlePreferencesUpdate);
    };
  }, [apiUrl, token]);

  const handleToggle = async (key: string) => {
    if (!token) {
      setError('Not authenticated');
      return;
    }

    const deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
      setError('Device ID not found');
      return;
    }

    try {
      // Use the IPC channel to toggle the preference
      await window.Electron?.ipcRenderer.invoke('toggle-notification-preference', key);
      
      // Update local state optimistically
      setPreferences(prev => ({
        ...prev,
        [key]: !prev[key]
      }));
    } catch (err) {
      console.error('WebSocket: Failed to update notification preferences:', err);
      setError('Failed to update notification preferences');
      // Revert the optimistic update
      fetchPreferences();
    }
  };

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1 className="profile-name">{user?.name || 'User'}</h1>
        <p className="profile-email">{user?.email}</p>
      </div>

      <div className="profile-sections">
        <div className="notification-preferences">
          <h2>Notification Preferences</h2>
          {error && <div className="error-message">{error}</div>}
          <div className="preferences-list">
            {Object.entries(preferences).map(([key, value]) => (
              <div key={key} className="preference-item">
                <div className="preference-info">
                  <h3>{key.charAt(0).toUpperCase() + key.slice(1)} Notifications</h3>
                  <p>Receive {key.toLowerCase()} notifications</p>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={() => handleToggle(key)}
                    disabled={isLoading}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="app-preferences">
          <h2>App Preferences</h2>
          <div className="preferences-list">
            <div className="preference-item">
              <div className="preference-info">
                <h3>Auto Launch</h3>
                <p>Start app when computer starts</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={autoLaunch}
                  onChange={handleAutoLaunchToggle}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>
        </div>

        <div className="profile-actions">
          <button className="logout-button" onClick={logout}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile; 