// Authentication utilities for the admin panel

class AuthManager {
    constructor() {
        this.token = localStorage.getItem('authToken');
        this.user = JSON.parse(localStorage.getItem('user') || 'null');
    }

    // Check if user is authenticated
    isAuthenticated() {
        return !!(this.token && this.user);
    }

    // Get current user
    getCurrentUser() {
        return this.user;
    }

    // Get auth token
    getToken() {
        return this.token;
    }

    // Check if user has specific role
    hasRole(role) {
        if (!this.user) return false;
        return this.user.role === role;
    }

    // Check if user is admin
    isAdmin() {
        return this.hasRole('ADMIN');
    }

    // Check if user is member or admin
    isMember() {
        return this.hasRole('MEMBER') || this.hasRole('ADMIN');
    }

    // Make authenticated API request
    async apiRequest(url, options = {}) {
        if (!this.isAuthenticated()) {
            throw new Error('User not authenticated');
        }

        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            }
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        const response = await fetch(url, mergedOptions);

        // If token is invalid, redirect to login
        if (response.status === 401 || response.status === 403) {
            this.logout();
            window.location.href = '/login.html';
            return;
        }

        return response;
    }

    // Login user
    async login(username, password) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username,
                    password
                })
            });

            const data = await response.json();

            if (data.success) {
                this.token = data.token;
                this.user = data.user;

                localStorage.setItem('authToken', this.token);
                localStorage.setItem('user', JSON.stringify(this.user));

                return {
                    success: true,
                    user: this.user
                };
            } else {
                return {
                    success: false,
                    error: data.error
                };
            }
        } catch (error) {
            return {
                success: false,
                error: 'Network error'
            };
        }
    }

    // Logout user
    async logout() {
        try {
            if (this.token) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.token = null;
            this.user = null;
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
        }
    }

    // Refresh user data
    async refreshUser() {
        try {
            const response = await this.apiRequest('/api/auth/me');
            if (response && response.ok) {
                const data = await response.json();
                this.user = data.user;
                localStorage.setItem('user', JSON.stringify(this.user));
                return this.user;
            }
        } catch (error) {
            console.error('Error refreshing user data:', error);
        }
        return null;
    }

    // Require authentication - redirect to login if not authenticated
    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = '/login.html';
            return false;
        }
        return true;
    }

    // Require admin role - redirect to login if not admin
    requireAdmin() {
        if (!this.requireAuth()) return false;
        if (!this.isAdmin()) {
            alert('Access denied. Admin privileges required.');
            return false;
        }
        return true;
    }

    // Require member or admin role
    requireMember() {
        if (!this.requireAuth()) return false;
        if (!this.isMember()) {
            alert('Access denied. Member privileges required.');
            return false;
        }
        return true;
    }
}

// Create global auth manager instance
window.authManager = new AuthManager();

// Auto-redirect to login if not authenticated (except on login page)
if (window.location.pathname !== '/login.html' && !window.authManager.isAuthenticated()) {
    window.location.href = '/login.html';
}

// Add logout functionality to any element with class 'logout-btn'
document.addEventListener('DOMContentLoaded', () => {
    const logoutButtons = document.querySelectorAll('.logout-btn');
    logoutButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            if (confirm('Are you sure you want to logout?')) {
                await window.authManager.logout();
                window.location.href = '/login.html';
            }
        });
    });
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthManager;
}