import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiContext } from '../context/Apicontext';
import '../css/ApiSetup.css';

const ApiSetup: React.FC = () => {
  const [inputUrl, setInputUrl] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { setApiUrl } = useApiContext();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await setApiUrl(inputUrl);
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="api-setup-container">
      <div className="api-setup-content">
        <h1>API Setup</h1>
        <form onSubmit={handleSubmit} className="api-setup-form">
          <div className="form-group">
            <label htmlFor="apiUrl">API URL</label>
            <input
              type="url"
              id="apiUrl"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="http://localhost:8000"
              required
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ApiSetup; 