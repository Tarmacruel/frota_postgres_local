import api from './client'

export const adminNotificationsAPI = {
  list: (params) => api.get('/admin-notifications', { params }),
  unreadCount: () => api.get('/admin-notifications/unread-count'),
  markAsRead: (id) => api.post(`/admin-notifications/${id}/read`),
}
