"use client";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">MOS Maintenance</h1>
            </div>
            <div className="flex items-center space-x-4">
              <a href="/login" className="px-4 py-2 text-gray-600 hover:text-gray-900">
                Sign In
              </a>
              <a href="/setup" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                Get Started
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
            <span className="block">Vehicle Maintenance</span>
            <span className="block text-blue-600">Made Simple</span>
          </h1>
          <p className="mt-3 max-w-md mx-auto text-base text-gray-500 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
            Professional vehicle maintenance tracking and recommendations for automotive shops and fleet managers.
          </p>
          <div className="mt-5 max-w-md mx-auto sm:flex sm:justify-center md:mt-8">
            <div className="rounded-md shadow">
              <a href="/setup" className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 md:py-4 md:text-lg md:px-10">
                Start Free Trial
              </a>
            </div>
            <div className="mt-3 rounded-md shadow sm:mt-0 sm:ml-3">
              <a href="/login" className="w-full flex items-center justify-center px-8 py-3 border border-gray-300 text-base font-medium rounded-md text-blue-600 bg-white hover:bg-gray-50 md:py-4 md:text-lg md:px-10">
                Sign In
              </a>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-20">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold text-gray-900">
              Everything you need to manage vehicle maintenance
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500">
              Streamline your automotive business with our comprehensive maintenance management platform.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                🚗 Vehicle Tracking
              </h3>
              <p className="text-gray-500">
                Complete vehicle history and maintenance records. Track mileage, service intervals, and upcoming maintenance needs.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                🔧 Smart Recommendations
              </h3>
              <p className="text-gray-500">
                AI-powered maintenance recommendations based on vehicle age, mileage, and manufacturer specifications.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                👥 Customer Management
              </h3>
              <p className="text-gray-500">
                Manage customer information, vehicle ownership, and service history all in one centralized platform.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                📊 Analytics Dashboard
              </h3>
              <p className="text-gray-500">
                Real-time insights into your business performance, revenue tracking, and customer retention metrics.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                🔗 API Integration
              </h3>
              <p className="text-gray-500">
                Seamless integration with existing shop management systems, AutoFlow, Carfax, and other industry tools.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                📱 Mobile Ready
              </h3>
              <p className="text-gray-500">
                Access your data anywhere with our responsive design that works perfectly on desktop, tablet, and mobile.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-20 bg-blue-600 rounded-lg shadow-xl overflow-hidden">
          <div className="px-6 py-12 sm:px-12 sm:py-16 lg:flex lg:items-center lg:justify-between">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white">
                Ready to streamline your maintenance operations?
              </h2>
              <p className="mt-3 text-lg text-blue-200">
                Join hundreds of automotive professionals who trust MOS Maintenance for their business.
              </p>
            </div>
            <div className="mt-8 lg:mt-0 lg:flex-shrink-0">
              <div className="inline-flex rounded-md shadow">
                <a href="/setup" className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-blue-600 bg-white hover:bg-gray-50">
                  Get Started Today
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-between items-center">
            <p className="text-gray-500 text-sm">
              © 2025 MOS Maintenance MVP. All rights reserved.
            </p>
            <div className="flex space-x-6">
              <a href="/login" className="text-gray-500 hover:text-gray-900 text-sm">
                Sign In
              </a>
              <a href="/setup" className="text-gray-500 hover:text-gray-900 text-sm">
                Get Started
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}