import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApiContext } from '../context/Apicontext';

const InitialRoute: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isUrlSet, isLoading: apiLoading } = useApiContext();

  // Show nothing while loading
  if (apiLoading || authLoading) {
    return null;
  }

  // If API URL is not set, go to setup
  if (!isUrlSet) {
    return <Navigate to="/setup" replace />;
  }

  // If not authenticated, go to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to="/profile" replace />;
};

export default InitialRoute; 