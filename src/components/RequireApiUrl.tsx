import React from 'react';
import { Navigate } from 'react-router-dom';
import { useApiContext } from '../context/Apicontext';

interface RequireApiUrlProps {
  children: React.ReactNode;
}

const RequireApiUrl: React.FC<RequireApiUrlProps> = ({ children }) => {
  const { isUrlSet } = useApiContext();

  if (!isUrlSet) {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
};

export default RequireApiUrl; 