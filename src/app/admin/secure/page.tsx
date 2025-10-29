'use client';

import { useState, useEffect } from 'react';

interface ApiKey {
  id: number;
  key: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt?: string;
  usageCount: number;
}

interface LoginResponse {
  success: boolean;
  adminToken?: string;
  message?: string;
  error?: string;
}

export default function SecureAdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminToken, setAdminToken] = useState<string>('');
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: ''
  });
  const [newKeyForm, setNewKeyForm] = useState({
    name: '',
    description: '',
    customKey: ''
  });
  const [showFullKey, setShowFullKey] = useState<number | null>(null);

  // Check if user is already authenticated (token in localStorage)
  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      setAdminToken(token);
      setIsAuthenticated(true);
      fetchApiKeys();
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/admin/secure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          username: loginForm.username,
          password: loginForm.password
        })
      });
      
      const data: LoginResponse = await response.json();
      if (data.success && data.adminToken) {
        setAdminToken(data.adminToken);
        setIsAuthenticated(true);
        localStorage.setItem('adminToken', data.adminToken);
        setMessage('Login successful!');
        setLoginForm({ username: '', password: '' });
        fetchApiKeys();
      } else {
        setMessage(data.error || 'Login failed');
      }
    } catch (error) {
      setMessage('Error during login');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    setAdminToken('');
    setIsAuthenticated(false);
    localStorage.removeItem('adminToken');
    setApiKeys([]);
    setMessage('');
  };

  const fetchApiKeys = async () => {
    if (!adminToken) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/admin/secure?action=list', {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      
      const data = await response.json();
      if (data.success) {
        setApiKeys(data.apiKeys);
      } else if (data.error === 'Unauthorized') {
        handleLogout();
        setMessage('Session expired. Please login again.');
      }
    } catch (error) {
      setMessage('Error fetching API keys');
    }
    setLoading(false);
  };

  const createApiKey = async () => {
    if (!adminToken) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/admin/secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          action: 'create',
          ...newKeyForm
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setMessage('API key created successfully!');
        setNewKeyForm({ name: '', description: '', customKey: '' });
        fetchApiKeys();
      } else if (data.error === 'Unauthorized') {
        handleLogout();
        setMessage('Session expired. Please login again.');
      } else {
        setMessage('Failed to create API key');
      }
    } catch (error) {
      setMessage('Error creating API key');
    }
    setLoading(false);
  };

  const toggleApiKey = async (id: number, isActive: boolean) => {
    if (!adminToken) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/admin/secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          action: 'update',
          id,
          updates: { is_active: !isActive }
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setMessage('API key updated successfully!');
        fetchApiKeys();
      } else if (data.error === 'Unauthorized') {
        handleLogout();
        setMessage('Session expired. Please login again.');
      } else {
        setMessage('Failed to update API key');
      }
    } catch (error) {
      setMessage('Error updating API key');
    }
    setLoading(false);
  };

  const deleteApiKey = async (id: number) => {
    if (!adminToken || !confirm('Are you sure you want to delete this API key?')) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/admin/secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          action: 'delete',
          id
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setMessage('API key deleted successfully!');
        fetchApiKeys();
      } else if (data.error === 'Unauthorized') {
        handleLogout();
        setMessage('Session expired. Please login again.');
      } else {
        setMessage('Failed to delete API key');
      }
    } catch (error) {
      setMessage('Error deleting API key');
    }
    setLoading(false);
  };

  const getFullApiKey = async (id: number) => {
    if (!adminToken) return;
    
    try {
      const response = await fetch('/api/admin/secure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          action: 'get-full-key',
          id
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setShowFullKey(id);
        // Copy to clipboard
        navigator.clipboard.writeText(data.fullKey);
        setMessage('Full API key copied to clipboard!');
      }
    } catch (error) {
      setMessage('Error retrieving full API key');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Admin Login
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Secure access to API key management
            </p>
          </div>
          
          {message && (
            <div className={`p-4 rounded ${
              message.includes('successful') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {message}
            </div>
          )}

          <form className="mt-8 space-y-6" onSubmit={handleLogin}>
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="username" className="sr-only">
                  Username
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Username"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({...loginForm, username: e.target.value})}
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="Password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">API Key Management</h1>
              <p className="text-gray-600">Secure admin panel for managing API keys</p>
            </div>
            <button
              onClick={handleLogout}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {message && (
          <div className={`mb-6 p-4 rounded ${
            message.includes('successful') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {message}
          </div>
        )}

        {/* Create New API Key */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Create New API Key</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
              <input
                type="text"
                value={newKeyForm.name}
                onChange={(e) => setNewKeyForm({...newKeyForm, name: e.target.value})}
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="Client Name"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <input
                type="text"
                value={newKeyForm.description}
                onChange={(e) => setNewKeyForm({...newKeyForm, description: e.target.value})}
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="Optional description"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Custom Key (Optional)</label>
              <input
                type="text"
                value={newKeyForm.customKey}
                onChange={(e) => setNewKeyForm({...newKeyForm, customKey: e.target.value})}
                className="w-full border border-gray-300 rounded px-3 py-2"
                placeholder="Leave empty for auto-generated key"
              />
            </div>
          </div>
          <button
            onClick={createApiKey}
            disabled={loading || !newKeyForm.name}
            className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create API Key'}
          </button>
        </div>

        {/* API Keys List */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">API Keys</h2>
          {apiKeys.length === 0 ? (
            <p className="text-gray-500">No API keys found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Key</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usage</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {apiKeys.map((key) => (
                    <tr key={key.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{key.name}</div>
                          {key.description && (
                            <div className="text-sm text-gray-500">{key.description}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                        {showFullKey === key.id ? (
                          <div className="bg-yellow-100 p-2 rounded">
                            <div className="text-xs text-gray-600 mb-1">Full API Key (copied to clipboard):</div>
                            <div className="break-all">{key.key}</div>
                            <button
                              onClick={() => setShowFullKey(null)}
                              className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                            >
                              Hide
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div className="font-mono">{key.key}</div>
                            <button
                              onClick={() => getFullApiKey(key.id)}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              Show Full Key
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          key.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {key.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {key.usageCount} requests
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(key.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => toggleApiKey(key.id, key.isActive)}
                          disabled={loading}
                          className={`px-3 py-1 rounded text-xs ${
                            key.isActive 
                              ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' 
                              : 'bg-green-100 text-green-800 hover:bg-green-200'
                          } disabled:opacity-50`}
                        >
                          {key.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => deleteApiKey(key.id)}
                          disabled={loading}
                          className="px-3 py-1 bg-red-100 text-red-800 rounded text-xs hover:bg-red-200 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
