import "./App.css";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./views/Login";
import ApiSetup from "./views/ApiSetup";
import Profile from "./views/Profile";
import ProtectedRoute from "./components/ProtectedRoute";
import RequireApiUrl from "./components/RequireApiUrl";
import ThemeToggle from "./components/ThemeToggle";
import InitialRoute from "./components/InitialRoute";
import { ApiProvider } from "./context/Apicontext";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";

function App() {
  return (
    <Router>
      <ApiProvider>
        <ThemeProvider>
          <AuthProvider>
            <ThemeToggle />
            <Routes>
              <Route path="/" element={<InitialRoute />} />
              <Route
                path="/login"
                element={
                  <RequireApiUrl>
                    <Login />
                  </RequireApiUrl>
                }
              />
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                }
              />
              <Route path="/setup" element={<ApiSetup />} />
            </Routes>
          </AuthProvider>
        </ThemeProvider>
      </ApiProvider>
    </Router>
  );
}

export default App;
