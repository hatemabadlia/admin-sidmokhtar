// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import AdminAuth from './pages/AdminAuth';
import AdminDashboard from './pages/AdminDashboard';
import AdminRoute from './components/AdminRoute';
import AdminLessonUpload from './pages/AdminLessonUpload';
import AdminLessonsManage from './pages/AdminLessonsManage';
import AdminExamUpload from './pages/AdminExamUpload';
import AdminExamsManage from './pages/AdminExamsManage';
import AdminAccess from './pages/AdminAccess';
import AdminUsers from './pages/AdminUsers';
import AdminQuizzes from './pages/AdminQuizzes';
import AdminLive from './pages/AdminLive';
import AdminRevenue from './pages/AdminRevenue';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* لوحة الإدارة فقط — واجهة الطالب في مشروع sidmokhtar المستقل */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/library" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<AdminAuth />} />
        <Route
          path="/dashboard"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />
                <Route
          path="/lessons/manage"
          element={
            <AdminRoute>
              <AdminLessonsManage />
            </AdminRoute>
          }
        />
        <Route
          path="/lessons/upload"
          element={
            <AdminRoute>
              <AdminLessonUpload />
            </AdminRoute>
          }
        />
        <Route
          path="/exams/upload"
          element={
            <AdminRoute>
              <AdminExamUpload />
            </AdminRoute>
          }
        />
        <Route
          path="/exams/manage"
          element={
            <AdminRoute>
              <AdminExamsManage />
            </AdminRoute>
          }
        />
        <Route
          path="/quizzes"
          element={
            <AdminRoute>
              <AdminQuizzes />
            </AdminRoute>
          }
        />
        <Route
          path="/live"
          element={
            <AdminRoute>
              <AdminLive />
            </AdminRoute>
          }
        />
        <Route
          path="/access"
          element={
            <AdminRoute>
              <AdminAccess />
            </AdminRoute>
          }
        />
        <Route
          path="/revenue"
          element={
            <AdminRoute>
              <AdminRevenue />
            </AdminRoute>
          }
        />
        <Route
          path="/users"
          element={
            <AdminRoute>
              <AdminUsers />
            </AdminRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}