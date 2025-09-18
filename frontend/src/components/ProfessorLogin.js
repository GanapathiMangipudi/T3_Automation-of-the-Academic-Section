// src/components/ProfessorLogin.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_ROOT = process.env.REACT_APP_API || 'http://localhost:4000';

export default function ProfessorLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null);
  const navigate = useNavigate();

  async function handleLogin(e) {
    e.preventDefault();
    setMsg(null);

    try {
      const res = await fetch(`${API_ROOT}/auth/professor/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      // try parse json (temp echo returns json text)
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setMsg(body?.error || `Login failed (${res.status})`);
        return;
      }

      if (!body || !body.ok) {
        setMsg(body?.error || 'Login failed (no token)');
        return;
      }

      // store token and professor info
      localStorage.setItem('prof_token', body.token);
      localStorage.setItem('prof_username', body.prof?.username ?? username);
      localStorage.setItem('prof_department', body.prof?.department ?? '');

      // optional: decode token payload to inspect department (dev)
      try {
        const token = body.token;
        const payload = JSON.parse(atob(token.split('.')[1]));
        console.log('prof token payload', payload);
      } catch (e) { /* ignore */ }

      navigate('/professor-dashboard');
    } catch (err) {
      console.error('prof login error', err);
      setMsg('Network error (see console)');
    }
  }

return (
    <div style={{ maxWidth: 520, margin: 20 }}>
      <h2>Professor Login</h2>
      <form onSubmit={handleLogin}>
        <div>
          <label>Username</label><br/>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <label>Password</label><br/>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        {msg && <div style={{ color: "crimson", marginTop: 8 }}>{msg}</div>}
        <div style={{ marginTop: 12 }}>
          <button type="submit">Login</button>
        </div>
      </form>
    </div>
  );
}
