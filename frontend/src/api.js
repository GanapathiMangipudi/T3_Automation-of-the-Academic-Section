// src/api.js
import axios from 'axios';

// Create axios instance with base URL
const api = axios.create({
  baseURL: process.env.REACT_APP_API || 'http://localhost:4000',
  withCredentials: true, // send cookies if using cookie auth
});

// Attach JWT from localStorage if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// --- Attendance helpers ---

/**
 * Mark a student present for a course on a given date.
 */
export async function markPresent(course_id, student_id, dateStr) {
  try {
    const payload = { course_id, student_id, date: dateStr, status: 'present' };
    const resp = await api.post('/api/professors/attendance', payload);
    return resp.data;
  } catch (err) {
    if (err.response) {
      const e = new Error(`HTTP ${err.response.status}`);
      e.status = err.response.status;
      e.body = err.response.data;
      throw e;
    }
    throw err;
  }
}

/**
 * Mark a student absent for a course on a given date.
 */
export async function markAbsent(course_id, student_id, dateStr) {
  try {
    const payload = { course_id, student_id, date: dateStr, status: 'absent' };
    const resp = await api.post('/api/professors/attendance', payload);
    return resp.data;
  } catch (err) {
    if (err.response) {
      const e = new Error(`HTTP ${err.response.status}`);
      e.status = err.response.status;
      e.body = err.response.data;
      throw e;
    }
    throw err;
  }
}

// Keep default export for generic API usage
export default api;
