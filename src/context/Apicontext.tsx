import React, { createContext, useContext, useState, useEffect } from 'react';

// Create the shape of the context
interface ApiContextType {
  apiUrl: string | null;
  setApiUrl: (url: string) => Promise<void>;
  isUrlSet: boolean;
  isLoading: boolean;
}

// Create context
const ApiContext = createContext<ApiContextType | undefined>(undefined);

// Context provider component
export const ApiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiUrl, setApiUrlState] = useState<string | null>(null);
  const [isUrlSet, setIsUrlSet] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load the API URL from secure storage on mount
  useEffect(() => {
    const loadApiUrl = async () => {
      try {
        const url = await window.Electron.ipcRenderer.invoke('get-api-url');
        console.log('Loaded API URL:', url); // Debug log
        if (url && typeof url === 'string' && url.trim() !== '') {
          setApiUrlState(url);
          setIsUrlSet(true);
        } else {
          setApiUrlState(null);
          setIsUrlSet(false);
        }
      } catch (error) {
        console.error("Error loading API URL:", error);
        setApiUrlState(null);
        setIsUrlSet(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadApiUrl();
  }, []);

  const setApiUrl = async (url: string) => {
    try {
      await window.Electron.ipcRenderer.invoke('set-api-url', url);
      setApiUrlState(url);
      setIsUrlSet(true);
    } catch (error) {
      console.error("Error setting API URL:", error);
      throw error;
    }
  };

  return (
    <ApiContext.Provider value={{ apiUrl, setApiUrl, isUrlSet, isLoading }}>
      {children}
    </ApiContext.Provider>
  );
};

// Hook to consume context easily
export const useApiContext = () => {
  const context = useContext(ApiContext);
  if (context === undefined) {
    throw new Error("useApiContext must be used within an ApiProvider");
  }
  return context;
};
