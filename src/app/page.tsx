'use client';

import { useState } from 'react';

interface SlotData {
  date: string;
  time: string;
  gmt: string;
}

interface ApiResponse {
  success: boolean;
  data?: {
    total_slots: number;
    total_days: number;
    note: string;
    slots: SlotData[];
  };
  error?: string;
  message?: string;
}

export default function Home() {
  const [formData, setFormData] = useState({
    first_name: 'AliTEST',
    last_name: 'SyedTEST',
    email: 'ali+test@mm.ventures',
    phone: '5127673628',
    api_token: 'test-key-123'
  });
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/get-slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${formData.api_token}`
        },
        body: JSON.stringify({
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          phone: formData.phone
        })
      });

      const data: ApiResponse = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: 'Network Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Chili Piper Slot Scraper
          </h1>
          <p className="text-gray-600">
            Automatically scrape available meeting slots from Chili Piper
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-2">
                  First Name
                </label>
                <input
                  type="text"
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-2">
                  Last Name
                </label>
                <input
                  type="text"
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="api_token" className="block text-sm font-medium text-gray-700 mb-2">
                API Token
              </label>
              <input
                type="password"
                id="api_token"
                value={formData.api_token}
                onChange={(e) => setFormData({ ...formData, api_token: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your API token"
                required
              />
              <p className="mt-1 text-sm text-gray-500">
                Contact administrator for API token
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Scraping Slots...' : 'Get Available Slots'}
            </button>
          </form>
        </div>

        {result && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Results</h2>
            
            {result.success && result.data ? (
              <div>
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-green-800 font-medium">{result.data.note}</p>
                  <p className="text-green-700 text-sm mt-1">
                    Total Slots: {result.data.total_slots} | Total Days: {result.data.total_days}
                  </p>
                </div>

                {result.data.slots.length > 0 ? (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-3">Available Slots:</h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {result.data.slots.map((slot, index) => (
                        <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                          <div>
                            <span className="font-medium text-gray-900">{slot.date}</span>
                            <span className="text-gray-600 ml-2">{slot.time}</span>
                          </div>
                          <span className="text-sm text-gray-500">{slot.gmt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-600">No available slots found.</p>
                )}
              </div>
            ) : (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-800 font-medium">Error: {result.error}</p>
                {result.message && (
                  <p className="text-red-700 text-sm mt-1">{result.message}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
