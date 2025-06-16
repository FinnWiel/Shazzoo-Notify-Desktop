import React, { createContext, useContext, useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

interface User {
  id: number;
  email: string;
  name?: string;
  role?: string;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const loadStoredAuth = async () => {
      try {
        const { token: storedToken, userData } =
          await window.Electron.ipcRenderer.invoke("get-auth-data");
        // console.log("Loaded stored auth:", {
        //   token: storedToken ? "present" : "missing",
        //   userData: userData ? "present" : "missing",
        // });

        if (storedToken && userData) {
          // Verify token with /api/me endpoint
          const apiUrl = await window.Electron.ipcRenderer.invoke(
            "get-api-url"
          );
          if (!apiUrl) {
            throw new Error("API URL not set");
          }

          try {
            const response = await fetch(`${apiUrl}/api/me`, {
              headers: {
                Authorization: `Bearer ${storedToken}`,
              },
            });

            if (!response.ok) {
              throw new Error("Token validation failed");
            }

            const { user: currentUser } = await response.json();
            // Update stored user data with current data
            const updatedUserData = {
              id: currentUser.id,
              name: currentUser.name,
              email: currentUser.email,
            };

            // Update stored data
            await window.Electron.ipcRenderer.invoke("set-auth-data", {
              token: storedToken,
              user: updatedUserData,
            });

            setToken(storedToken);
            setUser(updatedUserData);
            setIsAuthenticated(true);
            // console.log("Auth state restored and verified successfully");
          } catch (error) {
            console.error("Token validation error:", error);
            // Clear invalid data
            await window.Electron.ipcRenderer.invoke("clear-auth-data");
            setToken(null);
            setUser(null);
            setIsAuthenticated(false);
          }
        } else {
          // If no stored data, ensure we're logged out
          setToken(null);
          setUser(null);
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error("Error loading stored auth:", error);
        // Clear invalid data
        await window.Electron.ipcRenderer.invoke("clear-auth-data");
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadStoredAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const apiUrl = await window.Electron.ipcRenderer.invoke("get-api-url");
      if (!apiUrl) {
        throw new Error("API URL not set");
      }

      const deviceId = localStorage.getItem("deviceId") || uuidv4();
      localStorage.setItem("deviceId", deviceId);

      // 🔥 This is the missing part:
      await window.Electron.ipcRenderer.invoke("set-device-id", deviceId);

      const response = await fetch(`${apiUrl}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          token: deviceId,
          device_type: "desktop",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Login failed");
      }

      const data = await response.json();
      const accessToken = data.token;
      // console.log("Login successful, storing auth data");

      const userData = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
      };

      await window.Electron.ipcRenderer.invoke("set-auth-data", {
        token: accessToken,
        user: userData,
      });
      // console.log("Auth data stored in electron store");

      setToken(accessToken);
      setUser(userData);
      setIsAuthenticated(true);
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      const apiUrl = await window.Electron.ipcRenderer.invoke("get-api-url");
      if (!apiUrl) {
        throw new Error("API URL not set");
      }

      const deviceId = localStorage.getItem("deviceId");
      if (!deviceId) {
        throw new Error("Device ID not found");
      }

      // Call logout endpoint with device ID
      const response = await fetch(`${apiUrl}/api/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: deviceId,
        }),
      });

      if (!response.ok) {
        console.error("Logout API call failed:", response.status);
      }

      // Clear local storage and state
      await window.Electron.ipcRenderer.invoke("clear-auth-data");
      setUser(null);
      setToken(null);
      setIsAuthenticated(false);
      console.log("Successfully logged out");
    } catch (error) {
      console.error("Error during logout:", error);
      // Still clear local data even if there's an error
      await window.Electron.ipcRenderer.invoke("clear-auth-data");
      setUser(null);
      setToken(null);
      setIsAuthenticated(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
